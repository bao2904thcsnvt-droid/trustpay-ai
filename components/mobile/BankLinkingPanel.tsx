"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Fingerprint, Trash2 } from "lucide-react";
import { findInstitution, isPayeeInstitutionCode, PAYEE_INSTITUTIONS, type PayeeInstitutionCode } from "@/lib/payments/banks";
import { normalizeAccountNumber, sanitizeAccountName, validatePayeeAccount } from "@/lib/payments/vietqr-builder";
import {
  addLinkedAccount,
  completeLinkedAccount,
  removeLinkedAccount,
  setBalanceHidden,
  setDefaultSource,
  useHubState,
  verifyAppPin,
  type LinkedAccount,
} from "@/lib/hub/hub-store";
import { verifyDevicePasskey } from "@/lib/security/app-lock";
import { createClientId } from "@/lib/wallet/ledger";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { ToastNotification } from "@/components/layout/ToastNotice";

export interface BankLinkingPanelProps {
  balance: number;
  onToast: (toast: ToastNotification) => void;
}

type Pending =
  | { kind: "add"; account: LinkedAccount; makeDefault: boolean }
  | { kind: "complete"; id: string; accountNumber: string; label: string };

const TINT: Partial<Record<PayeeInstitutionCode, string>> = {
  PVCB: "from-sky-700 to-cyan-600",
  VCB: "from-emerald-800 to-emerald-600",
  MB: "from-indigo-800 to-blue-600",
  TCB: "from-rose-800 to-red-600",
  BIDV: "from-teal-800 to-cyan-700",
  ACB: "from-blue-900 to-sky-700",
  ICB: "from-blue-800 to-indigo-600",
  TPB: "from-violet-800 to-fuchsia-600",
  VBA: "from-amber-800 to-orange-600",
  MOMO: "from-[#a50064] to-[#d82d8b]",
};

const MAX_PIN_ATTEMPTS = 5;
const LOCK_MS = 30_000;

/**
 * Liên kết tài khoản ngân hàng & ví: thẻ trượt ngang, đặt mặc định, ẩn/hiện số dư, hủy liên kết,
 * thêm tài khoản mới (chuẩn hóa tên chủ TK, xác thực PIN/OTP mô phỏng hoặc Vân tay / FaceID).
 * Dữ liệu lưu bền vững trong `trustpay-ai.hub.v1` (localStorage), xóa khi Reset Demo.
 */
export default function BankLinkingPanel({ balance, onToast }: BankLinkingPanelProps) {
  const { t, money } = useI18n();
  const hub = useHubState();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState<PayeeInstitutionCode>("PVCB");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [error, setError] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [completeNumber, setCompleteNumber] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const lockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
    };
  }, []);

  const institution = findInstitution(code);
  const isWallet = institution?.kind === "EWALLET";
  const bankName = (account: LinkedAccount) => findInstitution(account.institutionCode)?.shortName ?? account.institutionCode;
  const cardLabel = (account: LinkedAccount) => t.hub.masked(bankName(account), account.last4);

  const resetVerify = () => {
    setPending(null);
    setPin("");
    setMessage(null);
    setAttempts(0);
  };

  const startAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeAccountNumber(number);
    if (!institution || validatePayeeAccount(normalized, institution) !== "OK") {
      setError(true);
      return;
    }
    setError(false);
    setPending({
      kind: "add",
      makeDefault,
      account: {
        id: createClientId("ACC"),
        institutionCode: institution.code,
        accountNumber: normalized,
        last4: normalized.slice(-4),
        holderName: sanitizeAccountName(holder),
        demo: false,
      },
    });
  };

  const startComplete = (account: LinkedAccount) => {
    const normalized = normalizeAccountNumber(completeNumber);
    if (validatePayeeAccount(normalized, findInstitution(account.institutionCode)) !== "OK") {
      setError(true);
      return;
    }
    setError(false);
    setPending({ kind: "complete", id: account.id, accountNumber: normalized, label: cardLabel(account) });
  };

  const finish = () => {
    if (!pending) return;
    if (pending.kind === "add") {
      addLinkedAccount(pending.account, pending.makeDefault);
      onToast({
        type: "success",
        title: t.mob.bank.linkedToast(cardLabel(pending.account)),
        description: t.mob.bank.linkedToastDesc,
      });
      setAdding(false);
      setNumber("");
      setHolder("");
    } else {
      completeLinkedAccount(pending.id, pending.accountNumber, "");
      onToast({ type: "success", title: t.mob.bank.completedToast(pending.label), description: t.mob.bank.linkedToastDesc });
      setCompleteId(null);
      setCompleteNumber("");
    }
    resetVerify();
  };

  const submitPin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked) {
      setMessage(t.mob.bank.lockedOut);
      return;
    }
    if (verifyAppPin(hub, pin)) {
      finish();
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setPin("");
    if (next >= MAX_PIN_ATTEMPTS) {
      setLocked(true);
      setMessage(t.mob.bank.lockedOut);
      if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
      lockTimerRef.current = window.setTimeout(() => {
        setLocked(false);
        setAttempts(0);
        setMessage(null);
      }, LOCK_MS);
    } else {
      setMessage(t.mob.bank.wrongPin(MAX_PIN_ATTEMPTS - next));
    }
  };

  const runBiometric = async () => {
    const id = hub.appLock.passkeyId;
    if (!id || verifying) return;
    setVerifying(true);
    const result = await verifyDevicePasskey(id);
    setVerifying(false);
    if (result.ok) {
      finish();
    } else if (result.reason !== "CANCELLED") {
      setMessage(t.mob.bank.biometricFailed);
    }
  };

  const unlink = (account: LinkedAccount) => {
    if (hub.linkedAccounts.length <= 1) {
      onToast({ type: "warning", title: t.mob.bank.unlinkLast, description: t.mob.bank.subtitle });
      return;
    }
    removeLinkedAccount(account.id);
    onToast({ type: "info", title: t.mob.bank.unlinkToast(cardLabel(account)), description: t.mob.bank.subtitle });
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none";

  return (
    <section id="tp-linked-accounts" aria-labelledby="tp-bank-title" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="tp-bank-title" className="text-base font-bold text-slate-900">
            {t.mob.bank.title}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{t.mob.bank.subtitle}</p>
        </div>
        <button
          type="button"
          aria-pressed={hub.balanceHidden}
          aria-label={hub.balanceHidden ? t.privacy.show : t.privacy.hide}
          title={hub.balanceHidden ? t.privacy.show : t.privacy.hide}
          onClick={() => setBalanceHidden(!hub.balanceHidden)}
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-100"
        >
          {hub.balanceHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {t.mob.bank.balanceLabel}:{" "}
        <span className="font-mono font-bold text-slate-900">{hub.balanceHidden ? t.privacy.hidden : money(balance)}</span>
      </p>

      <ul className="tp-scroll-x mt-3 flex snap-x gap-3 pb-1">
        {hub.linkedAccounts.map((account) => {
          const isDefault = account.id === hub.defaultSourceId;
          return (
            <li key={account.id} className="shrink-0 snap-start">
              <div
                className={`flex min-h-36 w-60 flex-col justify-between rounded-2xl bg-gradient-to-br p-3.5 text-white shadow-sm ${
                  TINT[account.institutionCode] ?? "from-slate-700 to-slate-500"
                } ${isDefault ? "ring-2 ring-white" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-extrabold">{bankName(account)}</span>
                  {isDefault && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-extrabold text-black uppercase">
                      {t.mob.bank.defaultBadge}
                    </span>
                  )}
                </div>
                <p className="font-mono text-lg font-bold tracking-wider">•••• {account.last4}</p>
                <p className="truncate text-[11px] text-white/85">{account.holderName || t.mob.bank.noHolder}</p>
                <div className="flex flex-wrap gap-1.5">
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultSource(account.id);
                        onToast({
                          type: "success",
                          title: t.toastR4.sourceChanged(cardLabel(account)),
                          description: t.toastR4.sourceChangedDesc,
                        });
                      }}
                      className="min-h-9 cursor-pointer rounded-lg bg-white/20 px-2.5 text-[11px] font-bold hover:bg-white/30"
                    >
                      {t.hub.setDefault}
                    </button>
                  )}
                  {account.accountNumber === "" && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompleteId(completeId === account.id ? null : account.id);
                        setError(false);
                      }}
                      className="min-h-9 cursor-pointer rounded-lg bg-white/20 px-2.5 text-[11px] font-bold hover:bg-white/30"
                    >
                      {t.mob.bank.completeNumber}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => unlink(account)}
                    aria-label={`${t.mob.bank.unlink}: ${cardLabel(account)}`}
                    title={t.mob.bank.unlink}
                    className="ml-auto inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg bg-black/30 hover:bg-black/50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {completeId && !pending && (
        <div className="mt-3 flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3">
          <input
            value={completeNumber}
            inputMode="numeric"
            maxLength={24}
            autoComplete="off"
            aria-label={t.mob.bank.accountNo}
            placeholder={t.mob.bank.accountNo}
            onChange={(event) => setCompleteNumber(event.target.value)}
            className={`${inputClass} min-w-0 flex-1 font-mono`}
          />
          <button
            type="button"
            onClick={() => {
              const account = hub.linkedAccounts.find((item) => item.id === completeId);
              if (account) startComplete(account);
            }}
            className="min-h-11 shrink-0 cursor-pointer rounded-xl bg-amber-500 px-3 text-xs font-bold text-black"
          >
            {t.mob.bank.next}
          </button>
        </div>
      )}

      {!adding && !pending && (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setError(false);
          }}
          className="mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-sm font-bold"
          style={{ backgroundColor: "#ffffff", color: "#000000" }}
        >
          + {t.mob.bank.addNew}
        </button>
      )}

      {adding && !pending && (
        <form onSubmit={startAdd} className="mt-3 space-y-2.5 rounded-2xl border border-slate-200 p-3">
          <p className="text-sm font-bold text-slate-900">{t.mob.bank.addNew}</p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t.mob.bank.chooseBank}</span>
            <select
              value={code}
              onChange={(event) => {
                if (isPayeeInstitutionCode(event.target.value)) setCode(event.target.value);
              }}
              className={`${inputClass} cursor-pointer`}
            >
              {PAYEE_INSTITUTIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.shortName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              {isWallet ? t.mob.bank.accountNoWallet : t.mob.bank.accountNo}
            </span>
            <input
              value={number}
              inputMode="numeric"
              maxLength={24}
              autoComplete="off"
              onChange={(event) => setNumber(event.target.value)}
              className={`${inputClass} font-mono`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t.mob.bank.holder}</span>
            <input
              value={holder}
              maxLength={50}
              autoComplete="off"
              onChange={(event) => setHolder(event.target.value)}
              className={`${inputClass} uppercase`}
            />
            <span className="mt-1 block text-[11px] text-slate-500">{t.mob.bank.holderPreview(sanitizeAccountName(holder))}</span>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(event) => setMakeDefault(event.target.checked)}
              className="h-5 w-5 accent-white"
            />
            {t.mob.bank.makeDefault}
          </label>
          {error && <p className="text-xs font-semibold text-rose-600">{t.mob.bank.invalid}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-12 flex-1 cursor-pointer rounded-full text-sm font-bold"
              style={{ backgroundColor: "#ffffff", color: "#000000" }}
            >
              {t.mob.bank.next}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-12 cursor-pointer rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700"
            >
              {t.mob.bank.cancel}
            </button>
          </div>
        </form>
      )}

      {pending && (
        <form onSubmit={submitPin} className="mt-3 space-y-2.5 rounded-2xl border border-slate-200 p-3">
          <p className="text-sm font-bold text-slate-900">{t.mob.bank.verifyTitle}</p>
          <p className="text-[11px] leading-relaxed text-slate-500">{t.mob.bank.verifyDesc}</p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t.mob.bank.pinLabel}</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              disabled={locked}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
            />
          </label>
          {message && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={pin.length !== 6 || locked}
            className="min-h-12 w-full cursor-pointer rounded-full text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "#ffffff", color: "#000000" }}
          >
            {t.mob.bank.confirm}
          </button>
          {hub.appLock.passkeyId && (
            <button
              type="button"
              disabled={verifying}
              onClick={() => void runBiometric()}
              className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-300 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              <Fingerprint className="h-5 w-5" />
              {t.mob.bank.biometric}
            </button>
          )}
          <button
            type="button"
            onClick={resetVerify}
            className="min-h-11 w-full cursor-pointer text-xs font-semibold text-slate-500 underline-offset-2 hover:underline"
          >
            {t.mob.bank.back}
          </button>
        </form>
      )}
    </section>
  );
}

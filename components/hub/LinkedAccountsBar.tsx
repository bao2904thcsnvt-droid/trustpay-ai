"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus, Wallet, X } from "lucide-react";
import { findInstitution, PAYEE_INSTITUTIONS, isPayeeInstitutionCode, type PayeeInstitutionCode } from "@/lib/payments/banks";
import { normalizeAccountNumber, sanitizeAccountName, validatePayeeAccount } from "@/lib/payments/vietqr-builder";
import {
  addLinkedAccount,
  removeLinkedAccount,
  setDefaultSource,
  type LinkedAccount,
} from "@/lib/hub/hub-store";
import { createClientId } from "@/lib/wallet/ledger";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface LinkedAccountsBarProps {
  accounts: LinkedAccount[];
  defaultSourceId: string;
  onSourceChanged: (label: string) => void;
  onAccountAdded: (label: string) => void;
}

const BANK_TINT: Partial<Record<PayeeInstitutionCode, string>> = {
  PVCB: "from-sky-600 to-cyan-500",
  VCB: "from-emerald-700 to-emerald-500",
  MB: "from-indigo-700 to-blue-500",
  TCB: "from-rose-700 to-red-500",
  BIDV: "from-teal-700 to-cyan-600",
  ACB: "from-blue-800 to-sky-600",
  ICB: "from-blue-700 to-indigo-500",
  TPB: "from-violet-700 to-fuchsia-500",
  MOMO: "from-[#a50064] to-[#d82d8b]",
};

export function linkedAccountLabel(account: LinkedAccount, masked: (bank: string, last4: string) => string): string {
  const institution = findInstitution(account.institutionCode);
  return masked(institution?.shortName ?? account.institutionCode, account.last4);
}

/** Thanh thẻ ngang "Tài khoản & Ví liên kết" — chọn nguồn tiền mặc định, thêm thẻ / tài khoản mới. */
export default function LinkedAccountsBar({ accounts, defaultSourceId, onSourceChanged, onAccountAdded }: LinkedAccountsBarProps) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState<PayeeInstitutionCode>("VCB");
  const [accountNumber, setAccountNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [error, setError] = useState(false);

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const institution = findInstitution(code);
    const normalized = normalizeAccountNumber(accountNumber);
    if (!institution || validatePayeeAccount(normalized, institution) !== "OK") {
      setError(true);
      return;
    }
    const account: LinkedAccount = {
      id: createClientId("ACC"),
      institutionCode: institution.code,
      accountNumber: normalized,
      last4: normalized.slice(-4),
      holderName: sanitizeAccountName(holder),
      demo: false,
    };
    addLinkedAccount(account, makeDefault);
    onAccountAdded(linkedAccountLabel(account, t.hub.masked));
    setAdding(false);
    setAccountNumber("");
    setHolder("");
    setError(false);
  };

  return (
    <section id="tp-linked-accounts" aria-labelledby="tp-linked-title" className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="tp-linked-title" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Wallet className="h-4 w-4 text-[#a50064]" />
            {t.hub.title}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{t.hub.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-xs font-bold text-[#a50064] hover:bg-pink-100"
        >
          <Plus className="h-4 w-4" />
          {t.hub.add}
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-3 text-xs text-slate-600">
          Chưa liên kết tài khoản ngân hàng thật nào — bấm <strong className="font-semibold text-[#a50064]">{t.hub.add}</strong> để liên kết ngay.
        </p>
      ) : (
      <ul className="tp-scroll-x mt-3 flex snap-x gap-3 pb-1">
        {accounts.map((account) => {
          const institution = findInstitution(account.institutionCode);
          const isDefault = account.id === defaultSourceId;
          const label = linkedAccountLabel(account, t.hub.masked);
          return (
            <li key={account.id} className="shrink-0 snap-start">
              <div
                className={`relative flex h-28 w-52 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-3 text-white shadow-sm ${
                  BANK_TINT[account.institutionCode] ?? "from-slate-700 to-slate-500"
                } ${isDefault ? "ring-4 ring-amber-300" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-extrabold">{institution?.shortName ?? account.institutionCode}</span>
                  <span className="flex gap-1">
                    {account.demo && (
                      <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-bold uppercase">{t.hub.demoBadge}</span>
                    )}
                    {isDefault && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-900 uppercase">
                        <Check className="h-3 w-3" />
                        {t.hub.defaultBadge}
                      </span>
                    )}
                  </span>
                </div>
                <p className="font-mono text-base font-bold tracking-wider">•••• {account.last4}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-white/85">{account.holderName || "—"}</span>
                  {!isDefault ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultSource(account.id);
                        onSourceChanged(label);
                      }}
                      className="shrink-0 cursor-pointer rounded-lg bg-white/20 px-2 py-1 text-[10px] font-bold hover:bg-white/30"
                    >
                      {t.hub.setDefault}
                    </button>
                  ) : (
                    accounts.length > 1 &&
                    !account.demo && (
                      <span className="sr-only">{t.hub.defaultBadge}</span>
                    )
                  )}
                </div>
                {!account.demo && !isDefault && (
                  <button
                    type="button"
                    onClick={() => removeLinkedAccount(account.id)}
                    aria-label={`${t.hub.remove} ${label}`}
                    title={t.hub.remove}
                    className="absolute top-1 right-1 hidden h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-black/25 text-white hover:bg-black/40 sm:inline-flex"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
          <p className="text-xs font-bold text-slate-800 sm:col-span-3">{t.hub.addTitle}</p>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.hub.bank}</span>
            <select
              value={code}
              onChange={(event) => {
                if (isPayeeInstitutionCode(event.target.value)) setCode(event.target.value);
              }}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#d82d8b] focus:outline-none"
            >
              {PAYEE_INSTITUTIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} — {item.shortName}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.hub.account}</span>
            <input
              value={accountNumber}
              inputMode="numeric"
              maxLength={24}
              autoComplete="off"
              onChange={(event) => setAccountNumber(event.target.value)}
              className="tp-code w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#d82d8b] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.hub.holder}</span>
            <input
              value={holder}
              maxLength={50}
              autoComplete="off"
              onChange={(event) => setHolder(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 uppercase focus:border-[#d82d8b] focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-3">
            <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} className="h-4 w-4 accent-[#a50064]" />
            {t.hub.makeDefault}
          </label>
          {error && <p className="text-[11px] font-semibold text-rose-700 sm:col-span-3">{t.hub.invalid}</p>}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
            <button type="submit" className="cursor-pointer rounded-xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2 text-xs font-bold text-white">
              {t.hub.save}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              {t.hub.cancel}
            </button>
            <span className="text-[10px] text-slate-400">{t.hub.localOnly}</span>
          </div>
        </form>
      )}
    </section>
  );
}

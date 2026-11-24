"use client";

import { useState, type ReactNode } from "react";
import { findInstitution } from "@/lib/payments/banks";
import { setDefaultSource, type LinkedAccount } from "@/lib/hub/hub-store";
import { parseMoneyInput } from "@/lib/wallet/format";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface InterbankPanelProps {
  accounts: LinkedAccount[];
  defaultSourceId: string;
  /** Số dư ví hợp nhất (để kiểm tra số tiền rút). */
  balance: number;
  balanceHidden: boolean;
  /** Rút về tài khoản chính chủ đã liên kết (đã có STK đầy đủ). */
  onWithdraw: (account: LinkedAccount, amount: number) => void;
  /** Phần chỉ hiện ở tab Chuyển tiền (Copilot, Danh bạ Tin cậy…). */
  transferExtras?: ReactNode;
  /** Biểu mẫu phân tích + kết quả AI + mã VietQR dùng chung cho cả 2 tab. */
  children: ReactNode;
}

type XferTab = "transfer" | "withdraw";
type FundSource = "unified" | "momo";

const QUICK_AMOUNTS = [100_000, 500_000, 1_000_000];

/**
 * Chuyển tiền & Rút tiền liên ngân hàng 24/7 (Napas) — non-custodial: AI quét rủi ro trước, sau đó
 * sinh mã VietQR EMVCo + Deep Link mở app ngân hàng / MoMo để chuyển thật.
 */
export default function InterbankPanel({
  accounts,
  defaultSourceId,
  balance,
  balanceHidden,
  onWithdraw,
  transferExtras,
  children,
}: InterbankPanelProps) {
  const { t, money } = useI18n();
  const [tab, setTab] = useState<XferTab>("transfer");
  const [fund, setFund] = useState<FundSource>("unified");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const receivable = accounts.filter((account) => account.accountNumber !== "");
  const preferred = receivable.find((account) => account.id === defaultSourceId) ?? receivable[0] ?? null;
  const selected = receivable.find((account) => account.id === pickedId) ?? preferred;
  const amount = parseMoneyInput(amountText);

  const label = (account: LinkedAccount) => {
    const institution = findInstitution(account.institutionCode);
    return t.hub.masked(institution?.shortName ?? account.institutionCode, account.last4);
  };

  const submitWithdraw = () => {
    if (!selected) {
      setError(t.mob.xfer.noAccountPicked);
      return;
    }
    if (amount <= 0) {
      setError(t.mob.xfer.invalidAmount);
      return;
    }
    if (amount > balance) {
      setError(t.mob.xfer.overBalance(money(balance)));
      return;
    }
    setError(null);
    onWithdraw(selected, amount);
  };

  const tabButton = (id: XferTab, text: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`min-h-12 flex-1 cursor-pointer rounded-xl px-2 text-xs font-bold transition-all ${
        tab === id ? "bg-white text-black shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
      style={tab === id ? { backgroundColor: "#ffffff", color: "#000000" } : undefined}
    >
      {text}
    </button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        role="tablist"
        aria-label={t.mob.xfer.tabsLabel}
        className="flex gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1"
      >
        {tabButton("transfer", t.mob.xfer.tabTransfer)}
        {tabButton("withdraw", t.mob.xfer.tabWithdraw)}
      </div>

      {tab === "transfer" ? (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">{t.mob.xfer.source}</span>
              <select
                value={defaultSourceId}
                onChange={(event) => setDefaultSource(event.target.value)}
                className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-900 focus:outline-none"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {label(account)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1.5 text-[11px] text-slate-500">{t.mob.xfer.sourceHint}</p>
          </section>
          {transferExtras}
        </>
      ) : (
        <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t.mob.xfer.withdrawFrom}</span>
            <select
              value={fund}
              onChange={(event) => setFund(event.target.value === "momo" ? "momo" : "unified")}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-900 focus:outline-none"
            >
              <option value="unified">{t.mob.xfer.srcUnified}</option>
              <option value="momo">{t.mob.xfer.srcMomo}</option>
            </select>
            <span className="mt-1 block font-mono text-xs text-slate-500">
              {balanceHidden ? t.privacy.hidden : money(balance)}
            </span>
          </label>

          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-slate-600">{t.mob.xfer.pickAccount}</legend>
            {receivable.length === 0 && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {t.mob.xfer.noAccounts}
              </p>
            )}
            <div className="grid grid-cols-1 gap-2">
              {accounts.map((account) => {
                const usable = account.accountNumber !== "";
                const isSelected = usable && selected?.id === account.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    disabled={!usable}
                    aria-pressed={isSelected}
                    onClick={() => setPickedId(account.id)}
                    className={`flex min-h-14 w-full cursor-pointer flex-col items-start justify-center rounded-2xl border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      isSelected ? "border-white ring-2 ring-white/70" : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <span className="text-sm font-bold text-slate-900">{label(account)}</span>
                    <span className="text-[11px] text-slate-500">
                      {usable ? account.holderName || t.mob.bank.noHolder : t.mob.xfer.needFull}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{t.mob.xfer.amount}</span>
            <input
              value={amountText}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              onChange={(event) => {
                setAmountText(event.target.value);
                setError(null);
              }}
              placeholder="500.000"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 font-mono text-lg text-slate-900 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setAmountText(String(value));
                  setError(null);
                }}
                className="min-h-11 cursor-pointer rounded-full border border-slate-300 px-3.5 font-mono text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                {money(value)}
              </button>
            ))}
            <button
              type="button"
              disabled={balance <= 0}
              onClick={() => {
                setAmountText(String(Math.floor(balance)));
                setError(null);
              }}
              className="min-h-11 cursor-pointer rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              {t.mob.xfer.all}
            </button>
          </div>

          <p className="text-xs font-bold text-emerald-600">{t.mob.xfer.fee}</p>
          <p className="text-[11px] leading-relaxed text-slate-500">{t.mob.xfer.aiHint}</p>
          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submitWithdraw}
            disabled={receivable.length === 0}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "#ffffff", color: "#000000", boxShadow: "0 0 22px rgba(255,255,255,0.28)" }}
          >
            {t.mob.xfer.withdrawCta}
          </button>
        </section>
      )}

      <h2 className="px-1 text-xs font-bold tracking-wide text-slate-500 uppercase">{t.mob.xfer.resultTitle}</h2>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}

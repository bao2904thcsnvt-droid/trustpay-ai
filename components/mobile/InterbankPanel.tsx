"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { findInstitution } from "@/lib/payments/banks";
import { setDefaultSource, type LinkedAccount } from "@/lib/hub/hub-store";
import { parseMoneyInput } from "@/lib/wallet/format";
import { useI18n } from "@/components/i18n/I18nProvider";

export type InterbankTab = "transfer" | "withdraw";

export interface InterbankPanelProps {
  accounts: LinkedAccount[];
  defaultSourceId: string;
  /** Số dư ví hợp nhất (để kiểm tra số tiền rút). */
  balance: number;
  balanceHidden: boolean;
  tab: InterbankTab;
  onTabChange: (tab: InterbankTab) => void;
  /** Rút về tài khoản chính chủ đã liên kết (đã có STK đầy đủ). */
  onWithdraw: (account: LinkedAccount, amount: number) => void;
  /** Hiện ngay dưới chọn nguồn tiền ở tab Chuyển tiền (vd Danh bạ Tin cậy — chuyển 1 chạm). */
  beforeForm?: ReactNode;
  /** Hiện sau kết quả ở tab Chuyển tiền (vd AI Copilot nói lệnh). */
  afterForm?: ReactNode;
  /** Biểu mẫu phân tích + kết quả AI + mã VietQR dùng chung cho cả 2 tab. */
  children: ReactNode;
}

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
  tab,
  onTabChange,
  onWithdraw,
  beforeForm,
  afterForm,
  children,
}: InterbankPanelProps) {
  const { t, money } = useI18n();
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

  const tabs: { id: InterbankTab; title: string; sub: string; Icon: typeof ArrowUpRight }[] = [
    { id: "transfer", title: t.xferShort.transfer, sub: t.xferShort.transferSub, Icon: ArrowUpRight },
    { id: "withdraw", title: t.xferShort.withdraw, sub: t.xferShort.withdrawSub, Icon: ArrowDownToLine },
  ];

  const field = "w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-[15px] text-slate-900 focus:outline-none";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div role="tablist" aria-label={t.mob.xfer.tabsLabel} className="tp-xtabs">
        {tabs.map(({ id, title, sub, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTabChange(id)}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 text-left">
              <span className="block truncate text-[15px] font-bold">{title}</span>
              <span className="block truncate text-xs opacity-75">{sub}</span>
            </span>
          </button>
        ))}
      </div>

      {tab === "transfer" ? (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">{t.mob.xfer.source}</span>
              <select
                value={defaultSourceId}
                onChange={(event) => setDefaultSource(event.target.value)}
                className={`${field} cursor-pointer`}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {label(account)}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1.5 text-xs text-slate-500">{t.mob.xfer.sourceHint}</p>
          </section>
          {beforeForm}
        </>
      ) : (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">{t.mob.xfer.withdrawFrom}</span>
            <select
              value={fund}
              onChange={(event) => setFund(event.target.value === "momo" ? "momo" : "unified")}
              className={`${field} cursor-pointer`}
            >
              <option value="unified">{t.mob.xfer.srcUnified}</option>
              <option value="momo">{t.mob.xfer.srcMomo}</option>
            </select>
            <span className="tp-num mt-1.5 block text-sm font-semibold text-slate-700">
              {balanceHidden ? t.privacy.hidden : money(balance)}
            </span>
          </label>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-slate-600">{t.mob.xfer.pickAccount}</legend>
            {receivable.length === 0 && (
              <p className="mb-2 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
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
                    className={`tp-pick ${isSelected ? "is-selected" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="tp-num block truncate text-[15px] font-semibold text-slate-900">{label(account)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {usable ? account.holderName || t.mob.bank.noHolder : t.mob.xfer.needFull}
                      </span>
                    </span>
                    {isSelected && <Check className="h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">{t.mob.xfer.amount}</span>
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
              className={`${field} tp-num text-xl font-semibold`}
            />
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setAmountText(String(value));
                  setError(null);
                }}
                className="tp-chip-amount tp-num"
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
              className="tp-chip-amount disabled:opacity-50"
            >
              {t.mob.xfer.all}
            </button>
          </div>

          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t.mob.xfer.fee}
          </p>
          <p className="text-xs leading-relaxed text-slate-500">{t.mob.xfer.aiHint}</p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-rose-600">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submitWithdraw}
            disabled={receivable.length === 0}
            className="tp-primary-btn disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.mob.xfer.withdrawCta}
          </button>
        </section>
      )}

      <div className="flex min-w-0 flex-col gap-4">{children}</div>

      {tab === "transfer" && afterForm}
    </div>
  );
}

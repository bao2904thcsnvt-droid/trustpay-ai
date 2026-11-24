"use client";

import { useState, type FormEvent } from "react";
import { Contact, ShieldCheck, Trash2 } from "lucide-react";
import { findInstitution } from "@/lib/payments/banks";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";
import { parseMoneyInput } from "@/lib/wallet/format";
import { removeTrustedPayee, type PayeeRelation, type TrustedPayee } from "@/lib/hub/hub-store";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface TrustedPayeesProps {
  payees: TrustedPayee[];
  /** `autoSubmit` = phân tích ngay để hiện mã VietQR (chuyển 1 chạm). */
  onPick: (payee: TrustedPayee, amount: number | null, memo: string, autoSubmit: boolean) => void;
  highlighted?: boolean;
}

const RELATION_EMOJI: Record<PayeeRelation, string> = {
  FAMILY: "👪",
  SHOP: "☕",
  LANDLORD: "🏠",
  FRIEND: "🤝",
  OTHER: "👤",
};

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000];

/** "Danh bạ Tin cậy (Trusted Payees — Chuyển 1 chạm)". */
export default function TrustedPayees({ payees, onPick, highlighted = false }: TrustedPayeesProps) {
  const { t, money } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState(false);
  const selected = payees.find((payee) => payee.id === selectedId) ?? null;

  const submit = (autoSubmit: boolean) => {
    if (!selected) return;
    const amount = parseMoneyInput(amountText);
    if (autoSubmit && amount <= 0) {
      setError(true);
      return;
    }
    setError(false);
    onPick(selected, amount > 0 ? amount : null, memo.trim(), autoSubmit);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(true);
  };

  return (
    <section
      id="tp-trusted-payees"
      aria-labelledby="tp-payees-title"
      className={`rounded-3xl border border-emerald-200 bg-white p-4 shadow-xs ${highlighted ? "tp-highlight" : ""}`}
    >
      <h2 id="tp-payees-title" className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Contact className="h-4 w-4 text-emerald-600" />
        {t.payees.title}
      </h2>
      <p className="mt-0.5 text-[11px] text-slate-500">{t.payees.subtitle}</p>

      {payees.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
          {t.payees.empty}
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {payees.map((payee) => {
            const institution = findInstitution(payee.institutionCode);
            const isSelected = payee.id === selectedId;
            return (
              <li key={payee.id} className="relative">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedId(isSelected ? null : payee.id);
                    setError(false);
                  }}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 pr-9 text-left transition-all ${
                    isSelected ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200" : "border-slate-200 bg-slate-50 hover:border-emerald-300"
                  }`}
                >
                  <span aria-hidden="true" className="text-2xl">
                    {RELATION_EMOJI[payee.relation]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-slate-900">{payee.label}</span>
                      {payee.demo && (
                        <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 uppercase">
                          {t.payees.demoBadge}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {t.payees.relation[payee.relation]} · {institution?.shortName ?? payee.institutionCode} ·{" "}
                      <span className="font-mono">{maskRecipientForDisplay(payee.accountNumber)}</span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeTrustedPayee(payee.id);
                    if (isSelected) setSelectedId(null);
                  }}
                  aria-label={`${t.payees.remove}: ${payee.label}`}
                  title={t.payees.remove}
                  className="absolute top-1/2 right-1.5 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-bold text-emerald-900">
            {t.payees.selected(selected.label)} · {selected.accountName || "—"}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.payees.amountLabel}</span>
              <input
                value={amountText}
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                onChange={(event) => setAmountText(event.target.value)}
                placeholder="200.000"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-base text-slate-900 focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.payees.memoLabel}</span>
              <input
                value={memo}
                maxLength={40}
                autoComplete="off"
                onChange={(event) => setMemo(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">{t.payees.quickPick}</span>
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setAmountText(String(amount))}
                className="cursor-pointer rounded-full border border-emerald-200 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {money(amount)}
              </button>
            ))}
          </div>
          {error && <p className="text-[11px] font-semibold text-rose-700">{t.payees.invalidAmount}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
            >
              <ShieldCheck className="h-4 w-4" />
              {t.payees.send}
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {t.payees.fillOnly}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Contact } from "lucide-react";
import { findInstitution } from "@/lib/payments/banks";
import type { PayeeDetails } from "@/lib/payments/vietqr-builder";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";
import { addTrustedPayee, PAYEE_RELATIONS, type PayeeRelation } from "@/lib/hub/hub-store";
import { createClientId } from "@/lib/wallet/ledger";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface SaveTrustedPayeeCtaProps {
  /** Người nhận vừa được Lá chắn AI đánh giá AN TOÀN (đã khóa theo đúng STK được phân tích). */
  payee: PayeeDetails;
  /** Tên gợi nhớ đề xuất (vd tên chủ tài khoản). */
  suggestedLabel: string;
  onSaved: (label: string) => void;
}

/** Nút "+ Lưu vào danh bạ tin cậy" hiện sau mỗi lần chuyển an toàn — lần sau chỉ cần 1 chạm. */
export default function SaveTrustedPayeeCta({ payee, suggestedLabel, onSaved }: SaveTrustedPayeeCtaProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(suggestedLabel.slice(0, 40));
  const [relation, setRelation] = useState<PayeeRelation>("OTHER");
  const institution = findInstitution(payee.institutionCode);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanLabel = label.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!cleanLabel) return;
    addTrustedPayee({
      id: createClientId("PAY"),
      label: cleanLabel,
      relation,
      institutionCode: payee.institutionCode,
      accountNumber: payee.accountNumber,
      accountName: payee.accountName,
      demo: false,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
    setOpen(false);
    onSaved(cleanLabel);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 transition-colors hover:border-emerald-400 hover:bg-emerald-100"
      >
        <Contact className="h-4 w-4 shrink-0" />
        {t.payees.saveCta}
      </button>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
      <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
        <Contact className="h-4 w-4 shrink-0" />
        {t.payees.saveTitle}
      </p>
      <p className="text-[11px] text-emerald-900/80">
        {institution?.shortName ?? payee.institutionCode} ·{" "}
        <span className="font-mono">{maskRecipientForDisplay(payee.accountNumber)}</span>
        {payee.accountName ? ` · ${payee.accountName}` : ""}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.payees.labelInput}</span>
          <input
            value={label}
            maxLength={40}
            autoComplete="off"
            required
            onChange={(event) => setLabel(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.payees.relationInput}</span>
          <select
            value={relation}
            onChange={(event) => {
              const next = PAYEE_RELATIONS.find((item) => item === event.target.value);
              if (next) setRelation(next);
            }}
            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
          >
            {PAYEE_RELATIONS.map((item) => (
              <option key={item} value={item}>
                {t.payees.relation[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={!label.trim()}
          className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.payees.saveConfirm}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          {t.hub.cancel}
        </button>
      </div>
    </form>
  );
}

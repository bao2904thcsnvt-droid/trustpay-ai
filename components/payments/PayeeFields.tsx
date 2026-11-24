"use client";

import { Landmark, X } from "lucide-react";
import { findInstitution, PAYEE_INSTITUTIONS, isPayeeInstitutionCode, type PayeeInstitutionCode } from "@/lib/payments/banks";
import {
  normalizeAccountNumber,
  validatePayeeAccount,
  type PayeeDetails,
} from "@/lib/payments/vietqr-builder";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Bản nháp người nhận trong biểu mẫu (chưa kiểm tra). */
export interface PayeeDraft {
  institutionCode: PayeeInstitutionCode | "";
  accountNumber: string;
  accountName: string;
}

export const EMPTY_PAYEE_DRAFT: PayeeDraft = { institutionCode: "", accountNumber: "", accountName: "" };

export type PayeeDraftStatus =
  | { state: "EMPTY" }
  | { state: "INVALID"; message: string }
  | { state: "READY"; payee: PayeeDetails };

/** Kiểm tra bản nháp: chưa chọn ngân hàng → EMPTY; chọn rồi nhưng STK sai → INVALID. */
export function resolvePayeeDraft(
  draft: PayeeDraft,
  messages: { invalidBank: string; invalidWallet: string },
): PayeeDraftStatus {
  if (!draft.institutionCode) {
    return { state: "EMPTY" };
  }
  const institution = findInstitution(draft.institutionCode);
  const accountNumber = normalizeAccountNumber(draft.accountNumber);
  const validation = validatePayeeAccount(accountNumber, institution);
  if (!institution || validation !== "OK") {
    return {
      state: "INVALID",
      message: institution?.kind === "EWALLET" ? messages.invalidWallet : messages.invalidBank,
    };
  }
  return {
    state: "READY",
    payee: { institutionCode: institution.code, accountNumber, accountName: draft.accountName.trim() },
  };
}

export interface PayeeFieldsProps {
  draft: PayeeDraft;
  onChange: (draft: PayeeDraft) => void;
  disabled?: boolean;
}

/** Bộ chọn "Ngân hàng / Ví nhận tiền thật" + STK + tên người nhận (mã BIN NAPAS chuẩn). */
export default function PayeeFields({ draft, onChange, disabled = false }: PayeeFieldsProps) {
  const { t } = useI18n();
  const institution = findInstitution(draft.institutionCode);
  const isWallet = institution?.kind === "EWALLET";
  const status = resolvePayeeDraft(draft, t.payee);
  const showError = status.state === "INVALID" && draft.accountNumber.trim().length > 0;

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60";

  return (
    <fieldset
      id="tp-payee-fields"
      disabled={disabled}
      className="rounded-2xl border border-slate-200 bg-white p-3"
    >
      <legend className="sr-only">{t.payee.sectionTitle}</legend>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Landmark className="h-4 w-4 shrink-0 text-[#a50064]" />
          {t.payee.sectionTitle}
        </p>
        {draft.institutionCode && (
          <button
            type="button"
            onClick={() => onChange({ institutionCode: "", accountNumber: "", accountName: "" })}
            title={t.payee.clear}
            aria-label={t.payee.clear}
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">{t.payee.sectionHint}</p>

      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.payee.bankLabel}</span>
          <select
            value={draft.institutionCode}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ ...draft, institutionCode: isPayeeInstitutionCode(value) ? value : "" });
            }}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">{t.payee.bankPlaceholder}</option>
            {PAYEE_INSTITUTIONS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.shortName}
                {item.kind === "BANK" ? ` (${item.bin})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">
            {isWallet ? t.payee.walletPhoneLabel : t.payee.accountLabel}
          </span>
          <input
            value={draft.accountNumber}
            inputMode={isWallet ? "tel" : "text"}
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            disabled={disabled || !draft.institutionCode}
            onChange={(event) => onChange({ ...draft, accountNumber: event.target.value.replace(/[^0-9A-Za-z\s.-]/g, "") })}
            placeholder={isWallet ? t.payee.walletPlaceholder : t.payee.accountPlaceholder}
            aria-invalid={showError}
            className={`${inputClass} font-mono`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">
            {t.payee.nameLabel} <span className="font-normal text-slate-400">({t.payee.optional})</span>
          </span>
          <input
            value={draft.accountName}
            autoComplete="off"
            maxLength={50}
            disabled={disabled || !draft.institutionCode}
            onChange={(event) => onChange({ ...draft, accountName: event.target.value })}
            placeholder={t.payee.namePlaceholder}
            className={`${inputClass} uppercase`}
          />
        </label>
      </div>

      {showError && status.state === "INVALID" && (
        <p className="mt-2 text-[11px] font-semibold text-rose-700">{status.message}</p>
      )}
      {isWallet && <p className="mt-2 text-[11px] text-slate-500">{t.payee.momoHint}</p>}
    </fieldset>
  );
}

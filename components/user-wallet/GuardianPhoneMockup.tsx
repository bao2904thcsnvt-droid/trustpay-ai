"use client";

import {
  Smartphone,
  ShieldAlert,
  Ban,
  CheckCircle2,
  Loader2,
  PhoneCall,
  Sparkles,
  HeartHandshake,
  BellRing,
  Wifi,
  AlertOctagon,
} from "lucide-react";
import type { TrustedGuardian } from "@/types/trustpay";
import type { GuardianAlertSummary } from "@/lib/guardian/guardian-alert";
import { maskPhoneForDisplay } from "@/lib/security/pii-display";
import { useI18n } from "@/components/i18n/I18nProvider";

export type GuardianPhoneStage = "idle" | "sending" | "delivered" | "blocked" | "approved";

export interface GuardianPhoneMockupProps {
  guardian: TrustedGuardian;
  stage: GuardianPhoneStage;
  summary: GuardianAlertSummary;
  amountLabel: string;
  recipientLabel: string;
  riskScore: number;
  clockLabel: string;
  onBlock: () => void;
  onApprove: () => void;
  approveError?: string | null;
  decisionsDisabled?: boolean;
}

/**
 * Khung mô phỏng màn hình điện thoại của Người giám hộ ngay trên trang web, hiển
 * thị tóm tắt AI động và 2 nút quyết định (Chặn / Cho phép).
 */
export default function GuardianPhoneMockup({
  guardian,
  stage,
  summary,
  amountLabel,
  recipientLabel,
  riskScore,
  clockLabel,
  onBlock,
  onApprove,
  approveError = null,
  decisionsDisabled = false,
}: GuardianPhoneMockupProps) {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-[300px]">
      <p className="mb-2 text-center text-xs font-bold text-slate-800">{t.phone.title(guardian.name)}</p>

      <div className="relative rounded-[2.6rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl shadow-slate-900/30">
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900"
        />
        <div className="relative flex h-[500px] flex-col overflow-hidden rounded-[1.9rem] bg-gradient-to-b from-slate-100 via-white to-slate-50">
          {/* Thanh trạng thái */}
          <div className="flex items-center justify-between px-5 pt-2.5 pb-1 text-[10px] font-semibold text-slate-700">
            <span className="font-mono">{clockLabel}</span>
            <span className="inline-flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              <span className="h-2 w-4 rounded-[3px] border border-slate-600 p-[1px]">
                <span className="block h-full w-3/4 rounded-[1px] bg-slate-700" />
              </span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3.5 pt-2 pb-4">
            {stage === "idle" && (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center text-slate-500">
                <Smartphone className="mb-3 h-10 w-10 text-slate-300" />
                <p className="text-xs leading-relaxed">{t.phone.placeholder}</p>
              </div>
            )}

            {stage === "sending" && (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <Loader2 className="mb-3 h-9 w-9 animate-spin text-sky-600" />
                <p className="text-xs font-semibold text-slate-700">{t.phone.sending}</p>
              </div>
            )}

            {(stage === "delivered" || stage === "blocked" || stage === "approved") && (
              <div className="space-y-2.5">
                {/* Thông báo đẩy */}
                <div className="rounded-2xl bg-white p-3 shadow-md ring-1 ring-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white">
                      <BellRing className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-semibold text-slate-500">{t.phone.appName}</p>
                      <p className="text-[11px] font-bold text-rose-700">{t.phone.notificationTitle}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold leading-snug text-slate-900">{summary.headline}</p>
                </div>

                {/* Chi tiết giao dịch */}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-xl bg-white px-1.5 py-2 ring-1 ring-slate-200">
                    <p className="text-[9px] text-slate-500">{t.phone.amount}</p>
                    <p className="truncate font-mono text-[10px] font-bold text-[#a50064]">{amountLabel}</p>
                  </div>
                  <div className="rounded-xl bg-white px-1.5 py-2 ring-1 ring-slate-200">
                    <p className="text-[9px] text-slate-500">{t.phone.recipient}</p>
                    <p className="truncate text-[10px] font-bold text-slate-900" title={recipientLabel}>
                      {recipientLabel}
                    </p>
                  </div>
                  <div className="rounded-xl bg-rose-50 px-1.5 py-2 ring-1 ring-rose-200">
                    <p className="text-[9px] text-rose-600">{t.phone.risk}</p>
                    <p className="font-mono text-[11px] font-extrabold text-rose-700">{riskScore}/100</p>
                  </div>
                </div>

                {/* Tóm tắt AI động */}
                <div className="rounded-2xl bg-white p-3 ring-1 ring-pink-200">
                  <p className="flex items-center gap-1 text-[10px] font-bold text-[#a50064]">
                    <Sparkles className="h-3 w-3" />
                    {t.phone.aiSummary}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-700">{summary.summary}</p>
                  {summary.highlights.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {summary.highlights.map((flag) => (
                        <li key={flag} className="flex items-start gap-1 text-[10px] leading-snug text-slate-600">
                          <AlertOctagon className="mt-0.5 h-2.5 w-2.5 shrink-0 text-rose-500" />
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-semibold leading-snug text-amber-800">
                    {summary.advice}
                  </p>
                </div>

                <p className="flex items-center gap-1 px-1 text-[10px] text-slate-500">
                  <PhoneCall className="h-3 w-3" />
                  {t.phone.callHint} ({maskPhoneForDisplay(guardian.phone)})
                </p>

                {stage === "delivered" && (
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      disabled={decisionsDisabled}
                      onClick={onBlock}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/30 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
                    >
                      <Ban className="h-4 w-4" />
                      {t.phone.block}
                    </button>
                    <button
                      type="button"
                      disabled={decisionsDisabled}
                      onClick={onApprove}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {t.phone.approve}
                    </button>
                    {approveError && <p className="text-center text-[10px] font-semibold text-rose-600">{approveError}</p>}
                  </div>
                )}

                {stage === "blocked" && (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                    <HeartHandshake className="h-4 w-4 shrink-0" />
                    {t.phone.blockedStatus}
                  </div>
                )}

                {stage === "approved" && (
                  <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-[11px] font-bold text-sky-800 ring-1 ring-sky-200">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    {t.phone.approvedStatus}
                  </div>
                )}
              </div>
            )}
          </div>

          <div aria-hidden="true" className="mx-auto mb-2 h-1 w-24 rounded-full bg-slate-300" />
        </div>
      </div>
    </div>
  );
}

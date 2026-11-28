"use client";

import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  AlertOctagon,
  UserCheck,
  Tag,
  Banknote,
  ScanFace,
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
  ArrowRight,
  Info,
  Lock,
  Scale,
  Download,
  HeartHandshake,
  ShieldBan,
} from "lucide-react";
import type {
  AwsPipelineTrace,
  BudgetCategory,
  BudgetReallocationPlan,
  CategoryName,
  RiskLevel,
  TransactionAnalysisResponse,
} from "@/types/trustpay";
import type { BiometricDecision } from "@/lib/compliance/biometric-policy";
import { planBudgetReallocation } from "@/lib/wallet/ledger";
import { useI18n } from "@/components/i18n/I18nProvider";
import AwsPipelineBar from "@/components/shared/AwsPipelineBar";
import BudgetReallocationCta from "@/components/shared/BudgetReallocationCta";

export type TransferUiStatus =
  | "idle"
  | "frozen"
  | "completed"
  | "cancelled"
  | "guardian_blocked"
  | "ops_blocked";

export interface AiShieldResultPanelProps {
  analysis: TransactionAnalysisResponse | null;
  walletBalance: number;
  isAnalyzing?: boolean;
  transactionStatus?: TransferUiStatus;
  biometricVerified?: boolean;
  onConfirmTransfer: (analysis: TransactionAnalysisResponse) => void;
  onRequestBiometric: (analysis: TransactionAnalysisResponse) => void;
  onCancelTransaction?: () => void;
  /** Luồng công nghệ AWS của lần phân tích (hiển thị ở cuối thẻ). */
  trace?: AwsPipelineTrace | null;
  /** Danh mục thật của Ví (đã quy đổi nếu API trả danh mục Ví không theo dõi). */
  effectiveCategory?: CategoryName;
  /** Yêu cầu sinh trắc học sau khi áp chính sách TT 50 (AI ∪ bộ luật). */
  requireBiometric?: boolean;
  policy?: BiometricDecision | null;
  /** Ngân sách hiện tại để đánh giá lại hạn mức theo thời gian thực. */
  budgets?: BudgetCategory[];
  reallocation?: { amount: number; from: CategoryName; to: CategoryName } | null;
  onReallocateBudget?: (plan: BudgetReallocationPlan) => void;
  onOpenCoolingOff?: () => void;
  onDownloadReport?: () => void;
  reportReady?: boolean;
  guardianName?: string;
  /** Chế độ Tiền thật Non-Custodial: không chặn giao dịch theo số dư ví ảo 0đ. */
  nonCustodial?: boolean;
  /** Chế độ Tiền thật: cuộn thẳng tới khung VietQR + Mở App Ngân hàng (thay vì xác nhận ví ảo). */
  onOpenRealHandoff?: () => void;
}

function getRiskTheme(level: RiskLevel) {
  switch (level) {
    case "HIGH":
      return {
        badgeClass: "border-rose-300 bg-rose-100 text-rose-800",
        cardBorder: "border-rose-200",
        headerBg: "bg-gradient-to-r from-rose-50 to-pink-50",
        scoreColor: "text-rose-600",
        barColor: "bg-gradient-to-r from-rose-500 to-red-600",
        dotColor: "bg-rose-500",
        Icon: ShieldAlert,
      };
    case "MEDIUM":
      return {
        badgeClass: "border-amber-300 bg-amber-100 text-amber-800",
        cardBorder: "border-amber-200",
        headerBg: "bg-gradient-to-r from-amber-50 to-orange-50/70",
        scoreColor: "text-amber-600",
        barColor: "bg-gradient-to-r from-amber-400 to-orange-500",
        dotColor: "bg-amber-500",
        Icon: AlertTriangle,
      };
    default:
      return {
        badgeClass: "border-emerald-300 bg-emerald-100 text-emerald-800",
        cardBorder: "border-emerald-200",
        headerBg: "bg-gradient-to-r from-emerald-50 to-teal-50/60",
        scoreColor: "text-emerald-600",
        barColor: "bg-gradient-to-r from-emerald-400 to-emerald-600",
        dotColor: "bg-emerald-500",
        Icon: ShieldCheck,
      };
  }
}

export default function AiShieldResultPanel({
  analysis,
  walletBalance,
  isAnalyzing = false,
  transactionStatus = "idle",
  biometricVerified = false,
  onConfirmTransfer,
  onRequestBiometric,
  onCancelTransaction,
  trace = null,
  effectiveCategory,
  requireBiometric,
  policy = null,
  budgets,
  reallocation = null,
  onReallocateBudget,
  onOpenCoolingOff,
  onDownloadReport,
  reportReady = false,
  guardianName = "",
  nonCustodial = true,
  onOpenRealHandoff,
}: AiShieldResultPanelProps) {
  const { t, money, category: categoryLabel, data } = useI18n();

  // 1. Trạng thái đang quét AI
  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-pink-200 bg-white p-10 text-center shadow-xs">
        <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <h3 className="text-base font-bold text-slate-900">{t.result.analyzingTitle}</h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">{t.result.analyzingDesc}</p>
        <div className="mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-pink-100">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-[#a50064] to-[#d82d8b]" />
        </div>
      </div>
    );
  }

  // 2. Trạng thái chưa có kết quả phân tích
  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-pink-200/80 bg-white/80 p-8 text-center">
        <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900">{t.result.emptyTitle}</h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">{t.result.emptyDesc}</p>
      </div>
    );
  }

  const { parsedAmount, recipient, budgetAlert, scamReport } = analysis;
  const category = effectiveCategory ?? analysis.category;
  const needsBiometric = requireBiometric ?? analysis.requireBiometric;
  const riskTheme = getRiskTheme(scamReport.riskLevel);
  const RiskIcon = riskTheme.Icon;
  const isInsufficientBalance = !nonCustodial && parsedAmount > walletBalance;
  const isInvalidAmount = parsedAmount <= 0;
  const isActionable = transactionStatus === "idle" || transactionStatus === "frozen";
  const needsBiometricGate = needsBiometric && !biometricVerified;
  // Chủ ví cần thấy đầy đủ người nhận để tự kiểm tra; việc che PII áp dụng cho bên thứ ba (Ops, Người giám hộ, biên bản).
  const displayRecipient = data(recipient);

  // Đánh giá lại hạn mức theo ngân sách hiện tại (phản ánh điều chuyển hạn mức thật).
  const liveBudget = budgets?.find((budget) => budget.name === category);
  const liveRemainingAfter = liveBudget
    ? transactionStatus === "completed"
      ? liveBudget.limit - liveBudget.spent
      : liveBudget.limit - liveBudget.spent - parsedAmount
    : budgetAlert.remainingAfter;
  const liveExceeded = liveRemainingAfter < 0;
  // Hạn mức đã thay đổi so với lúc phân tích (vd vừa điều chuyển) → ẩn câu cảnh báo cũ của máy chủ.
  const budgetStateChanged = budgetAlert.isExceeded !== liveExceeded;

  const reallocationPlan =
    isActionable && liveExceeded && scamReport.riskLevel !== "HIGH" && budgets && onReallocateBudget
      ? planBudgetReallocation(budgets, category, -liveRemainingAfter)
      : null;

  return (
    <div className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition-all ${riskTheme.cardBorder}`}>
      {/* Header kết quả */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 ${riskTheme.headerBg}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-2xs ${riskTheme.scoreColor}`}
          >
            <RiskIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">{t.result.reportTitle}</h3>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${riskTheme.badgeClass}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${riskTheme.dotColor} ${
                    scamReport.riskLevel === "HIGH" ? "animate-ping" : ""
                  }`}
                />
                {scamReport.riskLevel} • {t.common.riskBadge[scamReport.riskLevel]}
              </span>
              {transactionStatus === "frozen" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                  <Lock className="h-3 w-3" />
                  FROZEN
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              {t.result.opsCode(analysis.fintechOpsTicket.ticketId)}
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-1 rounded-2xl bg-white/90 px-4 py-2 shadow-2xs ring-1 ring-slate-200/70">
          <span className="text-xs font-medium text-slate-500">{t.result.riskScore}</span>
          <span className={`font-mono text-xl font-extrabold ${riskTheme.scoreColor}`}>{scamReport.riskScore}</span>
          <span className="font-mono text-xs font-semibold text-slate-400">/100</span>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {/* 1. Thông tin giao dịch bóc tách */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <UserCheck className="h-3.5 w-3.5 text-[#a50064]" />
              {t.result.recipient}
            </p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900" title={displayRecipient}>
              {displayRecipient}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Banknote className="h-3.5 w-3.5 text-[#a50064]" />
              {t.result.amount}
            </p>
            <p className="mt-1 font-mono text-base font-bold text-[#a50064]">{money(parsedAmount)}</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Tag className="h-3.5 w-3.5 text-[#a50064]" />
              {t.result.category}
            </p>
            <p className="mt-1 inline-flex items-center rounded-lg bg-pink-50 px-2.5 py-0.5 text-xs font-bold text-[#a50064]">
              {categoryLabel(category)}
            </p>
          </div>
        </div>

        {/* 2. Cảnh báo ngân sách (đánh giá lại theo hạn mức hiện tại) */}
        <div
          className={`rounded-2xl border p-4 ${
            liveExceeded ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/60"
          }`}
        >
          <div className="flex items-start gap-3">
            {liveExceeded ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className={`text-xs font-bold tracking-wide uppercase ${
                    liveExceeded ? "text-amber-800" : "text-emerald-800"
                  }`}
                >
                  {liveExceeded ? t.result.budgetExceeded : t.result.budgetSafe}
                </p>
                <span className={`font-mono text-xs font-bold ${liveExceeded ? "text-rose-600" : "text-emerald-700"}`}>
                  {liveRemainingAfter >= 0
                    ? t.result.remainingAfter(money(liveRemainingAfter))
                    : t.result.overBy(money(Math.abs(liveRemainingAfter)))}
                </span>
              </div>
              {!budgetStateChanged && (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">{data(budgetAlert.message)}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {t.result.suggestion} {data(budgetAlert.suggestion)}
                  </p>
                </>
              )}

              {reallocation && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-white/80 px-3 py-2 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t.result.reallocatedNote(
                      money(reallocation.amount),
                      categoryLabel(reallocation.from),
                      categoryLabel(reallocation.to),
                    )}
                  </span>
                </p>
              )}

              {reallocationPlan && onReallocateBudget && (
                <BudgetReallocationCta plan={reallocationPlan} onReallocate={onReallocateBudget} />
              )}
            </div>
          </div>
        </div>

        {/* 3. Bảng chấm điểm rủi ro lừa đảo */}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-900">{t.result.scenarioAnalysis}</p>
              <p className="text-xs font-semibold text-[#a50064]">{data(scamReport.scamType)}</p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-500">
              Risk Score: {scamReport.riskScore}/100
            </span>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${riskTheme.barColor}`}
              style={{ width: `${Math.min(100, Math.max(4, scamReport.riskScore))}%` }}
            />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">{t.result.redFlags}</p>
            <ul className="space-y-1.5">
              {scamReport.redFlags.map((flag, idx) => (
                <li
                  key={`${flag}-${idx}`}
                  className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200/70"
                >
                  {scamReport.riskLevel === "LOW" ? (
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                  )}
                  <span>{data(flag)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-xl border border-pink-100 bg-pink-50/50 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[#a50064]">
              <Sparkles className="h-3.5 w-3.5" />
              {t.result.aiAdvice}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">{data(scamReport.explanation)}</p>
          </div>
        </div>

        {/* 4. Chính sách sinh trắc học TT 50 / QĐ 2345 */}
        {policy && (
          <div
            className={`rounded-2xl border p-4 ${
              needsBiometric ? "border-sky-200 bg-sky-50/60" : "border-slate-200 bg-white"
            }`}
          >
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Scale className="h-3.5 w-3.5 text-sky-700" />
              {t.result.policyTitle}
            </p>
            <p className={`mt-1 text-xs font-semibold ${needsBiometric ? "text-sky-800" : "text-slate-600"}`}>
              {needsBiometric ? t.result.policyRequired : t.result.policyNotRequired}
            </p>
            {policy.reasons.length > 0 && (
              <ul className="mt-2 space-y-1">
                {policy.reasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                    <ScanFace className="mt-0.5 h-3 w-3 shrink-0 text-sky-600" />
                    <span>{data(reason)}</span>
                  </li>
                ))}
              </ul>
            )}
            {policy.legalBasis.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {policy.legalBasis.map((basis) => (
                  <span
                    key={basis}
                    className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-200"
                  >
                    {data(basis)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cảnh báo không đủ số dư ví */}
        {isInsufficientBalance && isActionable && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            <Info className="h-4 w-4 shrink-0" />
            <span>{t.result.insufficient(money(walletBalance), money(parsedAmount))}</span>
          </div>
        )}

        {/* 5. Khu vực nút hành động */}
        {transactionStatus === "completed" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-bold">{t.result.completedTitle(money(parsedAmount))}</p>
              <p className="text-xs text-emerald-700">
                {nonCustodial
                  ? `Đã ghi nhận vào sổ chi tiêu mục "${categoryLabel(category)}" & Lũy kế TT 50 NHNN (số dư ngân hàng thật chỉ cập nhật theo SePay/Casso).`
                  : t.result.completedDesc(categoryLabel(category))}
              </p>
            </div>
          </div>
        ) : transactionStatus === "cancelled" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-slate-700">
            <XCircle className="h-6 w-6 shrink-0 text-slate-500" />
            <div>
              <p className="text-sm font-bold">{t.result.cancelledTitle}</p>
              <p className="text-xs text-slate-500">{t.result.cancelledDesc}</p>
            </div>
          </div>
        ) : transactionStatus === "ops_blocked" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <ShieldBan className="h-6 w-6 shrink-0 text-rose-600" />
            <div>
              <p className="text-sm font-bold">{t.result.opsBlockedTitle}</p>
              <p className="text-xs text-rose-700">{t.result.opsBlockedDesc}</p>
            </div>
          </div>
        ) : transactionStatus === "guardian_blocked" ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <HeartHandshake className="h-6 w-6 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-bold">{t.result.guardianBlockedTitle}</p>
                <p className="text-xs text-emerald-700">{t.result.guardianBlockedDesc(guardianName)}</p>
              </div>
            </div>
            {onDownloadReport && (
              <button
                type="button"
                disabled={!reportReady}
                onClick={onDownloadReport}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {t.result.downloadReport}
              </button>
            )}
          </div>
        ) : transactionStatus === "frozen" ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
              <div>
                <p className="text-sm font-bold text-sky-900">{t.result.frozenTitle}</p>
                <p className="mt-0.5 text-xs text-sky-800">{t.result.frozenDesc(guardianName)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-col-reverse gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {onCancelTransaction && (
                <button
                  type="button"
                  onClick={onCancelTransaction}
                  className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:min-h-0 sm:w-auto"
                >
                  <XCircle className="h-4 w-4 text-slate-400" />
                  <span>{t.result.cancel}</span>
                </button>
              )}
              {onOpenCoolingOff && (
                <button
                  type="button"
                  onClick={onOpenCoolingOff}
                  className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-700 to-indigo-700 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-sky-700/20 transition-all hover:brightness-110 sm:min-h-0 sm:w-auto"
                >
                  <HeartHandshake className="h-4 w-4 shrink-0" />
                  <span>{t.result.reopenCooling}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {biometricVerified && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t.result.verifiedBadge}
              </span>
            )}

            {/* Điện thoại: nút xác nhận rộng toàn màn hình ở trên, nút hủy bên dưới (không ép chữ 3 dòng). */}
            <div className="flex flex-1 flex-col-reverse gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {onCancelTransaction && (
                <button
                  type="button"
                  onClick={onCancelTransaction}
                  className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:min-h-0 sm:w-auto"
                >
                  <XCircle className="h-4 w-4 text-slate-400" />
                  <span>{t.result.cancel}</span>
                </button>
              )}

              {needsBiometricGate ? (
                <button
                  type="button"
                  onClick={() => onRequestBiometric(analysis)}
                  className="inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-rose-600/25 transition-all hover:brightness-110 active:scale-[0.99] sm:min-h-0 sm:w-auto sm:flex-initial"
                >
                  <ScanFace className="h-4 w-4 shrink-0" />
                  <span>{t.result.biometricPolicy}</span>
                </button>
              ) : nonCustodial && onOpenRealHandoff ? (
                <button
                  type="button"
                  disabled={isInvalidAmount}
                  onClick={onOpenRealHandoff}
                  className={`inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto sm:flex-initial ${
                    liveExceeded
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/25"
                      : "bg-gradient-to-r from-[#a50064] to-[#d82d8b] shadow-[#a50064]/25"
                  }`}
                >
                  <span>Chuyển tiền thật qua App Ngân hàng / VietQR ({money(parsedAmount)})</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isInsufficientBalance || isInvalidAmount}
                  onClick={() => onConfirmTransfer(analysis)}
                  className={`inline-flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto sm:flex-initial ${
                    liveExceeded
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/25"
                      : "bg-gradient-to-r from-[#a50064] to-[#d82d8b] shadow-[#a50064]/25"
                  }`}
                >
                  <span>
                    {liveExceeded
                      ? t.result.confirmOverBudget(money(parsedAmount))
                      : t.result.confirm(money(parsedAmount))}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 6. Luồng công nghệ AWS ở cuối thẻ kết quả */}
        {trace && <AwsPipelineBar trace={trace} />}
      </div>
    </div>
  );
}

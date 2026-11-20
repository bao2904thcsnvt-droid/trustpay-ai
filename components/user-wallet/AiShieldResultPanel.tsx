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
} from "lucide-react";
import type {
  RiskLevel,
  TransactionAnalysisResponse,
} from "@/types/trustpay";

export interface AiShieldResultPanelProps {
  analysis: TransactionAnalysisResponse | null;
  walletBalance: number;
  isAnalyzing?: boolean;
  transactionStatus?: "idle" | "completed" | "cancelled";
  biometricVerified?: boolean;
  onConfirmTransfer: (analysis: TransactionAnalysisResponse) => void;
  onRequestBiometric: (analysis: TransactionAnalysisResponse) => void;
  onCancelTransaction?: () => void;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + "đ";
}

function getRiskTheme(level: RiskLevel) {
  switch (level) {
    case "HIGH":
      return {
        label: "RỦI RO CAO",
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
        label: "RỦI RO TRUNG BÌNH",
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
        label: "AN TOÀN",
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
}: AiShieldResultPanelProps) {
  // 1. Trạng thái đang quét AI
  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-pink-200 bg-white p-10 text-center shadow-xs">
        <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          Lá chắn AI đang quét giao dịch...
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          Đang bóc tách thông tin người nhận, đối chiếu danh sách đen
          (Blacklist), kiểm tra hạn mức ngân sách và chấm điểm dấu hiệu lừa đảo.
        </p>
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
        <h3 className="text-base font-bold text-slate-900">
          Kết quả Lá chắn AI sẽ hiển thị tại đây
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          Chọn một trong 4 kịch bản Demo phía trên hoặc nhập lệnh chuyển tiền bất
          kỳ để xem AI bóc tách giao dịch, kiểm soát ngân sách và cảnh báo lừa
          đảo thời gian thực.
        </p>
      </div>
    );
  }

  const { parsedAmount, recipient, category, budgetAlert, scamReport, requireBiometric } =
    analysis;
  const riskTheme = getRiskTheme(scamReport.riskLevel);
  const RiskIcon = riskTheme.Icon;
  const isInsufficientBalance = parsedAmount > walletBalance;
  const isInvalidAmount = parsedAmount <= 0;
  const needsBiometricGate = requireBiometric && !biometricVerified;

  return (
    <div
      className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition-all ${riskTheme.cardBorder}`}
    >
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
              <h3 className="text-sm font-bold text-slate-900">
                Báo cáo phân tích Lá chắn AI
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${riskTheme.badgeClass}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${riskTheme.dotColor} ${
                    scamReport.riskLevel === "HIGH" ? "animate-ping" : ""
                  }`}
                />
                {scamReport.riskLevel} • {riskTheme.label}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              Mã giám sát Ops: {analysis.fintechOpsTicket.ticketId}
            </p>
          </div>
        </div>

        {/* Điểm rủi ro tổng quan */}
        <div className="flex items-baseline gap-1 rounded-2xl bg-white/90 px-4 py-2 shadow-2xs ring-1 ring-slate-200/70">
          <span className="text-xs font-medium text-slate-500">
            Điểm rủi ro:
          </span>
          <span className={`font-mono text-xl font-extrabold ${riskTheme.scoreColor}`}>
            {scamReport.riskScore}
          </span>
          <span className="font-mono text-xs font-semibold text-slate-400">
            /100
          </span>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {/* 1. Thông tin giao dịch bóc tách */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <UserCheck className="h-3.5 w-3.5 text-[#a50064]" />
              Người nhận bóc tách
            </p>
            <p className="mt-1 truncate text-sm font-bold text-slate-900" title={recipient}>
              {recipient}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Banknote className="h-3.5 w-3.5 text-[#a50064]" />
              Số tiền giao dịch
            </p>
            <p className="mt-1 font-mono text-base font-bold text-[#a50064]">
              {formatVND(parsedAmount)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Tag className="h-3.5 w-3.5 text-[#a50064]" />
              Danh mục chi tiêu
            </p>
            <p className="mt-1 inline-flex items-center rounded-lg bg-pink-50 px-2.5 py-0.5 text-xs font-bold text-[#a50064]">
              {category}
            </p>
          </div>
        </div>

        {/* 2. Cảnh báo ngân sách (budgetAlert) */}
        <div
          className={`rounded-2xl border p-4 ${
            budgetAlert.isExceeded
              ? "border-amber-200 bg-amber-50/70"
              : "border-emerald-200 bg-emerald-50/60"
          }`}
        >
          <div className="flex items-start gap-3">
            {budgetAlert.isExceeded ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className={`text-xs font-bold uppercase tracking-wide ${
                    budgetAlert.isExceeded
                      ? "text-amber-800"
                      : "text-emerald-800"
                  }`}
                >
                  {budgetAlert.isExceeded
                    ? "Cảnh báo vượt hạn mức ngân sách"
                    : "Ngân sách trong hạn mức an toàn"}
                </p>
                <span
                  className={`font-mono text-xs font-bold ${
                    budgetAlert.isExceeded
                      ? "text-rose-600"
                      : "text-emerald-700"
                  }`}
                >
                  {budgetAlert.remainingAfter >= 0
                    ? `Còn lại sau GD: ${formatVND(budgetAlert.remainingAfter)}`
                    : `Vượt mức: ${formatVND(Math.abs(budgetAlert.remainingAfter))}`}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                {budgetAlert.message}
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                Gợi ý: {budgetAlert.suggestion}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Bảng chấm điểm rủi ro lừa đảo (scamReport) */}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-900">
                Phân tích kịch bản rủi ro
              </p>
              <p className="text-xs font-semibold text-[#a50064]">
                {scamReport.scamType}
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-500">
              Risk Score: {scamReport.riskScore}/100
            </span>
          </div>

          {/* Thanh điểm rủi ro */}
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${riskTheme.barColor}`}
              style={{
                width: `${Math.min(100, Math.max(4, scamReport.riskScore))}%`,
              }}
            />
          </div>

          {/* Danh sách Red Flags */}
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
              Các dấu hiệu phát hiện (Red Flags)
            </p>
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
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Lời khuyên AI */}
          <div className="mt-4 rounded-xl border border-pink-100 bg-pink-50/50 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[#a50064]">
              <Sparkles className="h-3.5 w-3.5" />
              Lời khuyên từ Lá chắn AI
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">
              {scamReport.explanation}
            </p>
          </div>
        </div>

        {/* Cảnh báo không đủ số dư ví */}
        {isInsufficientBalance && transactionStatus === "idle" && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              Số dư ví khả dụng ({formatVND(walletBalance)}) không đủ để thực
              hiện giao dịch {formatVND(parsedAmount)}.
            </span>
          </div>
        )}

        {/* 4. Khu vực Nút Hành Động Thông Minh */}
        {transactionStatus === "completed" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-bold">
                Chuyển tiền thành công ({formatVND(parsedAmount)})!
              </p>
              <p className="text-xs text-emerald-700">
                Số dư ví khả dụng và hạn mức danh mục &ldquo;{category}&rdquo;
                đã được cập nhật tự động.
              </p>
            </div>
          </div>
        ) : transactionStatus === "cancelled" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-slate-700">
            <XCircle className="h-6 w-6 shrink-0 text-slate-500" />
            <div>
              <p className="text-sm font-bold">Giao dịch đã được hủy an toàn</p>
              <p className="text-xs text-slate-500">
                Tài khoản của bạn không bị trừ tiền. Bạn có thể thử một kịch bản
                giao dịch khác.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {biometricVerified && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đã xác thực khuôn mặt thành công
              </span>
            )}

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5">
              {onCancelTransaction && (
                <button
                  type="button"
                  onClick={onCancelTransaction}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:text-sm"
                >
                  <XCircle className="h-4 w-4 text-slate-400" />
                  <span>Hủy giao dịch</span>
                </button>
              )}

              {needsBiometricGate ? (
                <button
                  type="button"
                  onClick={() => onRequestBiometric(analysis)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-3 text-xs font-bold text-white shadow-md shadow-rose-600/25 transition-all hover:brightness-110 active:scale-[0.99] sm:flex-initial sm:text-sm"
                >
                  <ScanFace className="h-4 w-4 shrink-0" />
                  <span>
                    Cảnh báo rủi ro cao — Xác thực khuôn mặt trước khi chuyển
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isInsufficientBalance || isInvalidAmount}
                  onClick={() => onConfirmTransfer(analysis)}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-5 py-3 text-xs font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial sm:text-sm"
                >
                  <span>
                    Xác nhận chuyển tiền ({formatVND(parsedAmount)})
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

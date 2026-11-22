"use client";

import { useState, type FormEvent } from "react";
import {
  ShoppingCart,
  Link as LinkIcon,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  BadgeCheck,
  Store,
  Globe,
  Sparkles,
  ScanFace,
  CheckCircle2,
  RotateCcw,
  Ban,
  Send,
  MousePointerClick,
} from "lucide-react";
import type {
  AwsPipelineTrace,
  BudgetCategory,
  BudgetReallocationPlan,
  FintechOpsTicket,
  RiskLevel,
  ShopRiskReport,
  ShopRiskSignal,
  TransactionAnalysisResponse,
} from "@/types/trustpay";
import { decideBiometric, type BiometricDecision } from "@/lib/compliance/biometric-policy";
import { riskLevelFromScore } from "@/lib/security/ai-output-guard";
import { analyzeShopTarget, buildShopCommandText, SHOP_SAMPLES } from "@/lib/agents/safe-shopping";
import { expandBlacklistForText } from "@/lib/wallet/blacklist-patterns";
import { requestTransactionAnalysis, withStepLatency } from "@/lib/aws/pipeline-trace";
import { createClientId, findBudget, planBudgetReallocation } from "@/lib/wallet/ledger";
import { formatMoney, formatNumberInput, parseMoneyInput } from "@/lib/wallet/format";
import { useI18n } from "@/components/i18n/I18nProvider";
import AwsPipelineBar from "@/components/shared/AwsPipelineBar";
import BudgetReallocationCta from "@/components/shared/BudgetReallocationCta";

export interface ShopCheckResult {
  id: string;
  price: number;
  productName: string;
  report: ShopRiskReport;
  analysis: TransactionAnalysisResponse;
  trace: AwsPipelineTrace;
  policy: BiometricDecision;
  finalScore: number;
  finalLevel: RiskLevel;
  ticket: FintechOpsTicket | null;
}

export interface SafeShoppingAgentProps {
  budgets: BudgetCategory[];
  blacklist: string[];
  walletBalance: number;
  /** Tổng đã chi hôm nay — đọc tại thời điểm kiểm tra (lũy kế TT 50). */
  getDailyOutflow: () => number;
  biometricVerifiedCheckId: string | null;
  onCheckCompleted: (check: ShopCheckResult) => void;
  onReallocateBudget: (plan: BudgetReallocationPlan) => void;
  onRequestBiometric: (check: ShopCheckResult) => void;
  /** Trừ tiền thật; trả về false nếu không thực hiện được. */
  onPay: (check: ShopCheckResult) => boolean;
}

const RISK_RANK: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function maxRiskLevel(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((best, level) => (RISK_RANK[level] > RISK_RANK[best] ? level : best), "LOW");
}

function verdictTheme(level: RiskLevel) {
  switch (level) {
    case "HIGH":
      return {
        header: "bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200",
        text: "text-rose-700",
        badge: "border-rose-300 bg-rose-100 text-rose-800",
        Icon: ShieldAlert,
      };
    case "MEDIUM":
      return {
        header: "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200",
        text: "text-amber-700",
        badge: "border-amber-300 bg-amber-100 text-amber-800",
        Icon: AlertTriangle,
      };
    default:
      return {
        header: "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200",
        text: "text-emerald-700",
        badge: "border-emerald-300 bg-emerald-100 text-emerald-800",
        Icon: ShieldCheck,
      };
  }
}

function signalTone(signal: ShopRiskSignal): { Icon: typeof ShieldCheck; className: string } {
  if (signal.code === "OFFICIAL_STORE") {
    return { Icon: BadgeCheck, className: "text-emerald-600" };
  }
  if (signal.weight >= 30) {
    return { Icon: ShieldAlert, className: "text-rose-600" };
  }
  return { Icon: AlertTriangle, className: "text-amber-600" };
}

/**
 * Safe Shopping Agent — trợ lý AI soát link / tên cửa hàng online và hạn mức
 * "Mua sắm" trước khi cho phép "Xác nhận thanh toán an toàn" (trừ tiền thật).
 */
export default function SafeShoppingAgent({
  budgets,
  blacklist,
  walletBalance,
  getDailyOutflow,
  biometricVerifiedCheckId,
  onCheckCompleted,
  onReallocateBudget,
  onRequestBiometric,
  onPay,
}: SafeShoppingAgentProps) {
  const { t, money, data } = useI18n();
  const [targetInput, setTargetInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [productName, setProductName] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<ShopCheckResult | null>(null);
  const [mediumAck, setMediumAck] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const resetResult = () => {
    setCheck(null);
    setPaid(false);
    setMediumAck(false);
    setPayError(null);
  };

  const applySample = (sample: { target: string; price: number; productName: string }) => {
    setTargetInput(sample.target);
    setPriceInput(formatNumberInput(sample.price));
    setProductName(sample.productName);
    setError(null);
    resetResult();
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const target = targetInput.trim();
    const price = parseMoneyInput(priceInput);
    if (!target) {
      setError(t.shopping.errorTarget);
      return;
    }
    if (!(price > 0)) {
      setError(t.shopping.errorPrice);
      return;
    }

    setError(null);
    resetResult();
    setIsChecking(true);

    try {
      const report = analyzeShopTarget({ target, price, productName, blacklist });
      const commandText = buildShopCommandText(report, price);
      const { result, trace } = await requestTransactionAnalysis(
        {
          commandText,
          currentBudgets: budgets,
          blacklist: expandBlacklistForText(blacklist, commandText),
        },
        "CONTEXT_CHECK",
      );

      // Sàn rủi ro: lấy mức cao nhất giữa bộ phân tích URL và Lá chắn AI (ADR-1).
      const finalScore = Math.max(report.riskScore, result.scamReport.riskScore);
      const finalLevel = maxRiskLevel([riskLevelFromScore(finalScore), report.riskLevel, result.scamReport.riskLevel]);

      const policyStartedAt = performance.now();
      const policy = decideBiometric({
        parsedAmount: price,
        riskLevel: finalLevel,
        dailyCumulativeBefore: getDailyOutflow(),
      });
      const policyMs = performance.now() - policyStartedAt;

      const storeLabel = report.normalizedTarget || target;
      const ticket: FintechOpsTicket | null =
        finalLevel === "LOW"
          ? null
          : {
              ticketId: result.fintechOpsTicket.ticketId,
              timestamp: result.fintechOpsTicket.timestamp,
              recipient: storeLabel,
              amount: price,
              riskLevel: finalLevel,
              riskScore: finalScore,
              summary: `Safe Shopping Agent phát hiện website rủi ro ${finalLevel} (${finalScore}đ) khi thanh toán ${formatMoney(price, "vi")} tại "${storeLabel}".`,
              recommendedAction:
                "Cảnh báo người dùng, đưa tên miền vào Blacklist và rà soát nguồn quảng cáo dẫn link.",
              status: "PENDING",
            };

      const next: ShopCheckResult = {
        id: createClientId("SHOP"),
        price,
        productName: productName.trim(),
        report,
        analysis: result,
        trace: withStepLatency(trace, "biometric-policy", policyMs),
        policy,
        finalScore,
        finalLevel,
        ticket,
      };
      setCheck(next);
      onCheckCompleted(next);
    } catch (err) {
      setError(t.shopping.errorServer(err instanceof Error ? err.message : "network"));
    } finally {
      setIsChecking(false);
    }
  };

  const handlePay = () => {
    if (!check) return;
    const ok = onPay(check);
    if (ok) {
      setPaid(true);
      setPayError(null);
    } else {
      setPayError(t.shopping.insufficient);
    }
  };

  // Đối chiếu hạn mức "Mua sắm" theo dữ liệu hiện tại.
  const shopBudget = findBudget(budgets, "Mua sắm");
  const remaining = shopBudget ? shopBudget.limit - shopBudget.spent : 0;
  const remainingAfter = check ? (paid ? remaining : remaining - check.price) : remaining;
  const budgetExceeded = Boolean(check) && remainingAfter < 0;

  const theme = check ? verdictTheme(check.finalLevel) : null;
  const VerdictIcon = theme?.Icon ?? ShieldCheck;
  const blockedByRisk = check?.finalLevel === "HIGH";
  const insufficientBalance = Boolean(check) && (check?.price ?? 0) > walletBalance && !paid;
  const needsAck = check?.finalLevel === "MEDIUM" && !mediumAck;
  const needsBiometric = Boolean(check?.policy.requireBiometric) && biometricVerifiedCheckId !== check?.id;
  const canPay = Boolean(check) && !paid && !blockedByRisk && !budgetExceeded && !insufficientBalance && !needsAck && !needsBiometric;

  const reallocationPlan =
    check && budgetExceeded && !blockedByRisk && !paid
      ? planBudgetReallocation(budgets, "Mua sắm", -remainingAfter)
      : null;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-pink-100 bg-white p-6 shadow-sm shadow-[#a50064]/5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{t.shopping.title}</h2>
            <p className="text-xs text-slate-500">{t.shopping.subtitle}</p>
          </div>
        </div>

        {/* Mẫu điền nhanh 1 chạm */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
            <MousePointerClick className="h-3.5 w-3.5 text-[#a50064]" />
            {t.shopping.sampleTitle}
          </span>
          <button
            type="button"
            disabled={isChecking}
            onClick={() => applySample(SHOP_SAMPLES.trusted)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            {t.shopping.sampleTrusted}
          </button>
          <button
            type="button"
            disabled={isChecking}
            onClick={() => applySample(SHOP_SAMPLES.suspicious)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {t.shopping.sampleSuspicious}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="tp-shop-target" className="mb-1.5 block text-xs font-semibold text-slate-700">
              {t.shopping.targetLabel}
            </label>
            <div className="relative">
              <LinkIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="tp-shop-target"
                value={targetInput}
                disabled={isChecking}
                maxLength={500}
                onChange={(e) => {
                  setTargetInput(e.target.value);
                  setError(null);
                }}
                placeholder={t.shopping.targetPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 py-2.5 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tp-shop-price" className="mb-1.5 block text-xs font-semibold text-slate-700">
                {t.shopping.priceLabel}
              </label>
              <input
                id="tp-shop-price"
                value={priceInput}
                disabled={isChecking}
                inputMode="decimal"
                maxLength={20}
                onChange={(e) => {
                  setPriceInput(e.target.value);
                  setError(null);
                }}
                placeholder={t.shopping.pricePlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="tp-shop-product" className="mb-1.5 block text-xs font-semibold text-slate-700">
                {t.shopping.productLabel}
              </label>
              <input
                id="tp-shop-product"
                value={productName}
                disabled={isChecking}
                maxLength={120}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={t.shopping.productPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isChecking}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-6 py-3 text-sm font-semibold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>{isChecking ? t.shopping.analyzing : t.shopping.submit}</span>
            </button>
          </div>
        </form>
      </div>

      {check && theme && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* Kết luận */}
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4 ${theme.header}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-2xs ${theme.text}`}>
                <VerdictIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">{t.shopping.resultTitle}</p>
                <h3 className={`text-sm font-bold ${theme.text}`}>{t.shopping.verdict[check.finalLevel]}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${theme.badge}`}>
                {check.finalLevel} • {t.common.riskBadge[check.finalLevel]}
              </span>
              <span className="rounded-2xl bg-white/90 px-3 py-1.5 font-mono text-sm font-extrabold text-slate-900 ring-1 ring-slate-200">
                {check.finalScore}
                <span className="text-xs font-semibold text-slate-400">/100</span>
              </span>
            </div>
          </div>

          <div className="space-y-4 p-6">
            {/* Mục tiêu */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
              {check.report.kind === "URL" ? (
                <Globe className="h-4 w-4 text-[#a50064]" />
              ) : (
                <Store className="h-4 w-4 text-[#a50064]" />
              )}
              <span className="text-[11px] font-semibold text-slate-500">{t.shopping.kindLabel[check.report.kind]}:</span>
              <span className="min-w-0 truncate font-mono text-xs font-bold text-slate-900" title={check.report.displayTarget}>
                {check.report.displayTarget}
              </span>
              <span className="ml-auto font-mono text-xs font-bold text-[#a50064]">{money(check.price)}</span>
            </div>

            {/* Phân tích URL / tên miền */}
            <div>
              <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">{t.shopping.signalsTitle}</p>
              <ul className="space-y-1.5">
                {check.report.signals.map((signal) => {
                  const tone = signalTone(signal);
                  const SignalIcon = tone.Icon;
                  return (
                    <li
                      key={`${signal.code}-${signal.detail ?? ""}`}
                      className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200/70"
                    >
                      <SignalIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone.className}`} />
                      <span className="flex-1">{t.shopping.signals[signal.code](signal.detail ?? "")}</span>
                      {signal.weight > 0 && (
                        <span className="shrink-0 font-mono text-[10px] font-bold text-slate-400">+{signal.weight}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Nhận định Lá chắn AI */}
            <div className="rounded-2xl border border-pink-100 bg-pink-50/50 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[#a50064]">
                <Sparkles className="h-3.5 w-3.5" />
                {t.shopping.aiTitle} · {check.analysis.scamReport.riskScore}/100
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-800">{data(check.analysis.scamReport.scamType)}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{data(check.analysis.scamReport.explanation)}</p>
            </div>

            {/* Đối chiếu hạn mức Mua sắm */}
            <div
              className={`rounded-2xl border p-4 ${
                budgetExceeded ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/60"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs font-bold ${budgetExceeded ? "text-amber-800" : "text-emerald-800"}`}>
                  {t.shopping.budgetTitle}
                </p>
                <span className="font-mono text-[11px] font-semibold text-slate-600">
                  {t.shopping.budgetRemaining(money(paid ? remaining + check.price : remaining))}
                </span>
              </div>
              <p className={`mt-1 text-xs ${budgetExceeded ? "text-amber-800" : "text-emerald-700"}`}>
                {budgetExceeded ? t.shopping.budgetBlocked : t.shopping.budgetOk}
              </p>
              <p className="mt-1 font-mono text-[11px] font-bold text-slate-700">
                {remainingAfter >= 0
                  ? t.shopping.budgetAfter(money(remainingAfter))
                  : t.shopping.budgetShortfall(money(Math.abs(remainingAfter)))}
              </p>
              {reallocationPlan && <BudgetReallocationCta plan={reallocationPlan} onReallocate={onReallocateBudget} />}
            </div>

            {/* Chính sách sinh trắc học */}
            {check.policy.requireBiometric && !blockedByRisk && !paid && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3">
                <div className="text-xs text-sky-900">
                  <p className="font-bold">{t.shopping.biometricRequired}</p>
                  {check.policy.reasons.map((reason) => (
                    <p key={reason} className="mt-0.5 text-[11px] text-sky-800">
                      {data(reason)}
                    </p>
                  ))}
                </div>
                {needsBiometric ? (
                  <button
                    type="button"
                    onClick={() => onRequestBiometric(check)}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-700 to-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:brightness-110"
                  >
                    <ScanFace className="h-4 w-4" />
                    {t.shopping.biometricRequired}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {t.shopping.biometricDone}
                  </span>
                )}
              </div>
            )}

            {check.finalLevel === "MEDIUM" && !paid && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900">
                <input
                  type="checkbox"
                  checked={mediumAck}
                  onChange={(e) => setMediumAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#a50064]"
                />
                <span>{t.shopping.mediumConfirm}</span>
              </label>
            )}

            {check.ticket && (
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700">
                <Send className="h-3.5 w-3.5" />
                {t.shopping.ticketPushed(check.ticket.ticketId)}
              </p>
            )}

            {payError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {payError}
              </p>
            )}

            {/* Hành động */}
            {paid ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-bold">
                    {t.shopping.paidTitle(money(check.price), check.report.normalizedTarget)}
                  </p>
                  <p className="text-xs text-emerald-700">{t.shopping.paidDesc}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] font-medium text-slate-500">
                  {blockedByRisk
                    ? t.shopping.payBlockedRisk
                    : budgetExceeded
                      ? t.shopping.payBlockedBudget
                      : insufficientBalance
                        ? t.shopping.insufficient
                        : t.shopping.categoryNote}
                </span>
                <button
                  type="button"
                  disabled={!canPay}
                  onClick={handlePay}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none sm:text-sm"
                >
                  {blockedByRisk ? <Ban className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  <span>{t.shopping.payButton(money(check.price))}</span>
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setTargetInput("");
                  setPriceInput("");
                  setProductName("");
                  resetResult();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t.shopping.newCheck}
              </button>
            </div>

            {/* Luồng công nghệ AWS ở cuối thẻ kết quả */}
            <AwsPipelineBar trace={check.trace} />
          </div>
        </div>
      )}
    </div>
  );
}

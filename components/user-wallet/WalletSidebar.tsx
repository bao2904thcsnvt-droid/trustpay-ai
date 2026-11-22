"use client";

import { useState, type FormEvent } from "react";
import {
  Wallet,
  Utensils,
  ShoppingBag,
  Car,
  Receipt,
  LayoutGrid,
  ShieldBan,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Network,
  Gauge,
  Plus,
} from "lucide-react";
import type { BudgetCategory, CategoryName, TrustedGuardian } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";
import GuardianProfileCard from "@/components/user-wallet/GuardianProfileCard";
import { isClusterPattern, normalizeBlacklistEntry } from "@/lib/wallet/blacklist-patterns";
import {
  BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND,
  BIOMETRIC_SINGLE_TXN_THRESHOLD_VND,
} from "@/lib/compliance/biometric-policy";

export interface WalletSidebarProps {
  walletBalance: number;
  budgets: BudgetCategory[];
  blacklist: string[];
  guardian?: TrustedGuardian;
  /** Tổng đã chi hôm nay (giờ Việt Nam); null khi chưa xác định (SSR). */
  dailyOutflow?: number | null;
  onSaveGuardian?: (guardian: TrustedGuardian) => void;
  /** Trả về false nếu mục đã tồn tại. */
  onAddBlacklistEntry?: (entry: string) => boolean;
  guardianHighlighted?: boolean;
}

const BLACKLIST_PREVIEW = 6;

function getCategoryIcon(name: CategoryName) {
  switch (name) {
    case "Ăn uống":
      return Utensils;
    case "Mua sắm":
      return ShoppingBag;
    case "Di chuyển":
      return Car;
    case "Hóa đơn":
      return Receipt;
    default:
      return LayoutGrid;
  }
}

type ProgressStatus = "over" | "near" | "watch" | "safe";

function getProgressTheme(spent: number, limit: number) {
  const rawPct = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0;
  const pct = Math.min(100, Math.max(0, Math.round(rawPct)));

  if (spent > limit || rawPct >= 90) {
    return {
      pct,
      rawPct: Math.round(rawPct),
      barClass: "bg-gradient-to-r from-rose-500 to-red-600",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      textClass: "text-rose-600",
      status: (spent > limit ? "over" : "near") as ProgressStatus,
    };
  }

  if (rawPct >= 70) {
    return {
      pct,
      rawPct: Math.round(rawPct),
      barClass: "bg-gradient-to-r from-amber-400 to-orange-500",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      textClass: "text-amber-600",
      status: "watch" as ProgressStatus,
    };
  }

  return {
    pct,
    rawPct: Math.round(rawPct),
    barClass: "bg-gradient-to-r from-emerald-400 to-emerald-600",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    textClass: "text-emerald-600",
    status: "safe" as ProgressStatus,
  };
}

export default function WalletSidebar({
  walletBalance,
  budgets,
  blacklist,
  guardian,
  dailyOutflow = null,
  onSaveGuardian,
  onAddBlacklistEntry,
  guardianHighlighted = false,
}: WalletSidebarProps) {
  const { t, money, category } = useI18n();
  const [reportValue, setReportValue] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [showAllBlacklist, setShowAllBlacklist] = useState(false);

  const totalLimit = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const totalPct = totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;

  const daily = dailyOutflow ?? 0;
  const dailyPct = Math.min(100, Math.round((daily / BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND) * 100));

  const statusLabel: Record<ProgressStatus, string> = {
    over: t.wallet.statusOver,
    near: t.wallet.statusNear,
    watch: t.wallet.statusWatch,
    safe: t.wallet.statusSafe,
  };

  const visibleBlacklist = showAllBlacklist ? blacklist : blacklist.slice(0, BLACKLIST_PREVIEW);

  const handleReport = (event: FormEvent) => {
    event.preventDefault();
    if (!onAddBlacklistEntry) return;
    const entry = normalizeBlacklistEntry(reportValue);
    if (!entry) {
      setReportError(t.wallet.reportInvalid);
      return;
    }
    const added = onAddBlacklistEntry(entry);
    if (!added) {
      setReportError(t.wallet.reportExists);
      return;
    }
    setReportValue("");
    setReportError(null);
  };

  return (
    <aside className="flex flex-col gap-5">
      {/* 1. Thẻ Số dư Ví Khả Dụng */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#a50064] via-[#c21878] to-[#d82d8b] p-6 text-white shadow-lg shadow-[#a50064]/20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-pink-300/15 blur-2xl"
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-pink-100">{t.wallet.balanceTitle}</p>
                <p className="text-[11px] text-pink-200/90">{t.wallet.walletSubtitle}</p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              {t.wallet.shieldOn}
            </span>
          </div>

          <div className="mt-5">
            <p className="font-mono text-3xl font-bold tracking-tight text-white">{money(walletBalance)}</p>
            <p className="mt-1 text-xs text-pink-100/90">
              {t.wallet.spentSummary(money(totalSpent), money(totalLimit), totalPct)}
            </p>
          </div>

          {/* Lũy kế ngày theo TT 50 / QĐ 2345 */}
          <div className="mt-4 rounded-2xl bg-white/10 p-3 backdrop-blur-xs">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 font-semibold text-pink-50">
                <Gauge className="h-3.5 w-3.5" />
                {t.wallet.dailyTitle}
              </span>
              <span className="font-mono font-bold text-white">
                {money(daily)} / {money(BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND)}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  dailyPct >= 100 ? "bg-amber-300" : "bg-white"
                }`}
                style={{ width: `${dailyPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-pink-100/85">
              {t.wallet.dailyHint(
                money(BIOMETRIC_SINGLE_TXN_THRESHOLD_VND),
                money(BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND),
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Người giám hộ tin cậy */}
      {guardian && onSaveGuardian && (
        <GuardianProfileCard guardian={guardian} onSave={onSaveGuardian} highlighted={guardianHighlighted} />
      )}

      {/* 3. Danh mục ngân sách */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-50 text-[#a50064]">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t.wallet.budgetsTitle}</h2>
              <p className="text-xs text-slate-500">{t.wallet.budgetsSubtitle(budgets.length)}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {budgets.map((budget) => {
            const Icon = getCategoryIcon(budget.name);
            const theme = getProgressTheme(budget.spent, budget.limit);
            const remaining = budget.limit - budget.spent;

            return (
              <div
                key={budget.id}
                className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 transition-colors hover:border-pink-200/80 hover:bg-pink-50/25"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#a50064] shadow-2xs ring-1 ring-slate-200/70">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{category(budget.name)}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {money(budget.spent)} / {money(budget.limit)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${theme.badgeClass}`}
                  >
                    {theme.rawPct}%
                  </span>
                </div>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${theme.barClass}`}
                    style={{ width: `${theme.pct}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className={`font-medium ${theme.textClass}`}>{statusLabel[theme.status]}</span>
                  <span className="font-mono text-slate-500">
                    {remaining >= 0 ? t.wallet.remaining(money(remaining)) : t.wallet.over(money(Math.abs(remaining)))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Blacklist sống */}
      <div className="rounded-3xl border border-rose-200/80 bg-white p-5 shadow-xs">
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <ShieldBan className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t.wallet.blacklistTitle}</h2>
              <p className="text-xs text-slate-500">{t.wallet.blacklistSubtitle}</p>
            </div>
          </div>

          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-100 px-2 font-mono text-xs font-bold text-rose-700">
            {blacklist.length}
          </span>
        </div>

        {blacklist.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">{t.wallet.blacklistEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {visibleBlacklist.map((item) => {
              const isCluster = isClusterPattern(item);
              return (
                <li
                  key={item}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                    isCluster ? "border-rose-300 bg-rose-100/70" : "border-rose-100 bg-rose-50/60"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {isCluster ? (
                      <Network className="h-3.5 w-3.5 shrink-0 text-rose-700" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                    )}
                    <span className="truncate font-mono font-semibold text-rose-900">{item}</span>
                  </div>
                  <span className="shrink-0 rounded-md bg-rose-600/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-rose-700 uppercase">
                    {isCluster ? t.wallet.clusterTag : t.wallet.blacklistTag}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {blacklist.length > BLACKLIST_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAllBlacklist((prev) => !prev)}
            className="mt-2 w-full cursor-pointer rounded-xl py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
          >
            {showAllBlacklist ? t.wallet.showLess : t.wallet.showAll(blacklist.length)}
          </button>
        )}

        {onAddBlacklistEntry && (
          <form onSubmit={handleReport} className="mt-4 border-t border-rose-100 pt-3.5">
            <label htmlFor="tp-blacklist-report" className="mb-1.5 block text-[11px] font-semibold text-slate-600">
              {t.wallet.reportLabel}
            </label>
            <div className="flex gap-2">
              <input
                id="tp-blacklist-report"
                value={reportValue}
                maxLength={64}
                onChange={(e) => {
                  setReportValue(e.target.value);
                  setReportError(null);
                }}
                placeholder={t.wallet.reportPlaceholder}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-900 focus:border-rose-300 focus:bg-white focus:ring-4 focus:ring-rose-100 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-700"
              >
                <Plus className="h-3.5 w-3.5" />
                {t.wallet.reportButton}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setReportValue("1903555777");
                  setReportError(null);
                }}
                className="cursor-pointer rounded-lg border border-dashed border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
              >
                {t.wallet.reportSample}
              </button>
              {reportError && <span className="text-[10px] font-medium text-rose-600">{reportError}</span>}
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}

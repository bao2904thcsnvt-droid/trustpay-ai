"use client";

import { useState, type FormEvent } from "react";
import {
  Repeat,
  Zap,
  Droplets,
  Wifi,
  Tv,
  Music,
  PiggyBank,
  AlertTriangle,
  CalendarClock,
  Plus,
  Ban,
  CheckCircle2,
  Flag,
  Hourglass,
} from "lucide-react";
import type {
  BudgetCategory,
  CategoryName,
  RecurringSubscription,
  SubscriptionUsageLevel,
} from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  isSubscriptionFlagged,
  sortSubscriptionsForDisplay,
  summarizeSubscriptions,
  SUBSCRIPTION_SAMPLES,
  validateSubscriptionDraft,
  type SubscriptionDraft,
} from "@/lib/agents/subscription-guard";
import { formatNumberInput, parseMoneyInput } from "@/lib/wallet/format";

export interface SubscriptionGuardProps {
  subscriptions: RecurringSubscription[];
  budgets: BudgetCategory[];
  onAddSubscription: (draft: SubscriptionDraft) => void;
  onCancelSubscription: (subscription: RecurringSubscription) => void;
  onToggleLowUsage: (subscription: RecurringSubscription) => void;
}

const USAGE_LEVELS: SubscriptionUsageLevel[] = ["HIGH", "MEDIUM", "LOW"];

function subscriptionIcon(name: string) {
  const lower = name.toLowerCase();
  if (/điện|evn|electric/.test(lower)) return Zap;
  if (/nước|sawaco|water/.test(lower)) return Droplets;
  if (/4g|5g|wifi|internet|viettel|vinaphone|mobifone|fpt/.test(lower)) return Wifi;
  if (/netflix|tv|youtube|galaxy play|fpt play|vieon|disney/.test(lower)) return Tv;
  if (/spotify|music|nhạc|zing/.test(lower)) return Music;
  return Repeat;
}

/**
 * Subscription Guard — danh sách khoản trừ tiền lặp lại hằng tháng, gắn cờ gói
 * ít dùng / dùng thử tự gia hạn và cho phép "Hủy gia hạn ngay" để cộng tiết kiệm.
 */
export default function SubscriptionGuard({
  subscriptions,
  budgets,
  onAddSubscription,
  onCancelSubscription,
  onToggleLowUsage,
}: SubscriptionGuardProps) {
  const { t, money, category } = useI18n();
  const defaultCategory: CategoryName = budgets.some((b) => b.name === "Hóa đơn") ? "Hóa đơn" : budgets[0]?.name ?? "Khác";

  const [name, setName] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dayInput, setDayInput] = useState("15");
  const [draftCategory, setDraftCategory] = useState<CategoryName>(defaultCategory);
  const [usageLevel, setUsageLevel] = useState<SubscriptionUsageLevel>("MEDIUM");
  const [isTrial, setIsTrial] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = summarizeSubscriptions(subscriptions);
  const sorted = sortSubscriptionsForDisplay(subscriptions);

  const applySample = (sample: SubscriptionDraft) => {
    setName(sample.name);
    setAmountInput(formatNumberInput(sample.monthlyAmount));
    setDayInput(String(sample.billingDay));
    setDraftCategory(budgets.some((b) => b.name === sample.category) ? sample.category : defaultCategory);
    setUsageLevel(sample.usageLevel);
    setIsTrial(sample.isTrial);
    setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const draft: SubscriptionDraft = {
      name,
      monthlyAmount: parseMoneyInput(amountInput),
      billingDay: Number.parseInt(dayInput, 10),
      category: draftCategory,
      usageLevel,
      isTrial,
    };
    const validation = validateSubscriptionDraft(draft);
    if (validation === "NAME") {
      setError(t.subscriptions.errorName);
      return;
    }
    if (validation === "AMOUNT") {
      setError(t.subscriptions.errorAmount);
      return;
    }
    if (validation === "DAY") {
      setError(t.subscriptions.errorDay);
      return;
    }
    onAddSubscription(draft);
    setName("");
    setAmountInput("");
    setIsTrial(false);
    setUsageLevel("MEDIUM");
    setError(null);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-pink-100 bg-white p-6 shadow-sm shadow-[#a50064]/5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
            <Repeat className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{t.subscriptions.title}</h2>
            <p className="text-xs text-slate-500">{t.subscriptions.subtitle}</p>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <CalendarClock className="h-3.5 w-3.5 text-[#a50064]" />
              {t.subscriptions.kpiMonthly}
            </p>
            <p className="mt-1 font-mono text-lg font-extrabold text-slate-900">{money(summary.activeMonthly)}</p>
            <p className="text-[11px] text-slate-500">{t.subscriptions.kpiActive(summary.activeCount)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t.subscriptions.kpiFlagged}
            </p>
            <p className="mt-1 font-mono text-lg font-extrabold text-amber-800">{summary.flaggedCount}</p>
            <p className="text-[11px] text-amber-700">{t.subscriptions.kpiFlaggedDesc(money(summary.flaggedMonthly))}</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3.5 text-white shadow-sm shadow-emerald-600/20">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-50">
              <PiggyBank className="h-3.5 w-3.5" />
              {t.subscriptions.kpiSaved}
            </p>
            <p className="mt-1 font-mono text-lg font-extrabold">
              {money(summary.savedMonthly)}
              <span className="text-xs font-semibold text-emerald-100">{t.common.perMonth}</span>
            </p>
            <p className="text-[11px] text-emerald-50">{t.subscriptions.kpiSavedYearly(money(summary.savedYearly))}</p>
          </div>
        </div>

        {/* Danh sách khoản trừ định kỳ */}
        <p className="mt-5 mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          {t.subscriptions.listTitle}
        </p>
        {sorted.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
            {t.subscriptions.empty}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((sub) => {
              const Icon = subscriptionIcon(sub.name);
              const flagged = isSubscriptionFlagged(sub);
              const cancelled = sub.status === "CANCELLED";
              return (
                <li
                  key={sub.id}
                  className={`rounded-2xl border p-3.5 transition-colors ${
                    cancelled
                      ? "border-slate-200 bg-slate-50 opacity-80"
                      : flagged
                        ? "border-amber-300 bg-amber-50/60"
                        : "border-slate-100 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          cancelled ? "bg-slate-200 text-slate-500" : "bg-pink-50 text-[#a50064]"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold ${cancelled ? "text-slate-500 line-through" : "text-slate-900"}`}>
                          {sub.name}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="text-slate-500">{t.subscriptions.billingDay(sub.billingDay)}</span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500">{category(sub.category)}</span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-semibold ${
                              sub.usageLevel === "LOW"
                                ? "bg-amber-100 text-amber-800"
                                : sub.usageLevel === "MEDIUM"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {t.subscriptions.usage[sub.usageLevel]}
                          </span>
                          {sub.isTrial && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">
                              <Hourglass className="h-2.5 w-2.5" />
                              {t.subscriptions.trialBadge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className={`font-mono text-sm font-bold ${cancelled ? "text-slate-400" : "text-slate-900"}`}>
                      {money(sub.monthlyAmount)}
                      <span className="text-[10px] font-semibold text-slate-400">{t.common.perMonth}</span>
                    </p>
                  </div>

                  {cancelled ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t.subscriptions.cancelledBadge} · {t.subscriptions.savedLabel(money(sub.monthlyAmount))}
                    </p>
                  ) : flagged ? (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 ring-1 ring-amber-200">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t.subscriptions.flaggedWarning}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {sub.usageLevel === "LOW" && !sub.isTrial && (
                          <button
                            type="button"
                            onClick={() => onToggleLowUsage(sub)}
                            className="cursor-pointer rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                          >
                            {t.subscriptions.markUsed}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onCancelSubscription(sub)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:brightness-110"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          {t.subscriptions.cancelNow}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onToggleLowUsage(sub)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-amber-300 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-50"
                      >
                        <Flag className="h-3 w-3" />
                        {t.subscriptions.markLow}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Thêm gói mới */}
      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Plus className="h-4 w-4 text-[#a50064]" />
            {t.subscriptions.addTitle}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">{t.subscriptions.addSamples}</span>
            {SUBSCRIPTION_SAMPLES.map((sample) => (
              <button
                key={sample.name}
                type="button"
                onClick={() => applySample(sample)}
                className="cursor-pointer rounded-lg border border-dashed border-pink-200 px-2 py-1 text-[10px] font-semibold text-[#a50064] hover:bg-pink-50"
              >
                {sample.name} · {money(sample.monthlyAmount)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="tp-sub-name" className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t.subscriptions.nameLabel}
            </label>
            <input
              id="tp-sub-name"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder={t.subscriptions.namePlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="tp-sub-amount" className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t.subscriptions.amountLabel}
            </label>
            <input
              id="tp-sub-amount"
              value={amountInput}
              inputMode="decimal"
              maxLength={20}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setError(null);
              }}
              placeholder={t.subscriptions.amountPlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="tp-sub-day" className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t.subscriptions.dayLabel}
            </label>
            <input
              id="tp-sub-day"
              type="number"
              min={1}
              max={28}
              value={dayInput}
              onChange={(e) => {
                setDayInput(e.target.value);
                setError(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="tp-sub-category" className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t.subscriptions.categoryLabel}
            </label>
            <select
              id="tp-sub-category"
              value={draftCategory}
              onChange={(e) => {
                const next = budgets.find((b) => b.name === e.target.value);
                if (next) setDraftCategory(next.name);
              }}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:outline-none"
            >
              {budgets.map((budget) => (
                <option key={budget.id} value={budget.name}>
                  {category(budget.name)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tp-sub-usage" className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t.subscriptions.usageLabel}
            </label>
            <select
              id="tp-sub-usage"
              value={usageLevel}
              onChange={(e) => {
                const next = USAGE_LEVELS.find((level) => level === e.target.value);
                if (next) setUsageLevel(next);
              }}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:outline-none"
            >
              {USAGE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t.subscriptions.usage[level]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={isTrial}
            onChange={(e) => setIsTrial(e.target.checked)}
            className="h-4 w-4 accent-[#a50064]"
          />
          {t.subscriptions.trialLabel}
        </label>

        {error && <p className="mt-2 text-[11px] font-medium text-rose-600">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 sm:text-sm"
          >
            <Plus className="h-4 w-4" />
            {t.subscriptions.addButton}
          </button>
        </div>
      </form>
    </div>
  );
}

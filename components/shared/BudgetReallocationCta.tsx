"use client";

import { ArrowLeftRight, Info } from "lucide-react";
import type { BudgetReallocationPlan } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface BudgetReallocationCtaProps {
  plan: BudgetReallocationPlan;
  onReallocate: (plan: BudgetReallocationPlan) => void;
  disabled?: boolean;
}

/**
 * Nút điều chuyển hạn mức thật giữa 2 danh mục (vd trích 1.000.000đ từ "Khác"
 * sang "Mua sắm"). Số tiền luôn bằng đúng phần chênh lệch còn thiếu.
 */
export default function BudgetReallocationCta({ plan, onReallocate, disabled = false }: BudgetReallocationCtaProps) {
  const { t, money, category } = useI18n();
  const from = category(plan.from);
  const to = category(plan.to);

  if (!plan.feasible) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-white/80 px-3 py-2 text-[11px] font-medium text-amber-800">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t.reallocation.infeasible(from, money(plan.availableInSource))}</span>
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onReallocate(plan)}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        <ArrowLeftRight className="h-4 w-4 shrink-0" />
        <span>{t.reallocation.cta(money(plan.amount), from, to)}</span>
      </button>
      <p className="mt-1.5 text-[11px] text-slate-500">{t.reallocation.hint(money(plan.availableInSource))}</p>
    </div>
  );
}

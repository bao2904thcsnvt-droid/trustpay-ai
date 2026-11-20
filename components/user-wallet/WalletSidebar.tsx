"use client";

import {
  Wallet,
  Utensils,
  ShoppingBag,
  Car,
  LayoutGrid,
  ShieldBan,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import type { BudgetCategory, CategoryName } from "@/types/trustpay";

export interface WalletSidebarProps {
  walletBalance: number;
  budgets: BudgetCategory[];
  blacklist: string[];
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + "đ";
}

function getCategoryIcon(name: CategoryName) {
  switch (name) {
    case "Ăn uống":
      return Utensils;
    case "Mua sắm":
      return ShoppingBag;
    case "Di chuyển":
      return Car;
    default:
      return LayoutGrid;
  }
}

function getProgressTheme(spent: number, limit: number) {
  const rawPct = limit > 0 ? (spent / limit) * 100 : 0;
  const pct = Math.min(100, Math.max(0, Math.round(rawPct)));

  if (spent > limit || rawPct >= 90) {
    return {
      pct,
      rawPct: Math.round(rawPct),
      barClass: "bg-gradient-to-r from-rose-500 to-red-600",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      textClass: "text-rose-600",
      statusLabel: spent > limit ? "Vượt hạn mức" : "Sắp chạm mức",
    };
  }

  if (rawPct >= 70) {
    return {
      pct,
      rawPct: Math.round(rawPct),
      barClass: "bg-gradient-to-r from-amber-400 to-orange-500",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      textClass: "text-amber-600",
      statusLabel: "Cần lưu ý",
    };
  }

  return {
    pct,
    rawPct: Math.round(rawPct),
    barClass: "bg-gradient-to-r from-emerald-400 to-emerald-600",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    textClass: "text-emerald-600",
    statusLabel: "An toàn",
  };
}

export default function WalletSidebar({
  walletBalance,
  budgets,
  blacklist,
}: WalletSidebarProps) {
  const totalLimit = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const totalPct =
    totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;

  return (
    <aside className="flex flex-col gap-5">
      {/* 1. Thẻ Số dư Ví Khả Dụng */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#a50064] via-[#c21878] to-[#d82d8b] p-6 text-white shadow-lg shadow-[#a50064]/20">
        {/* Trang trí nền */}
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
                <p className="text-xs font-medium text-pink-100">
                  Số dư ví khả dụng
                </p>
                <p className="text-[11px] text-pink-200/90">
                  Ví TrustPay • Cá nhân
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              AI Shield ON
            </span>
          </div>

          <div className="mt-5">
            <p className="font-mono text-3xl font-bold tracking-tight text-white">
              {formatVND(walletBalance)}
            </p>
            <p className="mt-1 text-xs text-pink-100/90">
              Đã chi {formatVND(totalSpent)} / {formatVND(totalLimit)} ngân sách
              tháng ({totalPct}%)
            </p>
          </div>
        </div>
      </div>

      {/* 2. Danh sách 4 Danh mục Ngân sách */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-50 text-[#a50064]">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Ngân sách chi tiêu
              </h2>
              <p className="text-xs text-slate-500">
                {budgets.length} danh mục theo dõi tự động
              </p>
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
                      <p className="text-sm font-semibold text-slate-900">
                        {budget.name}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {formatVND(budget.spent)} / {formatVND(budget.limit)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${theme.badgeClass}`}
                  >
                    {theme.rawPct}%
                  </span>
                </div>

                {/* Thanh tiến trình đổi màu */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${theme.barClass}`}
                    style={{ width: `${theme.pct}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className={`font-medium ${theme.textClass}`}>
                    {theme.statusLabel}
                  </span>
                  <span className="font-mono text-slate-500">
                    {remaining >= 0
                      ? `Còn ${formatVND(remaining)}`
                      : `Vượt ${formatVND(Math.abs(remaining))}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Danh sách Tài khoản Cảnh báo (Blacklist) */}
      <div className="rounded-3xl border border-rose-200/80 bg-white p-5 shadow-xs">
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <ShieldBan className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Danh sách cảnh báo (Blacklist)
              </h2>
              <p className="text-xs text-slate-500">
                Tự động chặn &amp; nâng mức rủi ro
              </p>
            </div>
          </div>

          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-100 px-2 font-mono text-xs font-bold text-rose-700">
            {blacklist.length}
          </span>
        </div>

        {blacklist.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">
            Chưa có tài khoản nào trong danh sách cảnh báo.
          </p>
        ) : (
          <ul className="space-y-2">
            {blacklist.map((item) => (
              <li
                key={item}
                className="flex items-center justify-between gap-2 rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                  <span className="truncate font-mono font-semibold text-rose-900">
                    {item}
                  </span>
                </div>
                <span className="shrink-0 rounded-md bg-rose-600/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-rose-700 uppercase">
                  Cảnh báo
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

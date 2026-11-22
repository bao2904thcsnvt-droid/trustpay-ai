"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  ShoppingCart,
  History as HistoryIcon,
  Lock,
  ShieldBan,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import type { WalletTransaction, WalletTransactionStatus } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface TransactionHistoryProps {
  transactions: WalletTransaction[];
}

const PREVIEW_COUNT = 6;

function statusTheme(status: WalletTransactionStatus) {
  switch (status) {
    case "COMPLETED":
      return { badge: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 };
    case "FROZEN":
      return { badge: "border-sky-200 bg-sky-50 text-sky-800", Icon: Lock };
    case "BLOCKED":
      return { badge: "border-rose-200 bg-rose-50 text-rose-700", Icon: ShieldBan };
    default:
      return { badge: "border-slate-200 bg-slate-100 text-slate-600", Icon: XCircle };
  }
}

/** Lịch sử giao dịch của Ví (lưu bền vững, mới nhất ở trên). */
export default function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const { t, money, category, data, dateTime } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? transactions : transactions.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, transactions.length - PREVIEW_COUNT);

  return (
    <div id="tp-history" className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <HistoryIcon className="h-4.5 w-4.5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">{t.history.title}</h2>
          <p className="text-xs text-slate-500">{t.history.subtitle}</p>
        </div>
        <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 font-mono text-xs font-bold text-slate-700">
          {transactions.length}
        </span>
      </div>

      {transactions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-center text-xs text-slate-500">
          {t.history.empty}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((tx) => {
            const theme = statusTheme(tx.status);
            const StatusIcon = theme.Icon;
            const ChannelIcon =
              tx.channel === "SHOPPING" ? ShoppingCart : tx.channel === "BUDGET_REALLOCATION" ? ArrowLeftRight : ArrowUpRight;
            const isDebit = tx.status === "COMPLETED" && tx.channel !== "BUDGET_REALLOCATION";

            return (
              <li key={tx.id} className="flex items-start gap-3 py-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-[#a50064]">
                  <ChannelIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-slate-900" title={data(tx.recipient)}>
                      {data(tx.recipient)}
                    </p>
                    <span
                      className={`font-mono text-xs font-bold ${
                        isDebit ? "text-slate-900" : tx.channel === "BUDGET_REALLOCATION" ? "text-sky-700" : "text-slate-400 line-through"
                      }`}
                    >
                      {isDebit ? "−" : ""}
                      {money(tx.amount)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="font-semibold text-slate-500">{t.history.channel[tx.channel]}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">{category(tx.category)}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-400">{dateTime(tx.timestamp)}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-bold ${theme.badge}`}
                    >
                      <StatusIcon className="h-2.5 w-2.5" />
                      {t.history.status[tx.status]}
                    </span>
                    {tx.channel !== "BUDGET_REALLOCATION" && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-600">
                        {tx.riskLevel} · {tx.riskScore}
                      </span>
                    )}
                  </div>
                  {tx.note && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{data(tx.note)}</p>}
                  {tx.ticketId && (
                    <p className="mt-0.5 font-mono text-[10px] text-slate-400">{t.history.ticket(tx.ticketId)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 w-full cursor-pointer rounded-xl py-2 text-xs font-semibold text-[#a50064] hover:bg-pink-50"
        >
          {expanded ? t.history.showLess : t.history.showMore(hiddenCount)}
        </button>
      )}
    </div>
  );
}

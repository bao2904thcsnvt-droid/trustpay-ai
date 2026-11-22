"use client";

import { useState } from "react";
import { Siren, Radar, ShieldCheck, ChevronDown, ChevronUp, Network, ArrowRight } from "lucide-react";
import type { AnomalyClusterState } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  ANOMALY_CLUSTER_PATTERN,
  ANOMALY_HUB_ACCOUNT,
  ANOMALY_INBOUND_TRANSFERS,
  ANOMALY_LINKED_MULE_ACCOUNTS,
  totalInboundAmount,
} from "@/lib/ops/anomaly-cluster";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";
import { formatClock } from "@/lib/wallet/format";

export interface AnomalyAlertBannerProps {
  state: AnomalyClusterState;
  onLock: () => void;
  highlighted?: boolean;
}

/**
 * Thanh cảnh báo khẩn cấp chạy ngang màn hình Ops: nhiều tài khoản cùng đổ tiền
 * vào một STK trong 5 phút → "Truy vết & Phong tỏa cụm STK" vào Blacklist sống.
 */
export default function AnomalyAlertBanner({ state, onLock, highlighted = false }: AnomalyAlertBannerProps) {
  const { t, money } = useI18n();
  const [showTrace, setShowTrace] = useState(false);
  const isLocked = state.status === "LOCKED";
  const lockedTime = state.lockedAt ? formatClock(Date.parse(state.lockedAt)) : "--:--";
  const lockedCount = 1 + ANOMALY_LINKED_MULE_ACCOUNTS.length;

  return (
    <section
      id="tp-anomaly-banner"
      role={isLocked ? "status" : "alert"}
      className={`overflow-hidden rounded-3xl border text-white shadow-lg transition-all ${
        isLocked
          ? "border-emerald-300 bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-700 shadow-emerald-600/20"
          : "border-rose-300 bg-gradient-to-r from-rose-700 via-red-600 to-rose-700 shadow-rose-600/25"
      } ${highlighted ? "tp-highlight" : ""}`}
    >
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
            {isLocked ? <ShieldCheck className="h-5 w-5" /> : <Siren className="h-5 w-5 animate-pulse" />}
          </span>
          <div className="leading-tight">
            {!isLocked && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wider">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                {t.anomaly.live}
              </span>
            )}
            <p className="mt-1 text-[11px] font-bold tracking-wide text-white/90 uppercase">
              {isLocked ? t.anomaly.lockedTitle(ANOMALY_CLUSTER_PATTERN) : t.anomaly.severity}
            </p>
          </div>
        </div>

        {isLocked ? (
          <p className="min-w-0 flex-1 text-sm font-semibold">
            {t.anomaly.lockedDesc(lockedCount, lockedTime)}
          </p>
        ) : (
          <div className="tp-marquee relative min-w-0 flex-1 overflow-hidden rounded-xl bg-black/15 py-2.5">
            <p className="sr-only">{t.anomaly.message}</p>
            <div aria-hidden="true" className="tp-marquee-track flex w-max text-sm font-semibold whitespace-nowrap">
              <span className="pr-16">{t.anomaly.message}</span>
              <span className="pr-16">{t.anomaly.message}</span>
            </div>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTrace((prev) => !prev)}
            aria-expanded={showTrace}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/25"
          >
            {showTrace ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showTrace ? t.anomaly.hideTrace : t.anomaly.showTrace}
          </button>
          {!isLocked && (
            <button
              type="button"
              onClick={onLock}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-rose-700 shadow-md transition-all hover:bg-rose-50 active:scale-[0.99] sm:text-sm"
            >
              <Radar className="h-4 w-4" />
              {t.anomaly.button}
            </button>
          )}
        </div>
      </div>

      {showTrace && (
        <div className="border-t border-white/20 bg-black/15 px-4 py-4">
          <p className="text-xs font-bold tracking-wide text-white/90 uppercase">{t.anomaly.traceTitle}</p>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="mb-1.5 text-[11px] font-semibold text-white/80">{t.anomaly.senders}</p>
              <ul className="space-y-1.5">
                {ANOMALY_INBOUND_TRANSFERS.map((event) => (
                  <li
                    key={event.senderAccount}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-[11px]"
                  >
                    <span className="font-mono text-white/70">{event.timeLabel}</span>
                    <span className="font-mono font-semibold">{maskRecipientForDisplay(event.senderAccount)}</span>
                    <span className="text-white/70">{event.senderBank}</span>
                    <ArrowRight className="h-3 w-3 text-white/60" />
                    <span className="font-mono font-semibold">{ANOMALY_CLUSTER_PATTERN}</span>
                    <span className="ml-auto font-mono font-bold">{money(event.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right font-mono text-xs font-bold">{t.anomaly.totalInbound(money(totalInboundAmount()))}</p>
            </div>
            <div className="lg:col-span-5">
              <p className="mb-1.5 text-[11px] font-semibold text-white/80">{t.anomaly.hub}</p>
              <p className="rounded-xl bg-white/15 px-3 py-2 font-mono text-sm font-bold">
                {maskRecipientForDisplay(ANOMALY_HUB_ACCOUNT)}
              </p>
              <p className="mt-3 mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-white/80">
                <Network className="h-3.5 w-3.5" />
                {t.anomaly.linked}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[ANOMALY_CLUSTER_PATTERN, ...ANOMALY_LINKED_MULE_ACCOUNTS].map((account) => (
                  <span
                    key={account}
                    className={`rounded-lg px-2 py-1 font-mono text-[11px] font-semibold ${
                      isLocked ? "bg-white/25" : "bg-white/10"
                    }`}
                  >
                    {maskRecipientForDisplay(account)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Cloud,
  Wallet,
  ShieldAlert,
  RotateCcw,
  CheckCircle2,
  Compass,
  AlertTriangle,
} from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import LanguageToggle from "@/components/layout/LanguageToggle";

export type AppTab = "user-wallet" | "fintech-ops";

export interface AppHeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  pendingAlertsCount: number;
  onOpenOnboarding: () => void;
  onReset: () => void;
}

/** Header cố định: logo, 2 phân hệ, mở lại thẻ chào mừng, Reset Demo và nút VI | EN. */
export default function AppHeader({
  activeTab,
  onTabChange,
  pendingAlertsCount,
  onOpenOnboarding,
  onReset,
}: AppHeaderProps) {
  const { t } = useI18n();
  const [resetArmed, setResetArmed] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const armTimerRef = useRef<number | null>(null);
  const doneTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
      if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current);
    };
  }, []);

  const handleResetClick = () => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }

    if (!resetArmed) {
      setResetArmed(true);
      armTimerRef.current = window.setTimeout(() => setResetArmed(false), 3500);
      return;
    }

    setResetArmed(false);
    onReset();
    setResetDone(true);
    if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current);
    doneTimerRef.current = window.setTimeout(() => setResetDone(false), 2200);
  };

  const tabClass = (tab: AppTab) =>
    `flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all lg:flex-initial ${
      activeTab === tab
        ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25"
        : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-xs backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Trái: Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
            <ShieldCheck className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900">
                TrustPay <span className="text-[#a50064]">AI</span>
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#a50064] sm:inline-flex">
                <Cloud className="h-3 w-3" />
                {t.common.awsBadge}
              </span>
            </div>
            <span className="text-xs text-slate-500">{t.common.demoAccount}</span>
          </div>
        </div>

        {/* Giữa: 2 phân hệ */}
        <nav
          aria-label={t.header.navLabel}
          className="order-3 flex w-full items-center justify-center gap-1 rounded-2xl bg-slate-100 p-1 lg:order-2 lg:w-auto"
        >
          <button
            type="button"
            aria-current={activeTab === "user-wallet" ? "page" : undefined}
            onClick={() => onTabChange("user-wallet")}
            className={tabClass("user-wallet")}
          >
            <Wallet className="h-4 w-4 shrink-0" />
            <span className="truncate">{t.header.walletTab}</span>
          </button>

          <button
            type="button"
            aria-current={activeTab === "fintech-ops" ? "page" : undefined}
            onClick={() => onTabChange("fintech-ops")}
            className={tabClass("fintech-ops")}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span className="truncate">{t.header.opsTab}</span>
            <span
              title={t.header.pendingAlerts(pendingAlertsCount)}
              className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-xs font-bold ${
                activeTab === "fintech-ops"
                  ? "bg-white text-[#a50064]"
                  : pendingAlertsCount > 0
                    ? "bg-rose-600 text-white"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {pendingAlertsCount}
            </span>
          </button>
        </nav>

        {/* Phải: Giới thiệu, Reset Demo, VI | EN (góc trên bên phải) */}
        <div className="order-2 flex flex-wrap items-center justify-end gap-2 lg:order-3">
          <button
            type="button"
            onClick={onOpenOnboarding}
            title={t.header.welcomeTitle}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all hover:border-pink-300 hover:bg-pink-50 hover:text-[#a50064]"
          >
            <Compass className="h-4 w-4" />
            <span className="hidden md:inline">{t.header.welcome}</span>
          </button>

          <button
            type="button"
            onClick={handleResetClick}
            title={t.header.resetTitle}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
              resetDone
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : resetArmed
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-pink-300 hover:bg-pink-50 hover:text-[#a50064]"
            }`}
          >
            {resetDone ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>{t.header.resetDone}</span>
              </>
            ) : resetArmed ? (
              <>
                <AlertTriangle className="h-4 w-4" />
                <span>{t.header.resetConfirm}</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                <span className="hidden xl:inline">{t.header.reset}</span>
                <span className="xl:hidden">{t.header.resetShort}</span>
              </>
            )}
          </button>

          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}

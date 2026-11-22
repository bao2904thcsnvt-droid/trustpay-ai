"use client";

import { useEffect } from "react";
import {
  ShieldCheck,
  Cloud,
  Wallet,
  ShieldAlert,
  ArrowRight,
  X,
  Bot,
  Workflow,
  ArrowLeftRight,
  HeartHandshake,
  Siren,
  Languages,
  Lock,
} from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import LanguageToggle from "@/components/layout/LanguageToggle";
import { DEFAULT_WALLET_BALANCE } from "@/lib/wallet/defaults";

export type OnboardingRole = "wallet" | "ops";

export interface WelcomeOnboardingProps {
  onChooseRole: (role: OnboardingRole) => void;
  onClose: () => void;
}

const HIGHLIGHT_ICONS = [Bot, Workflow, ArrowLeftRight, HeartHandshake, Siren, Languages];

/** Thẻ chào mừng (Onboarding) chọn vào thẳng Ví Người Dùng hoặc Không gian Vận hành. */
export default function WelcomeOnboarding({ onChooseRole, onClose }: WelcomeOnboardingProps) {
  const { t, money } = useI18n();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gradient-to-br from-[#fdf2f8]/95 via-white/95 to-slate-100/95 p-4 backdrop-blur-md"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#d82d8b]/12 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-[#a50064]/10 blur-3xl"
      />

      <div className="relative z-10 my-auto w-full max-w-3xl rounded-3xl border border-pink-100 bg-white/95 p-6 shadow-xl shadow-[#a50064]/10 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-200/80 bg-pink-50 px-3.5 py-1 text-xs font-semibold text-[#a50064]">
            <Cloud className="h-3.5 w-3.5" />
            {t.common.awsBadge}
          </span>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              type="button"
              onClick={onClose}
              aria-label={t.onboarding.closeLabel}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-lg shadow-[#a50064]/30">
            <ShieldCheck className="h-9 w-9" strokeWidth={2.2} />
          </div>
          <span className="text-[11px] font-bold tracking-widest text-[#a50064] uppercase">{t.onboarding.badge}</span>
          <h1 id="tp-onboarding-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t.onboarding.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">{t.onboarding.subtitle}</p>
        </div>

        {/* 2 vai trò */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChooseRole("wallet")}
            className="group flex cursor-pointer flex-col items-start rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] p-5 text-left text-white shadow-lg shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Wallet className="h-5 w-5" />
            </span>
            <span className="mt-3 text-base font-bold">{t.onboarding.walletTitle}</span>
            <span className="mt-1 text-xs leading-relaxed text-pink-50/90">{t.onboarding.walletDesc}</span>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#a50064]">
              {t.onboarding.walletCta}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChooseRole("ops")}
            className="group flex cursor-pointer flex-col items-start rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-left text-white shadow-lg shadow-slate-900/25 transition-all hover:brightness-110 active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <span className="mt-3 text-base font-bold">{t.onboarding.opsTitle}</span>
            <span className="mt-1 text-xs leading-relaxed text-slate-300">{t.onboarding.opsDesc}</span>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-900">
              {t.onboarding.opsCta}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>

        {/* 6 nhóm tính năng */}
        <p className="mt-6 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          {t.onboarding.highlightsTitle}
        </p>
        <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {t.onboarding.highlights.map((item, index) => {
            const Icon = HIGHLIGHT_ICONS[index % HIGHLIGHT_ICONS.length];
            return (
              <li
                key={item}
                className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-700"
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a50064]" />
                <span>{item}</span>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-[#a50064]">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-slate-500">{t.onboarding.demoBalance}</p>
              <p className="font-mono font-semibold text-slate-900">{money(DEFAULT_WALLET_BALANCE)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-[#a50064]">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-slate-500">{t.onboarding.modeLabel}</p>
              <p className="font-semibold text-slate-900">{t.onboarding.modeValue}</p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">{t.onboarding.footer}</p>
      </div>
    </div>
  );
}

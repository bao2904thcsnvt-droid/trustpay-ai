"use client";

import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

export type EasyPanel = "home" | "scan" | "transfer" | "check";

export interface EasyHomeProps {
  balance: number;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  sourceLabel: string;
  panel: EasyPanel;
  onSelectPanel: (panel: Exclude<EasyPanel, "home">) => void;
  onBack: () => void;
  children?: ReactNode;
}

/**
 * Easy Mode cho người dùng phổ thông & người lớn tuổi: chữ to, thoáng, chỉ 3 nút
 * hành động khổng lồ. Các bảng kỹ thuật (Ops, AWS FinOps, SDK JSON, Telemetry)
 * được ẩn qua lớp `.tp-easy` trong globals.css.
 */
export default function EasyHome({
  balance,
  balanceHidden,
  onToggleBalance,
  sourceLabel,
  panel,
  onSelectPanel,
  onBack,
  children,
}: EasyHomeProps) {
  const { t, money } = useI18n();
  const actions: { id: Exclude<EasyPanel, "home">; label: string; desc: string; tint: string }[] = [
    { id: "scan", label: t.easy.scan, desc: t.easy.scanDesc, tint: "from-sky-600 to-cyan-500" },
    { id: "transfer", label: t.easy.transfer, desc: t.easy.transferDesc, tint: "from-[#a50064] to-[#d82d8b]" },
    { id: "check", label: t.easy.check, desc: t.easy.checkDesc, tint: "from-emerald-600 to-teal-500" },
  ];

  return (
    <div className="tp-easy mx-auto flex w-full max-w-3xl flex-col gap-5">
      <section className="rounded-3xl border border-pink-200 bg-white p-5 shadow-sm">
        <p className="text-base font-semibold text-slate-600">{t.easy.greeting}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{t.easy.balance}</p>
            <p className="font-mono text-3xl font-extrabold text-slate-900 sm:text-4xl" aria-live="polite">
              {balanceHidden ? t.privacy.hidden : money(balance)}
            </p>
            <p className="mt-1 text-sm text-slate-500">{t.easy.source(sourceLabel)}</p>
          </div>
          <button
            type="button"
            onClick={onToggleBalance}
            aria-pressed={balanceHidden}
            aria-label={balanceHidden ? t.privacy.show : t.privacy.hide}
            title={balanceHidden ? t.privacy.show : t.privacy.hide}
            className="inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
          >
            {balanceHidden ? <Eye className="h-7 w-7" /> : <EyeOff className="h-7 w-7" />}
          </button>
        </div>
      </section>

      {panel === "home" ? (
        <div className="grid grid-cols-1 gap-4">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onSelectPanel(action.id)}
              className={`flex min-h-28 w-full cursor-pointer flex-col items-start justify-center rounded-3xl bg-gradient-to-r px-6 py-5 text-left text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.99] ${action.tint}`}
            >
              <span className="text-2xl font-extrabold sm:text-3xl">{action.label}</span>
              <span className="mt-1 text-base text-white/90">{action.desc}</span>
            </button>
          ))}
          <p className="text-center text-sm text-slate-500">{t.easy.proHint}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center self-start rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-bold text-slate-800 hover:bg-slate-100"
          >
            {t.easy.back}
          </button>
          {children}
        </div>
      )}
    </div>
  );
}

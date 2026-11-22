"use client";

import { Compass, ChevronDown, CheckCircle2, ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

export type TourStepIndex = 0 | 1 | 2;

export interface QuickTourProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  completed: readonly [boolean, boolean, boolean];
  onStep: (step: TourStepIndex) => void;
}

const STEP_INDEXES: readonly TourStepIndex[] = [0, 1, 2];

/** Thẻ Tour hướng dẫn nhanh 3 bước, thu gọn được ở góc màn hình. */
export default function QuickTour({ collapsed, onToggleCollapsed, completed, onStep }: QuickTourProps) {
  const { t } = useI18n();
  const doneCount = completed.filter(Boolean).length;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="fixed bottom-4 left-4 z-40 inline-flex cursor-pointer items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl shadow-slate-900/30 transition-all hover:bg-slate-800"
      >
        <Compass className="h-4 w-4 text-amber-300" />
        {t.tour.expand}
        <span className="rounded-full bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">
          {doneCount}/3
        </span>
      </button>
    );
  }

  return (
    <aside
      aria-label={t.tour.title}
      className="fixed bottom-4 left-4 z-40 w-[calc(100%-2rem)] max-w-xs overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
    >
      <div className="flex items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-amber-300" />
          <div>
            <p className="text-xs font-bold">{t.tour.title}</p>
            <p className="text-[10px] text-slate-300">{t.tour.progress(doneCount, 3)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t.tour.collapse}
          title={t.tour.collapse}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <p className="px-4 pt-2.5 text-[10px] text-slate-500">{t.tour.subtitle}</p>
      <ol className="space-y-1.5 p-3">
        {STEP_INDEXES.map((index) => {
          const step = t.tour.steps[index];
          const done = completed[index];
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => onStep(index)}
                className={`group flex w-full cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                  done
                    ? "border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-pink-300 hover:bg-pink-50/50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                    done ? "bg-emerald-600 text-white" : "bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                    {t.tour.stepLabel(index + 1)}
                    {done ? ` · ${t.tour.done}` : ""}
                  </span>
                  <span className="block text-xs font-bold text-slate-900">{step?.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{step?.desc}</span>
                </span>
                <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#a50064]" />
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

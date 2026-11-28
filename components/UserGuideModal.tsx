"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BookOpen,
  ClipboardPaste,
  Fingerprint,
  Landmark,
  Repeat,
  ScanLine,
  ShieldAlert,
  Smartphone,
  X,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useHubState } from "@/lib/hub/hub-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

/** 7 bước hướng dẫn người mới (thứ tự cố định, khớp `t.beginner.steps`). */
export const BEGINNER_GUIDE_STEPS = ["install", "banks", "scan", "transfer", "paste", "shield", "biometric"] as const;

export type BeginnerGuideStep = (typeof BEGINNER_GUIDE_STEPS)[number];

const STEP_ICONS: Record<BeginnerGuideStep, LucideIcon> = {
  install: Smartphone,
  banks: Landmark,
  scan: ScanLine,
  transfer: Repeat,
  paste: ClipboardPaste,
  shield: ShieldAlert,
  biometric: Fingerprint,
};

export interface UserGuideModalProps {
  initialStep?: BeginnerGuideStep;
  onClose: () => void;
  /** "Dùng thử tính năng này": đóng hướng dẫn và mở thẳng tính năng tương ứng (kèm dữ liệu mẫu an toàn). */
  onTryStep: (step: BeginnerGuideStep) => void;
  /** Mở bộ hướng dẫn tính năng nâng cao (Copilot, Soi mã, Safe Shopping, Call Shield, Ops). */
  onOpenAdvanced?: () => void;
}

/**
 * Hướng dẫn sử dụng cho người mới (Interactive User Guide) — 7 thẻ đánh số, nền Obsidian `#090D16`,
 * font Be Vietnam Pro, đổi ngôn ngữ VI | EN ngay trong hộp, tự phóng to chữ khi bật Easy Mode.
 */
export default function UserGuideModal({ initialStep = "install", onClose, onTryStep, onOpenAdvanced }: UserGuideModalProps) {
  const { t, lang, setLang } = useI18n();
  const mounted = useHasMounted();
  const easy = useHubState().uiMode === "easy";
  const [active, setActive] = useState<BeginnerGuideStep>(initialStep);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Partial<Record<BeginnerGuideStep, HTMLLIElement | null>>>({});

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  const total = BEGINNER_GUIDE_STEPS.length;
  const activeIndex = BEGINNER_GUIDE_STEPS.indexOf(active);

  const goTo = (index: number) => {
    const step = BEGINNER_GUIDE_STEPS[Math.max(0, Math.min(total - 1, index))];
    setActive(step);
    window.setTimeout(() => cardRefs.current[step]?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  };

  if (!mounted) return null;

  // Easy Mode: chữ lớn hơn một bậc, nút cao hơn.
  const text = easy
    ? { title: "text-xl", body: "text-base", small: "text-sm", step: "text-lg", button: "min-h-12 text-base" }
    : { title: "text-lg", body: "text-sm", small: "text-xs", step: "text-base", button: "min-h-11 text-sm" };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-beginner-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{ fontFamily: "var(--font-be-vietnam-pro), var(--font-inter), system-ui, sans-serif" }}
        className="tp-sheet-in flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#090D16] text-[#E6EAF2] shadow-2xl outline-none sm:rounded-3xl"
      >
        {/* Đầu hộp: tiêu đề, VI | EN, đóng */}
        <header className="flex items-start gap-3 border-b border-white/10 px-5 pt-5 pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="tp-beginner-title" className={`${text.title} leading-snug font-bold text-white`}>
              {t.beginner.title}
            </h2>
            <p className={`mt-1 ${text.small} leading-relaxed text-[#9AA4B8]`}>{t.beginner.subtitle}</p>
            {easy && <p className={`mt-1 ${text.small} font-semibold text-emerald-300`}>{t.beginner.easyNote}</p>}
          </div>
          <div role="group" aria-label={t.beginner.language} className="flex shrink-0 overflow-hidden rounded-xl border border-white/15">
            {(["vi", "en"] as const).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
                className={`cursor-pointer px-2.5 py-1.5 font-mono text-xs font-bold uppercase transition-colors ${
                  lang === code ? "bg-[#d82d8b] text-white" : "text-[#9AA4B8] hover:bg-white/10"
                }`}
              >
                {code}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.beginner.close}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/15 text-[#C3CADB] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Thanh tiến trình 7 bước */}
        <nav aria-label={t.beginner.stepOf(activeIndex + 1, total)} className="flex items-center gap-1.5 px-5 pt-3">
          {BEGINNER_GUIDE_STEPS.map((step, index) => (
            <button
              key={step}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${index + 1}. ${t.beginner.steps[index]?.title ?? ""}`}
              aria-current={step === active ? "step" : undefined}
              className={`h-1.5 flex-1 cursor-pointer rounded-full transition-colors ${
                index <= activeIndex ? "bg-[#d82d8b]" : "bg-white/10 hover:bg-white/20"
              }`}
            />
          ))}
        </nav>
        <p className={`px-5 pt-2 font-mono ${text.small} text-[#9AA4B8]`}>{t.beginner.stepOf(activeIndex + 1, total)}</p>

        {/* 7 thẻ hướng dẫn */}
        <ol className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-5 py-3">
          {BEGINNER_GUIDE_STEPS.map((step, index) => {
            const content = t.beginner.steps[index];
            if (!content) return null;
            const Icon = STEP_ICONS[step];
            const open = step === active;
            return (
              <li
                key={step}
                ref={(node) => {
                  cardRefs.current[step] = node;
                }}
                className={`rounded-2xl border transition-colors ${
                  open ? "border-[#d82d8b]/50 bg-white/[0.06]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActive(step)}
                  aria-expanded={open}
                  className="flex w-full cursor-pointer items-start gap-3 p-3.5 text-left"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold ${
                      open ? "bg-[#d82d8b] text-white" : "bg-white/10 text-[#C3CADB]"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-center gap-2 ${text.step} leading-snug font-semibold text-white`}>
                      <Icon className="h-4 w-4 shrink-0 text-[#f472b6]" aria-hidden="true" />
                      {content.title}
                    </span>
                    <span className={`mt-1 block ${text.body} leading-relaxed text-[#B4BCCD]`}>{content.summary}</span>
                  </span>
                </button>
                {open && (
                  <div className="space-y-3 px-3.5 pb-3.5 sm:pl-[3.75rem]">
                    <ul className="space-y-2">
                      {content.steps.map((line) => (
                        <li key={line} className={`flex gap-2 ${text.body} leading-relaxed text-[#E6EAF2]`}>
                          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d82d8b]" />
                          <span className="min-w-0">{line}</span>
                        </li>
                      ))}
                    </ul>
                    <p className={`rounded-xl bg-white/5 px-3 py-2 ${text.small} leading-relaxed text-[#9AA4B8]`}>💡 {content.tip}</p>
                    <button
                      type="button"
                      data-testid={`tp-guide-try-${step}`}
                      onClick={() => onTryStep(step)}
                      className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 ${text.button} font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110`}
                    >
                      {t.beginner.tryNow}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* Chân hộp */}
        <footer className="space-y-2 border-t border-white/10 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className={`${text.small} leading-relaxed text-[#7E889C]`}>{t.beginner.demoNote}</p>
          {onOpenAdvanced && (
            <button
              type="button"
              onClick={onOpenAdvanced}
              className={`${text.small} cursor-pointer font-semibold text-[#f472b6] underline-offset-2 hover:underline`}
            >
              {t.beginner.advanced}
            </button>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={activeIndex === 0}
              onClick={() => goTo(activeIndex - 1)}
              className={`${text.button} flex-1 cursor-pointer rounded-2xl border border-white/15 px-4 py-2 font-semibold text-[#C3CADB] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {t.beginner.prev}
            </button>
            <button
              type="button"
              onClick={() => (activeIndex === total - 1 ? onClose() : goTo(activeIndex + 1))}
              className={`${text.button} flex-1 cursor-pointer rounded-2xl bg-white px-4 py-2 font-bold text-[#090D16] hover:bg-slate-200`}
            >
              {activeIndex === total - 1 ? t.beginner.done : t.beginner.next}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

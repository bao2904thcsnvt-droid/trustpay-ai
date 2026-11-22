"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MessageSquareText,
  PhoneCall,
  QrCode,
  Repeat,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Activity,
  X,
} from "lucide-react";
import { setTipsEnabled, usePreferences } from "@/lib/preferences/preferences-store";
import { useI18n } from "@/components/i18n/I18nProvider";

export type GuideTopicIndex = 0 | 1 | 2 | 3 | 4;

export interface UserGuideModalProps {
  initialTopic?: GuideTopicIndex;
  onClose: () => void;
  /** "Dùng thử ngay": đóng hướng dẫn và nhảy tới đúng tính năng. */
  onTryNow: (topic: GuideTopicIndex) => void;
}

const TOPIC_COUNT = 5;

interface IllustrationSpec {
  Main: typeof Sparkles;
  Side: typeof Sparkles;
  gradient: string;
  chips: string[];
}

const ILLUSTRATIONS: IllustrationSpec[] = [
  { Main: MessageSquareText, Side: Sparkles, gradient: "from-[#a50064] to-[#d82d8b]", chips: ["250.000đ", "Nguyễn Minh", "Ăn uống"] },
  { Main: QrCode, Side: ScanLine, gradient: "from-[#a50064] to-indigo-600", chips: ["EMVCo", "CRC-16", "1903xxxx"] },
  { Main: ShoppingCart, Side: Repeat, gradient: "from-violet-600 to-[#d82d8b]", chips: ["Safe Shopping", "Trial", "-79.000đ"] },
  { Main: PhoneCall, Side: Users, gradient: "from-rose-600 to-[#a50064]", chips: ["Transcribe", "15s", "Guardian"] },
  { Main: LayoutDashboard, Side: Activity, gradient: "from-slate-900 to-[#a50064]", chips: ["Ops", "Blacklist", "KMS"] },
];

function GuideIllustration({ index }: { index: GuideTopicIndex }) {
  const { Main, Side, gradient, chips } = ILLUSTRATIONS[index] ?? ILLUSTRATIONS[0];
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-40 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} text-white sm:h-full sm:min-h-56`}
    >
      <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute -right-8 -bottom-12 h-36 w-36 rounded-full bg-white/10" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
            <Main className="h-10 w-10" strokeWidth={1.8} />
          </div>
          <span className="absolute -right-3 -bottom-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-[#a50064] shadow-lg">
            <Side className="h-5 w-5" />
          </span>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 px-4">
          {chips.map((chip) => (
            <span key={chip} className="rounded-full bg-white/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold ring-1 ring-white/25">
              {chip}
            </span>
          ))}
        </div>
      </div>
      <ShieldCheck className="absolute top-3 right-3 h-5 w-5 text-white/60" />
    </div>
  );
}

/**
 * Interactive User Manual: 5 chủ đề, mỗi chủ đề có minh họa, các bước thao tác,
 * công nghệ AWS liên quan và nút "Dùng thử ngay". Laptop: modal giữa màn hình;
 * điện thoại: bottom sheet.
 */
export default function UserGuideModal({ initialTopic = 0, onClose, onTryNow }: UserGuideModalProps) {
  const { t } = useI18n();
  const prefs = usePreferences();
  const [topic, setTopic] = useState<GuideTopicIndex>(initialTopic);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const topics = t.guide.topics;
  const current = topics[topic] ?? topics[0];
  const goTo = (next: number) => setTopic(Math.max(0, Math.min(TOPIC_COUNT - 1, next)) as GuideTopicIndex);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-guide-title"
      className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="tp-sheet-in relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-pink-200/70 bg-white shadow-2xl shadow-slate-950/40 sm:max-h-[90vh] sm:rounded-3xl">
        <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-200 sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-3 pb-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id="tp-guide-title" className="flex items-center gap-2 text-base font-extrabold text-slate-900 sm:text-lg">
              <BookOpen className="h-5 w-5 shrink-0 text-[#a50064]" />
              <span>{t.guide.title}</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{t.guide.subtitle}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.guide.close}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs chủ đề (cuộn ngang trên điện thoại) */}
        <div role="tablist" aria-label={t.guide.title} className="tp-scroll-x flex snap-x gap-1.5 border-b border-slate-100 px-4 py-2.5 sm:px-6">
          {topics.map((item, index) => (
            <button
              key={item.tab}
              type="button"
              role="tab"
              aria-selected={topic === index}
              onClick={() => goTo(index)}
              className={`inline-flex shrink-0 cursor-pointer snap-start items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                topic === index
                  ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-pink-50 hover:text-[#a50064]"
              }`}
            >
              <span className="font-mono text-[10px] opacity-80">{index + 1}</span>
              {item.tab}
            </button>
          ))}
        </div>

        {/* Nội dung chủ đề */}
        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 sm:grid-cols-5 sm:p-6">
          <div className="sm:col-span-2">
            <GuideIllustration index={topic} />
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:col-span-3">
            <p className="text-[11px] font-bold tracking-wide text-[#a50064] uppercase">
              {t.guide.topicOf(topic + 1, TOPIC_COUNT)}
            </p>
            <h3 className="text-lg font-extrabold text-slate-900">{current.title}</h3>
            <p className="text-sm leading-relaxed text-slate-600">{current.intro}</p>
            <ol className="space-y-2">
              {current.steps.map((step, index) => (
                <li key={step} className="flex gap-2.5 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pink-100 font-mono text-[10px] font-bold text-[#a50064]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <span className="font-bold text-slate-800">{t.guide.awsLabel}: </span>
              {current.aws}
            </p>
            <button
              type="button"
              onClick={() => onTryNow(topic)}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-5 py-3 text-sm font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 sm:w-auto sm:self-start"
            >
              {t.guide.tryNow}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Footer: bật/tắt Mẹo nhanh + điều hướng */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:px-6">
          <button
            type="button"
            role="switch"
            aria-checked={prefs.tipsEnabled}
            onClick={() => setTipsEnabled(!prefs.tipsEnabled)}
            className="inline-flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-1 py-1 text-left text-xs font-semibold text-slate-700"
          >
            <span
              aria-hidden="true"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                prefs.tipsEnabled ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-1 ring-slate-200 transition-transform ${
                  prefs.tipsEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </span>
            <span className="min-w-0">{t.guide.tipsToggle}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={topic === 0}
              onClick={() => goTo(topic - 1)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              {t.guide.prev}
            </button>
            <button
              type="button"
              disabled={topic === TOPIC_COUNT - 1}
              onClick={() => goTo(topic + 1)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.guide.next}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

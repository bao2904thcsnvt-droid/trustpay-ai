"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Mic, PhoneCall, PhoneOff, ShieldCheck, ShieldAlert } from "lucide-react";
import type { AppLanguage } from "@/types/trustpay";
import {
  assessCallRisk,
  CALL_SCRIPT,
  CALL_SHIELD_CALLER,
  captionsRevealed,
  detectCallKeywords,
} from "@/lib/call-shield/call-shield";
import { useFeatureState } from "@/lib/features/feature-store";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface CallShieldBarProps {
  onStart: () => void;
  onEnd: () => void;
  highlighted?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tô sáng cụm từ khóa thúc ép trong một dòng phụ đề. */
function HighlightedLine({ text, lang }: { text: string; lang: AppLanguage }) {
  const phrases = detectCallKeywords(text, lang).map((hit) => hit.phrase);
  if (phrases.length === 0) {
    return <>{text}</>;
  }
  const pattern = new RegExp(`(${phrases.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        phrases.some((phrase) => phrase.toLowerCase() === part.toLowerCase()) ? (
          <mark key={index} className="rounded bg-rose-200 px-0.5 font-semibold text-rose-900">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Active Call Shield ở đầu khung chuyển tiền: "Trạng thái cuộc gọi: Bình thường"
 * ↔ "Đang nghe cuộc gọi từ số lạ". Khi bật, phát phụ đề Amazon Transcribe (mô
 * phỏng) và đánh dấu từ khóa thúc ép; lệnh chuyển tạo trong lúc này bị nâng rủi ro.
 */
export default function CallShieldBar({ onStart, onEnd, highlighted = false }: CallShieldBarProps) {
  const { t, lang } = useI18n();
  const { callShield } = useFeatureState();
  // Không đọc đồng hồ khi render (Cache Components prerender) — chỉ cập nhật từ timer phía trình duyệt.
  const [now, setNow] = useState(0);
  const listRef = useRef<HTMLOListElement | null>(null);

  const active = callShield.active && callShield.startedAt !== null;
  const startedAtMs = callShield.startedAt ? Date.parse(callShield.startedAt) : Number.NaN;

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [active]);

  const elapsed = active && Number.isFinite(startedAtMs) ? Math.max(0, now - startedAtMs) : 0;
  const revealed = active ? captionsRevealed(elapsed) : 0;
  const risk = assessCallRisk(revealed, "vi");
  const listening = active && revealed < CALL_SCRIPT.length;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [revealed]);

  return (
    <section
      id="tp-call-shield"
      aria-live="polite"
      className={`rounded-3xl border p-4 transition-colors ${
        active ? "border-rose-200 bg-rose-50" : "border-slate-200/90 bg-white"
      } ${highlighted ? "tp-highlight" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            active ? "tp-call-pulse bg-rose-600 text-white" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {active ? <PhoneCall className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${active ? "text-rose-800" : "text-slate-900"}`}>
            {active ? t.call.statusActive(CALL_SHIELD_CALLER) : t.call.statusNormal}
          </p>
          <p className="text-[11px] text-slate-500">
            {active ? `${t.call.elapsed(formatElapsed(elapsed))} • ${t.call.risk(risk.score)}` : t.call.normalDesc}
          </p>
        </div>
        <button
          type="button"
          onClick={active ? onEnd : onStart}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition-all ${
            active
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
          }`}
        >
          {active ? <PhoneOff className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
          {active ? t.call.end : t.call.start}
        </button>
      </div>

      {active && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-rose-200 bg-white p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-rose-700 uppercase">
              <Mic className="h-3.5 w-3.5" />
              {t.call.liveTitle}
            </p>
            <ol ref={listRef} className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {CALL_SCRIPT.slice(0, revealed).map((line, index) => (
                <li key={index} className="flex gap-2 text-xs leading-relaxed">
                  <span
                    className={`shrink-0 font-bold ${line.speaker === "caller" ? "text-rose-700" : "text-slate-500"}`}
                  >
                    {line.speaker === "caller" ? t.call.caller : t.call.you}:
                  </span>
                  <span className="min-w-0 text-slate-800">
                    <HighlightedLine text={line.text[lang]} lang={lang} />
                  </span>
                </li>
              ))}
              {listening && (
                <li className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                  {t.call.listening}
                </li>
              )}
            </ol>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-rose-800">
              <span>{t.call.risk(risk.score)}</span>
              <span className="font-mono">{risk.score}/100</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-rose-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-600 transition-all duration-500"
                style={{ width: `${risk.score}%` }}
              />
            </div>
          </div>

          {risk.keywordIds.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-rose-800">{t.call.keywordsTitle}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {risk.keywordIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                  >
                    {t.call.keywordNames[id]}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="flex items-start gap-2 rounded-2xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t.call.guardNote}</span>
          </p>
          <p className="text-[11px] text-slate-500">{t.call.privacy}</p>
        </div>
      )}
    </section>
  );
}

"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { analyzeElaFromFile, type ElaImageReport } from "@/lib/cv-forensics";
import { useI18n } from "@/components/i18n/I18nProvider";

type ViewMode = "overlay" | "heatmap" | "original";

/**
 * "Soi ảnh Bill / Hóa đơn thật-giả": Error Level Analysis trên Canvas, hiển thị Bản đồ nhiệt pháp y
 * chồng lên ảnh và Tampering Score. Ảnh chỉ xử lý trong bộ nhớ trình duyệt.
 */
export default function CvForensicsPanel() {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [report, setReport] = useState<ElaImageReport | null>(null);
  const [view, setView] = useState<ViewMode>("overlay");

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) {
      setStatus("failed");
      return;
    }
    setStatus("running");
    try {
      const next = await analyzeElaFromFile(file);
      setReport(next);
      setStatus("done");
    } catch {
      setReport(null);
      setStatus("failed");
    }
  };

  const score = report?.result.tamperingScore ?? 0;
  const tone = score >= 60 ? "text-rose-600" : score >= 30 ? "text-amber-600" : "text-emerald-600";
  const anomalous = report ? report.result.anomalousBlocks.reduce((sum, value) => sum + value, 0) : 0;

  return (
    <section id="tp-cv-forensics" aria-labelledby="tp-cv-title" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
      <h2 id="tp-cv-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
        <ScanSearch className="h-5 w-5 text-sky-600" />
        {t.pm.cv.title}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.pm.cv.subtitle}</p>

      <button
        type="button"
        disabled={status === "running"}
        onClick={() => fileRef.current?.click()}
        className="mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-sky-300 bg-sky-50 px-4 text-sm font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-wait disabled:opacity-70"
      >
        {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
        {status === "running" ? t.pm.cv.running : t.pm.cv.pick}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleFile(event)} />

      {status === "failed" && <p className="mt-2 text-xs font-semibold text-rose-600">{t.pm.cv.failed}</p>}

      {status === "done" && report && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={`text-sm font-bold ${tone}`}>{t.pm.cv.verdict(score)}</p>
            <p className={`tp-num text-sm font-bold ${tone}`}>{t.pm.cv.score(score)}</p>
          </div>
          <p className="text-xs text-slate-500">
            {t.pm.cv.blocks(anomalous, report.result.blocksX * report.result.blocksY)}
          </p>

          <div role="group" aria-label={t.pm.cv.heatmap} className="flex flex-wrap gap-1.5">
            {(
              [
                ["overlay", t.pm.cv.overlay],
                ["heatmap", t.pm.cv.heatmap],
                ["original", t.pm.cv.original],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`min-h-10 cursor-pointer rounded-xl border px-3 text-xs font-semibold ${
                  view === id ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200" style={{ backgroundColor: "#090D16" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={view === "heatmap" ? report.heatmapUrl : report.sourceUrl}
              alt={view === "heatmap" ? t.pm.cv.heatmap : t.pm.cv.original}
              className="block h-auto w-full"
            />
            {view === "overlay" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={report.heatmapUrl}
                alt={t.pm.cv.overlay}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-70 mix-blend-screen"
              />
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{t.pm.cv.note}</p>
    </section>
  );
}

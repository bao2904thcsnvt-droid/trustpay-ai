"use client";

import { Cloud, Timer } from "lucide-react";
import type { AwsPipelineKind, AwsPipelineStep, AwsPipelineTrace } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { Messages } from "@/lib/i18n/messages";
import { formatLatency } from "@/lib/wallet/format";

export interface AwsPipelineBarProps {
  trace: AwsPipelineTrace;
  className?: string;
}

function stepLabel(step: AwsPipelineStep, kind: AwsPipelineKind, t: Messages): { service: string; role: string } {
  switch (step.id) {
    case "rekognition":
      return kind === "FACE_MATCH" ? t.pipeline.steps.rekognitionFace : t.pipeline.steps.rekognition;
    case "bedrock":
      return kind === "IMAGE_EVIDENCE" ? t.pipeline.steps.bedrockImage : t.pipeline.steps.bedrockContext;
    case "biometric-policy":
      return t.pipeline.steps.policy;
    default:
      return t.pipeline.steps.blacklist;
  }
}

function stepClasses(status: AwsPipelineStep["status"]): { pill: string; dot: string } {
  switch (status) {
    case "aws":
      return { pill: "border-emerald-400/40 bg-emerald-400/10", dot: "bg-emerald-400" };
    case "fallback":
      return { pill: "border-dashed border-amber-300/60 bg-amber-300/10", dot: "bg-amber-300" };
    default:
      return { pill: "border-sky-300/40 bg-sky-300/10", dot: "bg-sky-300" };
  }
}

/**
 * Thanh trạng thái "luồng công nghệ AWS" đặt ở cuối mỗi thẻ kết quả: hiển thị
 * từng chặng, độ trễ thực tế (ms) và nhãn Offline Heuristic Fallback khi hệ
 * thống chạy chế độ dự phòng không kết nối AWS.
 */
export default function AwsPipelineBar({ trace, className = "" }: AwsPipelineBarProps) {
  const { t } = useI18n();
  const isFallback = trace.engine === "OFFLINE_HEURISTIC";

  return (
    <div
      role="group"
      aria-label={t.pipeline.title}
      data-tp-tech="true"
      className={`rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white shadow-inner ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-300 uppercase">
          <Cloud className="h-3.5 w-3.5 text-amber-300" />
          {t.pipeline.title}
        </p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isFallback ? "bg-amber-300/15 text-amber-200" : "bg-emerald-400/15 text-emerald-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isFallback ? "bg-amber-300" : "animate-pulse bg-emerald-400"}`}
          />
          {isFallback ? "Offline Heuristic" : t.pipeline.awsLive}
        </span>
      </div>

      {/* Điện thoại: mỗi chặng một hàng (độ trễ canh phải) thay vì các viên thuốc bị ép xuống dòng. */}
      <ol className="mt-2.5 flex flex-col gap-1.5 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5 sm:gap-y-2">
        {trace.steps.map((step, index) => {
          const label = stepLabel(step, trace.kind, t);
          const classes = stepClasses(step.status);
          return (
            <li key={step.id} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="hidden font-bold text-slate-500 sm:inline">
                  →
                </span>
              )}
              <span
                title={t.pipeline.statusTitle[step.status]}
                className={`flex w-full min-w-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 sm:inline-flex sm:w-auto ${classes.pill}`}
              >
                <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${classes.dot}`} />
                <span className="shrink-0 font-semibold text-white">{label.service}</span>
                <span className="min-w-0 truncate text-slate-300 sm:overflow-visible sm:whitespace-normal">{label.role}</span>
                <span className="ml-auto shrink-0 pl-1 font-mono text-[10px] text-slate-400 sm:ml-0 sm:pl-0">
                  {formatLatency(step.latencyMs)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
        <Timer className="h-3.5 w-3.5 text-slate-400" />
        <span>{t.pipeline.latency}:</span>
        <span className="font-mono font-bold text-white">{formatLatency(trace.totalLatencyMs)}</span>
        {isFallback && <span className="font-semibold text-amber-300">{t.pipeline.fallbackLabel}</span>}
      </p>
    </div>
  );
}

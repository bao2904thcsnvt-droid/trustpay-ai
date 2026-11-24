"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, CheckCircle2, CircleSlash, Octagon, RotateCcw, TriangleAlert } from "lucide-react";
import type { AgentStepStatus, InvestigationReport } from "@/lib/investigation-agent";
import { usePrefersReducedMotion } from "@/lib/hooks/use-media-query";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface AgentTracePanelProps {
  report: InvestigationReport;
}

const STEP_REVEAL_MS = 420;

const STATUS_STYLE: Record<AgentStepStatus, { tone: string; Icon: typeof CheckCircle2 }> = {
  pass: { tone: "text-emerald-600 border-emerald-200 bg-emerald-50", Icon: CheckCircle2 },
  warn: { tone: "text-amber-600 border-amber-200 bg-amber-50", Icon: TriangleAlert },
  fail: { tone: "text-rose-600 border-rose-200 bg-rose-50", Icon: Octagon },
  skip: { tone: "text-slate-500 border-slate-200 bg-slate-50", Icon: CircleSlash },
};

/**
 * Hiển thị chuỗi suy luận của AI Agent: từng bước Thought → Tool Call → Observation → Verdict
 * hiện lần lượt (giảm chuyển động → hiện ngay toàn bộ). Panel được remount theo phiên giao dịch.
 */
export default function AgentTracePanel({ report }: AgentTracePanelProps) {
  const { t, lang } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const total = report.steps.length;
  const [revealed, setRevealed] = useState(0);
  const [run, setRun] = useState(0);
  const shown = reducedMotion ? total : revealed;

  useEffect(() => {
    if (reducedMotion) return;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setRevealed(0), 0));
    for (let i = 1; i <= total; i++) {
      timers.push(window.setTimeout(() => setRevealed(i), i * STEP_REVEAL_MS));
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reducedMotion, total, run]);

  const levelLabel = t.common.riskBadge[report.finalLevel];
  const verdictTone =
    report.finalLevel === "HIGH"
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : report.finalLevel === "MEDIUM"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : "border-emerald-300 bg-emerald-50 text-emerald-700";

  return (
    <section
      id="tp-agent-trace"
      aria-labelledby="tp-agent-title"
      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="tp-agent-title" className="text-base font-bold text-slate-900">
              {t.pm.agentTitle}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.pm.agentSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
            {t.pm.engine(report.engine)}
          </span>
          <button
            type="button"
            onClick={() => setRun((value) => value + 1)}
            title={t.pm.replay}
            aria-label={t.pm.replay}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ol className="mt-4 space-y-3" aria-live="polite">
        {report.steps.map((step, index) => {
          if (index >= shown) {
            return (
              <li
                key={step.id}
                aria-hidden="true"
                className="h-14 animate-pulse rounded-2xl border border-dashed border-slate-200 bg-slate-50"
              />
            );
          }
          const text = t.pm.steps[step.id];
          const style = STATUS_STYLE[step.status];
          const Icon = style.Icon;
          return (
            <li key={step.id} className="tp-agent-step rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">{text.title}</p>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${style.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {t.pm.status[step.status]} · <span className="tp-num">{step.risk}</span>
                </span>
              </div>
              <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-semibold text-slate-500">{t.pm.thought}</dt>
                  <dd className="min-w-0 text-slate-700">{text.thought}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-semibold text-slate-500">{t.pm.tool}</dt>
                  <dd className="min-w-0 font-mono text-[11px] break-all text-sky-700">
                    {text.tool} · {step.durationMs.toFixed(2)} ms
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-semibold text-slate-500">{t.pm.observation}</dt>
                  <dd className="min-w-0">
                    <ul className="space-y-1">
                      {step.findings.map((finding, i) => (
                        <li key={`${finding.code}-${i}`} className="text-slate-700">
                          • {t.pm.finding(finding.code, finding.value)}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>

      {shown >= total && (
        <p className={`mt-3 rounded-2xl border px-3 py-2.5 text-sm font-bold ${verdictTone}`} lang={lang}>
          {t.pm.verdict}: <span className="tp-num">{t.pm.finalVerdict(report.finalScore, levelLabel)}</span>
          {report.scenarios.length > 0 && (
            <span className="mt-1 block text-xs font-semibold">
              {report.scenarios.map((id) => t.pm.scenario[id]).join(" · ")}
            </span>
          )}
        </p>
      )}
    </section>
  );
}

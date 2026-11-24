"use client";

import { Activity } from "lucide-react";
import { COERCION_HIGH_THRESHOLD, type CoercionPrediction } from "@/lib/behavioral-ml";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface BehaviorRiskMeterProps {
  prediction: CoercionPrediction;
}

/** Thanh đo nhỏ gọn "Coercion & Anomaly Probability" (Edge ML hành vi) + 3 yếu tố đóng góp lớn nhất. */
export default function BehaviorRiskMeter({ prediction }: BehaviorRiskMeterProps) {
  const { t } = useI18n();
  const pct = Math.round(prediction.probability * 100);
  const high = prediction.probability >= COERCION_HIGH_THRESHOLD;
  const bar = high ? "#F43F5E" : pct >= 40 ? "#F59E0B" : "#10B981";

  return (
    <section aria-labelledby="tp-ml-title" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tp-ml-title" className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Activity className="h-4 w-4 text-sky-600" />
          {t.pm.mlTitle}
        </h2>
        <span className="tp-num text-lg font-bold" style={{ color: bar }}>
          {pct}%
        </span>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t.pm.mlTitle}
      >
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: bar }} />
      </div>
      <p className={`mt-2 text-xs font-semibold ${high ? "text-rose-600" : "text-slate-600"}`}>
        {high ? t.pm.mlHigh : t.pm.mlLow}
      </p>
      <ul className="mt-2 space-y-1">
        {prediction.attributions.slice(0, 3).map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 text-xs text-slate-600">
            <span className="min-w-0 truncate">{t.pm.feature[item.key]}</span>
            <span className={`tp-num shrink-0 font-semibold ${item.contribution > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {item.sharePct > 0 ? "+" : ""}
              {item.sharePct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t.pm.mlHint}</p>
    </section>
  );
}

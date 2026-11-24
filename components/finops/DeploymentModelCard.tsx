"use client";

import { ArrowRight, Layers } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Thẻ "Mô hình Triển khai Thực tế (Zero-License SDK & VietQR Handoff)" — dùng
 * chung trong bảng AWS Security & FinOps và Hướng dẫn sử dụng.
 */
export default function DeploymentModelCard({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const steps = t.deployment.flow.split("→").map((step) => step.trim());

  return (
    <section
      aria-labelledby={compact ? undefined : "tp-deployment-title"}
      className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
    >
      <h3
        id={compact ? undefined : "tp-deployment-title"}
        className="flex items-center gap-2 text-sm font-bold text-emerald-900"
      >
        <Layers className="h-4 w-4 shrink-0 text-emerald-700" />
        {t.deployment.title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-emerald-900">{t.deployment.summary}</p>

      <ol className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label={t.deployment.flow}>
        {steps.map((step, index) => (
          <li key={step} className="inline-flex items-center gap-1.5">
            <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
              {step}
            </span>
            {index < steps.length - 1 && <ArrowRight aria-hidden="true" className="h-3 w-3 text-emerald-600" />}
          </li>
        ))}
      </ol>

      <ul className={`mt-2.5 space-y-1.5 ${compact ? "text-[11px]" : "text-xs"}`}>
        {t.deployment.points.map((point) => (
          <li key={point} className="flex gap-2 leading-relaxed text-emerald-900">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
            <span className="min-w-0">{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

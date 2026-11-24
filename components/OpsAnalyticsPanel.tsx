"use client";

import { useState } from "react";
import { BarChart3, Link2, Loader2, Network, ShieldCheck } from "lucide-react";
import type { CoercionPrediction } from "@/lib/behavioral-ml";
import { decomposeAgentRisk, type InvestigationReport } from "@/lib/investigation-agent";
import { useAuditState, verifyChain, type ChainVerification } from "@/lib/audit-chain";
import {
  ANOMALY_HUB_ACCOUNT,
  ANOMALY_INBOUND_TRANSFERS,
  ANOMALY_LINKED_MULE_ACCOUNTS,
} from "@/lib/ops/anomaly-cluster";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";
import { formatDateTime } from "@/lib/wallet/format";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface OpsAnalyticsPanelProps {
  prediction: CoercionPrediction | null;
  report: InvestigationReport | null;
  clusterLocked: boolean;
  blacklist: readonly string[];
}

function SignedBar({ label, pct }: { label: string; pct: number }) {
  const positive = pct > 0;
  const width = Math.min(100, Math.abs(pct));
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3.5rem] items-center gap-2 text-xs">
      <span className="min-w-0 truncate text-slate-700" title={label}>
        {label}
      </span>
      <span className="relative h-2.5 rounded-full bg-slate-100" aria-hidden="true">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300" />
        <span
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            backgroundColor: positive ? "#F43F5E" : "#10B981",
            width: `${width / 2}%`,
            left: positive ? "50%" : `${50 - width / 2}%`,
          }}
        />
      </span>
      <span className={`tp-num text-right font-semibold ${positive ? "text-rose-600" : "text-emerald-600"}`}>
        {positive ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
    </li>
  );
}

/**
 * Data Science & Explainable AI trong Ops Center: biểu đồ SHAP, đồ thị mạng lưới tài khoản
 * trung gian (SVG) và chuỗi Nhật ký Kiểm toán SHA-256 có nút xác minh toàn vẹn.
 */
export default function OpsAnalyticsPanel({ prediction, report, clusterLocked, blacklist }: OpsAnalyticsPanelProps) {
  const { t, lang, money } = useI18n();
  const audit = useAuditState();
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<ChainVerification | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    const result = await verifyChain(audit.entries);
    setVerification(result);
    setVerifying(false);
  };

  // --- Mule graph layout (toạ độ cố định, xác định) ---
  const W = 640;
  const H = 300;
  const hub = { x: W / 2, y: H / 2 };
  const victims = ANOMALY_INBOUND_TRANSFERS.map((event, i) => ({
    ...event,
    x: 92,
    y: 34 + i * ((H - 68) / Math.max(1, ANOMALY_INBOUND_TRANSFERS.length - 1)),
  }));
  const mules = ANOMALY_LINKED_MULE_ACCOUNTS.filter((account) => account !== ANOMALY_HUB_ACCOUNT).map((account, i, list) => ({
    account,
    blocked: clusterLocked || blacklist.includes(account),
    x: W - 96,
    y: 60 + i * ((H - 120) / Math.max(1, list.length - 1)),
  }));
  const hubBlocked = clusterLocked || blacklist.includes(ANOMALY_HUB_ACCOUNT);
  const maxAmount = Math.max(...ANOMALY_INBOUND_TRANSFERS.map((event) => event.amount));

  const agentShares = report ? decomposeAgentRisk(report.sources).filter((item) => item.risk > 0) : [];

  return (
    <section aria-labelledby="tp-ops-analytics" className="space-y-4">
      <h2 id="tp-ops-analytics" className="flex items-center gap-2 px-1 text-base font-bold text-slate-900">
        <BarChart3 className="h-5 w-5 text-sky-600" />
        {t.pm.ops.title}
      </h2>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* SHAP */}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900">{t.pm.ops.xaiTitle}</h3>
          {!prediction && !report ? (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
              {t.pm.ops.xaiEmpty}
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {agentShares.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t.pm.ops.sourcesTitle}</p>
                  <ul className="space-y-1.5">
                    {agentShares.map((item) => (
                      <SignedBar key={item.id} label={`${t.pm.ops.sources[item.id]} (${item.risk})`} pct={item.sharePct} />
                    ))}
                  </ul>
                </div>
              )}
              {prediction && (
                <div>
                  <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    <span>{t.pm.ops.featureTitle}</span>
                    <span className="tp-num normal-case">{t.pm.ops.probability(Math.round(prediction.probability * 100))}</span>
                  </p>
                  <ul className="space-y-1.5">
                    {prediction.attributions.map((item) => (
                      <SignedBar key={item.key} label={t.pm.feature[item.key]} pct={item.sharePct} />
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-slate-500">{t.pm.ops.xaiNote}</p>
            </div>
          )}
        </div>

        {/* Mule graph */}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Network className="h-4 w-4 text-sky-600" />
            {t.pm.ops.graphTitle}
          </h3>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={t.pm.ops.graphTitle}>
            <defs>
              <marker id="tp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10Z" fill="#94A3B8" />
              </marker>
            </defs>
            {victims.map((victim) => (
              <line
                key={`e-${victim.senderAccount}`}
                x1={victim.x + 10}
                y1={victim.y}
                x2={hub.x - 30}
                y2={hub.y}
                stroke={hubBlocked ? "#F43F5E" : "#F59E0B"}
                strokeOpacity={0.75}
                strokeWidth={1 + (victim.amount / maxAmount) * 4}
                strokeDasharray={hubBlocked ? "5 4" : undefined}
                markerEnd="url(#tp-arrow)"
              />
            ))}
            {mules.map((mule) => (
              <line
                key={`m-${mule.account}`}
                x1={hub.x + 30}
                y1={hub.y}
                x2={mule.x - 12}
                y2={mule.y}
                stroke={mule.blocked ? "#F43F5E" : "#38BDF8"}
                strokeOpacity={0.8}
                strokeWidth={2}
                strokeDasharray={mule.blocked ? "5 4" : undefined}
                markerEnd="url(#tp-arrow)"
              />
            ))}
            {victims.map((victim) => (
              <g key={`v-${victim.senderAccount}`}>
                <circle cx={victim.x} cy={victim.y} r={10} fill="#0F172A" stroke="#94A3B8" strokeWidth={1.5} />
                <text x={victim.x - 16} y={victim.y + 4} textAnchor="end" fontSize={11} fill="#94A3B8" className="tp-mono-svg">
                  {maskRecipientForDisplay(victim.senderAccount)}
                </text>
                <text x={victim.x - 16} y={victim.y + 17} textAnchor="end" fontSize={10} fill="#64748B">
                  {money(victim.amount)}
                </text>
              </g>
            ))}
            <circle cx={hub.x} cy={hub.y} r={28} fill={hubBlocked ? "#4C0519" : "#451A03"} stroke={hubBlocked ? "#F43F5E" : "#F59E0B"} strokeWidth={2.5} />
            <text x={hub.x} y={hub.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#F1F5F9">
              {maskRecipientForDisplay(ANOMALY_HUB_ACCOUNT)}
            </text>
            <text x={hub.x} y={hub.y + 46} textAnchor="middle" fontSize={11} fill={hubBlocked ? "#F43F5E" : "#F59E0B"}>
              {t.pm.ops.graphHub} · {hubBlocked ? t.pm.ops.graphBlocked : t.pm.ops.graphLive}
            </text>
            {mules.map((mule) => (
              <g key={`n-${mule.account}`}>
                <rect x={mule.x - 12} y={mule.y - 12} width={24} height={24} rx={6} fill="#0F172A" stroke={mule.blocked ? "#F43F5E" : "#38BDF8"} strokeWidth={1.5} />
                <text x={mule.x + 18} y={mule.y + 4} fontSize={11} fill={mule.blocked ? "#F43F5E" : "#94A3B8"}>
                  {maskRecipientForDisplay(mule.account)}
                </text>
              </g>
            ))}
            <text x={92} y={H - 4} textAnchor="middle" fontSize={10} fill="#64748B">
              {t.pm.ops.graphVictims}
            </text>
            <text x={W - 96} y={H - 4} textAnchor="middle" fontSize={10} fill="#64748B">
              {t.pm.ops.graphMules}
            </text>
          </svg>
        </div>
      </div>

      {/* Audit chain */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Link2 className="h-4 w-4 text-sky-600" />
              {t.pm.ops.auditTitle}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">{t.pm.ops.auditSubtitle}</p>
          </div>
          <button
            type="button"
            disabled={verifying}
            onClick={() => void handleVerify()}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-sky-300 bg-sky-50 px-4 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:cursor-wait disabled:opacity-70"
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {verifying ? t.pm.ops.auditVerifying : t.pm.ops.auditVerify}
          </button>
        </div>

        {verification && (
          <p
            role="status"
            className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-semibold ${
              verification.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"
            }`}
          >
            {t.pm.ops.auditResult(verification)}
          </p>
        )}

        {audit.entries.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">{t.pm.ops.auditEmpty}</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {audit.entries
              .slice(-8)
              .reverse()
              .map((entry) => (
                <li key={entry.index} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      #{entry.index} · {t.pm.ops.kinds[entry.kind]}
                    </span>
                    <span className="tp-num text-slate-500">{formatDateTime(entry.timestamp, lang)}</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] break-all text-slate-500">
                    prev {entry.prevHash.slice(0, 16)}… → hash {entry.hash.slice(0, 16)}…
                  </p>
                </li>
              ))}
          </ol>
        )}
      </div>
    </section>
  );
}

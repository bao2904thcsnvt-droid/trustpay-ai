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
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Điện thoại: đồ thị dọc (chữ ~11–12px thật thay vì bị thu nhỏ còn ~5px). */
const COMPACT_GRAPH_QUERY = "(max-width: 640px)";

interface GraphLayout {
  W: number;
  H: number;
  hub: { x: number; y: number; r: number };
  victims: { senderAccount: string; amount: number; x: number; y: number }[];
  mules: { account: string; blocked: boolean; x: number; y: number }[];
  compact: boolean;
}

function buildGraphLayout(compact: boolean, isBlocked: (account: string) => boolean): GraphLayout {
  const muleAccounts = ANOMALY_LINKED_MULE_ACCOUNTS.filter((account) => account !== ANOMALY_HUB_ACCOUNT);
  const last = (list: readonly unknown[]) => Math.max(1, list.length - 1);
  if (compact) {
    // Nguồn chuyển đến xếp dọc bên trái → STK trung chuyển bên phải → cụm STK liên quan ở hàng dưới.
    const W = 340;
    const H = 312;
    return {
      W,
      H,
      compact,
      hub: { x: 270, y: 150, r: 26 },
      victims: ANOMALY_INBOUND_TRANSFERS.map((event, i) => ({ ...event, x: 176, y: 34 + i * 40 })),
      mules: muleAccounts.map((account, i, list) => ({
        account,
        blocked: isBlocked(account),
        x: 66 + i * ((W - 132) / last(list)),
        y: 262,
      })),
    };
  }
  const W = 640;
  const H = 300;
  return {
    W,
    H,
    compact,
    hub: { x: W / 2, y: H / 2, r: 28 },
    // x = 124: nhãn STK (canh phải) không còn bị cắt ở mép trái.
    victims: ANOMALY_INBOUND_TRANSFERS.map((event, i) => ({
      ...event,
      x: 124,
      y: 34 + i * ((H - 68) / last(ANOMALY_INBOUND_TRANSFERS)),
    })),
    mules: muleAccounts.map((account, i, list) => ({
      account,
      blocked: isBlocked(account),
      x: W - 104,
      y: 60 + i * ((H - 120) / last(list)),
    })),
  };
}

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
    // Điện thoại: tên yếu tố nằm trên một dòng riêng (không bị cắt), thanh + giá trị ở dòng dưới.
    <li className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-2 gap-y-1 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_3.5rem] sm:gap-y-0">
      <span className="col-span-2 min-w-0 leading-snug text-slate-700 sm:col-span-1 sm:truncate" title={label}>
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
  const compactGraph = useMediaQuery(COMPACT_GRAPH_QUERY);
  const isBlocked = (account: string) => clusterLocked || blacklist.includes(account);
  const { W, H, hub, victims, mules, compact } = buildGraphLayout(compactGraph, isBlocked);
  const hubBlocked = isBlocked(ANOMALY_HUB_ACCOUNT);
  const maxAmount = Math.max(...ANOMALY_INBOUND_TRANSFERS.map((event) => event.amount));
  const hubTone = hubBlocked ? "#F43F5E" : "#F59E0B";
  const labelSize = compact ? 12.5 : 11;
  const amountSize = compact ? 11.5 : 10;

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
          {/* Nền tối riêng cho đồ thị → nhãn luôn rõ ở cả giao diện Obsidian lẫn Daylight. */}
          <div className="mt-3 overflow-hidden rounded-2xl p-2" style={{ backgroundColor: "#0B1222" }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t.pm.ops.graphTitle}>
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
                  x2={hub.x - hub.r - 2}
                  y2={hub.y}
                  stroke={hubTone}
                  strokeOpacity={0.75}
                  strokeWidth={1 + (victim.amount / maxAmount) * (compact ? 3 : 4)}
                  strokeDasharray={hubBlocked ? "5 4" : undefined}
                  markerEnd="url(#tp-arrow)"
                />
              ))}
              {mules.map((mule) => (
                <line
                  key={`m-${mule.account}`}
                  x1={compact ? hub.x : hub.x + hub.r + 2}
                  y1={compact ? hub.y + hub.r + 2 : hub.y}
                  x2={compact ? mule.x : mule.x - 12}
                  y2={compact ? mule.y - 14 : mule.y}
                  stroke={mule.blocked ? "#F43F5E" : "#38BDF8"}
                  strokeOpacity={0.8}
                  strokeWidth={2}
                  strokeDasharray={mule.blocked ? "5 4" : undefined}
                  markerEnd="url(#tp-arrow)"
                />
              ))}
              {victims.map((victim) => (
                <g key={`v-${victim.senderAccount}`}>
                  <circle cx={victim.x} cy={victim.y} r={compact ? 8 : 10} fill="#0F172A" stroke="#94A3B8" strokeWidth={1.5} />
                  <text
                    x={victim.x - (compact ? 14 : 16)}
                    y={victim.y + (compact ? -1 : 4)}
                    textAnchor="end"
                    fontSize={labelSize}
                    fill="#CBD5E1"
                    className="tp-mono-svg"
                  >
                    {maskRecipientForDisplay(victim.senderAccount)}
                  </text>
                  <text
                    x={victim.x - (compact ? 14 : 16)}
                    y={victim.y + (compact ? 13 : 17)}
                    textAnchor="end"
                    fontSize={amountSize}
                    fill="#94A3B8"
                    className="tp-num"
                  >
                    {money(victim.amount)}
                  </text>
                </g>
              ))}
              <circle cx={hub.x} cy={hub.y} r={hub.r} fill={hubBlocked ? "#4C0519" : "#451A03"} stroke={hubTone} strokeWidth={2.5} />
              <text x={hub.x} y={hub.y + 4} textAnchor="middle" fontSize={compact ? 10 : 11} fontWeight={700} fill="#F1F5F9" className="tp-mono-svg">
                {maskRecipientForDisplay(ANOMALY_HUB_ACCOUNT)}
              </text>
              {!compact && (
                <text x={hub.x} y={hub.y + 46} textAnchor="middle" fontSize={11} fill={hubTone}>
                  {t.pm.ops.graphHub} · {hubBlocked ? t.pm.ops.graphBlocked : t.pm.ops.graphLive}
                </text>
              )}
              {mules.map((mule) => (
                <g key={`n-${mule.account}`}>
                  <rect x={mule.x - 12} y={mule.y - 12} width={24} height={24} rx={6} fill="#0F172A" stroke={mule.blocked ? "#F43F5E" : "#38BDF8"} strokeWidth={1.5} />
                  <text
                    x={compact ? mule.x : mule.x + 18}
                    y={compact ? mule.y + 30 : mule.y + 4}
                    textAnchor={compact ? "middle" : "start"}
                    fontSize={labelSize}
                    fill={mule.blocked ? "#FB7185" : "#CBD5E1"}
                    className="tp-mono-svg"
                  >
                    {maskRecipientForDisplay(mule.account)}
                  </text>
                </g>
              ))}
              {compact ? (
                <>
                  <text x={4} y={11} fontSize={10.5} fontWeight={600} fill="#94A3B8">
                    {t.pm.ops.graphVictims}
                  </text>
                  <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#94A3B8">
                    {t.pm.ops.graphMules}
                  </text>
                </>
              ) : (
                <>
                  <text x={victims[0]?.x ?? 124} y={H - 4} textAnchor="middle" fontSize={10} fill="#94A3B8">
                    {t.pm.ops.graphVictims}
                  </text>
                  <text x={W - 104} y={H - 4} textAnchor="middle" fontSize={10} fill="#94A3B8">
                    {t.pm.ops.graphMules}
                  </text>
                </>
              )}
            </svg>
          </div>
          {compact && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: hubTone }} />
              <span className="font-semibold">{t.pm.ops.graphHub}</span>
              <span className="tp-code">{maskRecipientForDisplay(ANOMALY_HUB_ACCOUNT)}</span>
              <span className="font-semibold" style={{ color: hubTone }}>
                · {hubBlocked ? t.pm.ops.graphBlocked : t.pm.ops.graphLive}
              </span>
            </p>
          )}
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
                  <p className="tp-code mt-1 text-[11px] break-all text-slate-500">
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

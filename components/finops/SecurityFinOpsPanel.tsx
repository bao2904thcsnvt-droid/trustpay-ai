"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Coins, EyeOff, Gauge, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { AwsCircuitState, AwsPipelineTrace } from "@/types/trustpay";
import { BASELINE_SONNET_ONLY, computeUnitCost, formatUsd, OPTIMIZED_FINOPS } from "@/lib/finops/unit-economics";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";
import { formatLatency } from "@/lib/wallet/format";
import type { PiiKindLabel } from "@/lib/i18n/messages-ext";
import { useI18n } from "@/components/i18n/I18nProvider";
import DeploymentModelCard from "@/components/finops/DeploymentModelCard";

export interface SecurityFinOpsPanelProps {
  onClose: () => void;
  /** Luồng AWS của lần phân tích gần nhất (độ trễ thật, engine, lý do fallback). */
  lastTrace: AwsPipelineTrace | null;
}

type ServiceName = "bedrock" | "rekognition" | "translate";

interface BreakerView {
  name: ServiceName;
  state: AwsCircuitState;
  consecutiveFailures: number;
}

interface PreviewState {
  status: "loading" | "server" | "local";
  masked: string;
  findings: { kind: PiiKindLabel; masked: string }[];
  commandHash: string | null;
  maskingMs: number | null;
  rttMs: number | null;
  breakers: BreakerView[] | null;
  budgets: Record<ServiceName, number>;
}

const DEFAULT_BUDGETS: Record<ServiceName, number> = { bedrock: 4000, rekognition: 2500, translate: 1500 };
const SERVICES: ServiceName[] = ["bedrock", "rekognition", "translate"];

const STATE_STYLE: Record<AwsCircuitState, string> = {
  CLOSED: "bg-emerald-600 text-white",
  OPEN: "bg-rose-600 text-white",
  HALF_OPEN: "bg-amber-500 text-white",
};

function isServiceName(value: unknown): value is ServiceName {
  return value === "bedrock" || value === "rekognition" || value === "translate";
}

function isCircuitState(value: unknown): value is AwsCircuitState {
  return value === "CLOSED" || value === "OPEN" || value === "HALF_OPEN";
}

function isPiiKind(value: unknown): value is PiiKindLabel {
  return value === "CCCD" || value === "PHONE" || value === "ACCOUNT";
}

/** Đọc phản hồi `/api/pii-preview` như dữ liệu không tin cậy. */
function parsePreview(raw: unknown): Omit<PreviewState, "status" | "rttMs"> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.masked !== "string") return null;
  const findings = Array.isArray(record.findings)
    ? record.findings
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .filter((item) => isPiiKind(item.kind) && typeof item.masked === "string")
        .map((item) => ({ kind: item.kind as PiiKindLabel, masked: String(item.masked) }))
    : [];
  const breakers = Array.isArray(record.breakers)
    ? record.breakers
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .filter((item) => isServiceName(item.name) && isCircuitState(item.state))
        .map((item) => ({
          name: item.name as ServiceName,
          state: item.state as AwsCircuitState,
          consecutiveFailures: typeof item.consecutiveFailures === "number" ? item.consecutiveFailures : 0,
        }))
    : null;
  const budgetRecord =
    typeof record.timeoutBudgetMs === "object" && record.timeoutBudgetMs !== null
      ? (record.timeoutBudgetMs as Record<string, unknown>)
      : {};
  const budgets = { ...DEFAULT_BUDGETS };
  for (const name of SERVICES) {
    const value = budgetRecord[name];
    if (typeof value === "number" && Number.isFinite(value)) budgets[name] = value;
  }
  return {
    masked: record.masked,
    findings,
    commandHash: typeof record.commandHash === "string" ? record.commandHash : null,
    maskingMs: typeof record.maskingMs === "number" ? record.maskingMs : null,
    breakers,
    budgets,
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Bảng kỹ thuật "AWS Security & FinOps": xem trước lớp che PII thật (máy chủ)
 * trước khi gửi Bedrock theo NĐ 13/2023, trạng thái Circuit Breaker thật của từng
 * dịch vụ AWS, độ trễ đo thực tế và chi phí AI mỗi giao dịch.
 */
export default function SecurityFinOpsPanel({ onClose, lastTrace }: SecurityFinOpsPanelProps) {
  const { t, lang } = useI18n();
  const [text, setText] = useState(t.finops.piiSample);
  const [preview, setPreview] = useState<PreviewState>({
    status: "loading",
    masked: "",
    findings: [],
    commandHash: null,
    maskingMs: null,
    rttMs: null,
    breakers: null,
    budgets: DEFAULT_BUDGETS,
  });
  const requestRef = useRef(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const optimized = computeUnitCost(OPTIMIZED_FINOPS);
  const baseline = computeUnitCost(BASELINE_SONNET_ONLY);
  const savingsPct = `${Math.round((1 - optimized.totalPer1000 / baseline.totalPer1000) * 100)}%`;
  const vndPerTxn = Math.round(optimized.perTransactionVnd).toLocaleString(lang === "vi" ? "vi-VN" : "en-US");

  const runPreview = useCallback(async (value: string) => {
    const requestId = ++requestRef.current;
    setPreview((prev) => ({ ...prev, status: "loading" }));
    const started = nowMs();
    try {
      const response = await fetch("/api/pii-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parsePreview((await response.json()) as unknown);
      if (!parsed) throw new Error("invalid");
      if (requestId !== requestRef.current) return;
      setPreview({ ...parsed, status: "server", rttMs: nowMs() - started });
    } catch {
      if (requestId !== requestRef.current) return;
      setPreview((prev) => ({
        ...prev,
        status: "local",
        masked: maskRecipientForDisplay(value),
        findings: [],
        commandHash: null,
        maskingMs: null,
        rttMs: null,
        breakers: null,
      }));
    }
  }, []);

  // Đo ngay khi mở bảng, sau đó che lại sau 400 ms mỗi khi người dùng sửa dữ liệu gốc.
  useEffect(() => {
    const timer = window.setTimeout(() => void runPreview(text), 400);
    return () => window.clearTimeout(timer);
  }, [text, runPreview]);

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

  const breakerFor = (name: ServiceName): BreakerView | null =>
    preview.breakers?.find((item) => item.name === name) ??
    (lastTrace?.breakers ? { name, state: lastTrace.breakers[name], consecutiveFailures: 0 } : null);

  const breakdownRows = [
    { label: t.finops.breakdown.bedrock, value: optimized.bedrock },
    { label: t.finops.breakdown.rekognition, value: optimized.rekognition },
    { label: t.finops.breakdown.translate, value: optimized.translate },
    { label: t.finops.breakdown.compute, value: optimized.lambda + optimized.requests },
    { label: t.finops.breakdown.dynamodb, value: optimized.dynamodb },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-finops-title"
      className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="tp-sheet-in relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/40 sm:max-h-[92vh] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 via-indigo-900 to-[#a50064] px-5 py-4 text-white sm:px-6">
          <div className="min-w-0">
            <h2 id="tp-finops-title" className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
              <Gauge className="h-5 w-5 shrink-0" />
              {t.finops.title}
            </h2>
            <p className="mt-0.5 text-xs text-white/80">{t.finops.subtitle}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.finops.close}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {/* 1. PII Masking */}
          <section aria-labelledby="tp-pii-title" className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id="tp-pii-title" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <EyeOff className="h-4 w-4 text-[#a50064]" />
                  {t.finops.piiTitle}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">{t.finops.piiLaw}</p>
              </div>
              <button
                type="button"
                onClick={() => void runPreview(text)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
              >
                {preview.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {preview.status === "loading" ? t.finops.piiRunning : t.finops.piiRun}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="tp-pii-input" className="text-[10px] font-bold tracking-wide text-rose-700 uppercase">
                  {t.finops.piiInputLabel}
                </label>
                <textarea
                  id="tp-pii-input"
                  rows={4}
                  maxLength={2000}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="mt-1 w-full resize-none rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-rose-300 focus:ring-4 focus:ring-rose-100 focus:outline-none"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wide text-emerald-700 uppercase">{t.finops.piiOutputLabel}</p>
                <p className="mt-1 min-h-[6.5rem] rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-mono text-xs break-words text-slate-900">
                  {preview.masked || "…"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {preview.findings.length === 0 && preview.status === "server" ? (
                <span className="text-[11px] text-slate-500">{t.finops.piiNone}</span>
              ) : (
                preview.findings.map((finding, index) => (
                  <span
                    key={`${finding.kind}-${index}`}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-700"
                  >
                    <span className="font-bold text-emerald-700">{t.finops.piiKinds[finding.kind]}</span>
                    <span className="font-mono">{finding.masked}</span>
                  </span>
                ))
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {preview.status === "server" && preview.maskingMs !== null && preview.rttMs !== null
                ? t.finops.piiServer(formatLatency(preview.maskingMs), formatLatency(preview.rttMs))
                : preview.status === "local"
                  ? t.finops.piiLocal
                  : "…"}
            </p>
            {preview.commandHash && (
              <p className="tp-code mt-1 text-[10px] break-all text-slate-400">
                {t.finops.piiHash(`${preview.commandHash.slice(0, 24)}…`)}
              </p>
            )}
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* 2. Resilience */}
            <section aria-labelledby="tp-resilience-title" className="rounded-3xl border border-slate-200 bg-white p-4">
              <h3 id="tp-resilience-title" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-[#a50064]" />
                {t.finops.resilienceTitle}
              </h3>
              <ul className="mt-3 space-y-2">
                {SERVICES.map((name) => {
                  const breaker = breakerFor(name);
                  return (
                    <li
                      key={name}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900">{t.finops.services[name]}</p>
                        <p className="text-[10px] text-slate-500">
                          {t.finops.budget(preview.budgets[name])}
                          {breaker && breaker.consecutiveFailures > 0 ? ` • ${t.finops.failures(breaker.consecutiveFailures)}` : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                          breaker ? STATE_STYLE[breaker.state] : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {breaker ? `Circuit Breaker: ${t.finops.breakerState[breaker.state]}` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                  <Activity className="h-3.5 w-3.5 text-[#a50064]" />
                  {t.finops.lastAnalysis}
                </p>
                {lastTrace ? (
                  <p className="mt-1 text-xs text-slate-700">
                    <span className="font-semibold">
                      {lastTrace.engine === "AWS" ? t.finops.engineAws : t.finops.engineOffline}
                    </span>
                    {" • "}
                    {t.finops.latency(formatLatency(lastTrace.totalLatencyMs))}
                    {lastTrace.fallbackReason ? ` • ${t.finops.fallbackReasons[lastTrace.fallbackReason]}` : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">{t.finops.lastAnalysisNone}</p>
                )}
              </div>
            </section>

            {/* 3. Unit Economics */}
            <section aria-labelledby="tp-economics-title" className="rounded-3xl border border-slate-200 bg-white p-4">
              <h3 id="tp-economics-title" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Coins className="h-4 w-4 text-[#a50064]" />
                {t.finops.economicsTitle}
              </h3>
              <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] px-4 py-3 text-white">
                <p className="text-[11px] font-semibold text-white/80">{t.finops.perTxnLabel}</p>
                <p className="mt-0.5 font-mono text-2xl font-extrabold">~{formatUsd(optimized.perTransaction)}</p>
                <p className="text-[11px] text-white/85">
                  {t.finops.perTxnVnd(vndPerTxn)} • {t.finops.savings(savingsPct)}
                </p>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">{t.finops.baseline(formatUsd(baseline.perTransaction))}</p>
              <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {breakdownRows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                    <span className="text-slate-600">{row.label}</span>
                    <span className="font-mono text-slate-900">
                      {formatUsd(row.value, 3)} <span className="text-slate-400">{t.finops.per1000}</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-bold">
                  <span className="text-slate-900">Σ</span>
                  <span className="font-mono text-slate-900">
                    {formatUsd(optimized.totalPer1000, 2)} <span className="font-normal text-slate-400">{t.finops.per1000}</span>
                  </span>
                </li>
              </ul>
              <ul className="mt-3 space-y-1">
                {t.finops.levers.map((lever) => (
                  <li key={lever} className="flex gap-2 text-[11px] text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d82d8b]" />
                    <span className="min-w-0">{lever}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-400">{t.finops.assumption}</p>
            </section>
          </div>

          {/* 4. Mô hình triển khai thực tế (non-custodial) */}
          <DeploymentModelCard />
        </div>
      </div>
    </div>
  );
}

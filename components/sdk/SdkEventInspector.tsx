"use client";

import { useState } from "react";
import { Braces, Check, ChevronDown, Copy, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { verifyDecisionToken, type DecisionToken, type SdkDecision } from "@/lib/sdk/decision-token";
import type { PostResult } from "@/lib/sdk/host-bridge";
import { formatClock } from "@/lib/wallet/format";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Một dòng nhật ký trong Inspector: gói tin SDK → Host hoặc yêu cầu Host → SDK. */
export type SdkEventRecord =
  | {
      id: string;
      direction: "OUTBOUND";
      at: number;
      token: DecisionToken;
      delivery: PostResult;
      hostOrigin: string | null;
    }
  | {
      id: string;
      direction: "INBOUND";
      at: number;
      summary: string;
      /** Bản đã chuẩn hóa/che (không lưu dữ liệu thô Host gửi). */
      payload: Record<string, unknown>;
    };

export interface SdkEventInspectorProps {
  events: readonly SdkEventRecord[];
  onClear: () => void;
  defaultOpen?: boolean;
}

export const DECISION_STYLE: Record<SdkDecision, string> = {
  ALLOW: "bg-emerald-600 text-white",
  HOLD_GUARDIAN: "bg-amber-500 text-white",
  BLOCK: "bg-rose-600 text-white",
};

/** "SDK Event & Decision Token Inspector" — thu gọn / mở rộng được, in JSON thời gian thực. */
export default function SdkEventInspector({ events, onClear, defaultOpen = true }: SdkEventInspectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyJson = async (id: string, json: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(json);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1800);
      }
    } catch {
      // Clipboard bị chặn — người dùng vẫn có thể chọn văn bản JSON thủ công.
    }
  };

  return (
    <section
      id="tp-sdk-inspector"
      aria-labelledby="tp-sdk-inspector-title"
      className="rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-lg"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <Braces className="h-5 w-5 text-emerald-300" />
        </span>
        <span className="min-w-0 flex-1">
          <span id="tp-sdk-inspector-title" className="block text-sm font-bold text-white">
            {t.sdk.inspectorTitle}
          </span>
          <span className="block text-[11px] text-slate-300">{t.sdk.inspectorSubtitle}</span>
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
          {events.length}
        </span>
        <span className="sr-only">{open ? t.sdk.inspectorHide : t.sdk.inspectorShow}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/10 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-slate-300">
            <span className="font-bold text-white">{t.sdk.contractTitle}: </span>
            {t.sdk.contractHint}
          </p>

          {events.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-[11px] text-slate-400">
              {t.sdk.inspectorEmpty}
            </p>
          ) : (
            <ol className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {events.map((record) => {
                const json = JSON.stringify(record.direction === "OUTBOUND" ? record.token : record.payload, null, 2);
                const valid = record.direction === "OUTBOUND" ? verifyDecisionToken(record.token) : null;
                return (
                  <li key={record.id}>
                    <details className="group rounded-2xl border border-white/10 bg-white/5">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
                        <span
                          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            record.direction === "OUTBOUND" ? "bg-sky-500/20 text-sky-200" : "bg-fuchsia-500/20 text-fuchsia-200"
                          }`}
                        >
                          {record.direction === "OUTBOUND" ? t.sdk.outbound : t.sdk.inbound}
                        </span>
                        <span className="font-mono text-slate-400">{formatClock(record.at, true)}</span>
                        {record.direction === "OUTBOUND" ? (
                          <>
                            <span className="font-mono font-semibold text-white">{record.token.event}</span>
                            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${DECISION_STYLE[record.token.decision]}`}>
                              {record.token.decision}
                            </span>
                            <span className="font-mono text-slate-300">risk {record.token.riskScore}</span>
                            {valid ? (
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-label={t.sdk.signatureOk} />
                            ) : (
                              <ShieldAlert className="h-3.5 w-3.5 text-rose-300" aria-label={t.sdk.signatureBad} />
                            )}
                          </>
                        ) : (
                          <span className="min-w-0 text-slate-200">{record.summary}</span>
                        )}
                        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="border-t border-white/10 px-3 py-2">
                        {record.direction === "OUTBOUND" && (
                          <p className="mb-1.5 text-[10px] text-slate-400">
                            {t.sdk.delivery(record.delivery, record.hostOrigin ?? "")} •{" "}
                            <span className={valid ? "text-emerald-300" : "text-rose-300"}>
                              {valid ? t.sdk.signatureOk : t.sdk.signatureBad}
                            </span>
                          </p>
                        )}
                        <pre className="max-h-72 overflow-auto rounded-xl bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-emerald-200">
                          {json}
                        </pre>
                        <button
                          type="button"
                          onClick={() => void copyJson(record.id, json)}
                          className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-white/10"
                        >
                          {copiedId === record.id ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                          {t.sdk.inspectorCopy}
                        </button>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}

          {events.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t.sdk.inspectorClear}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

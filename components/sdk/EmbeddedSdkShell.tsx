"use client";

import type { ReactNode } from "react";
import { Fingerprint, Landmark, Network, Plug, Server, ShieldCheck, ShieldAlert, Wallet } from "lucide-react";
import { verifyDecisionToken, type DecisionToken } from "@/lib/sdk/decision-token";
import { useI18n } from "@/components/i18n/I18nProvider";
import SdkEventInspector, { DECISION_STYLE, type SdkEventRecord } from "@/components/sdk/SdkEventInspector";

export type EmbeddedSdkTab = "transfer" | "qr";

export interface EmbeddedSdkShellProps {
  /** Số dư hiển thị trong Host App (mô phỏng Server Ledger của Host). */
  balance: number;
  latestToken: DecisionToken | null;
  /** Mã tham chiếu NAPAS 247 (mô phỏng) khi Host đã hoàn tất lệnh sau ALLOW. */
  hostSettlementRef: string | null;
  sdkTab: EmbeddedSdkTab;
  onSdkTabChange: (tab: EmbeddedSdkTab) => void;
  events: readonly SdkEventRecord[];
  onClearEvents: () => void;
  /** Nội dung TrustPay AI SDK (luồng chuyển tiền hoặc Soi mã VietQR). */
  children: ReactNode;
}

/**
 * "🔌 Chế độ Nhúng SDK (MoMo Embedded)": khung Siêu ứng dụng (Tầng 1 – Host App)
 * bao bọc TrustPay AI SDK (Tầng 2 – onBeforeTransferConfirm), kèm thẻ Host xử lý
 * Decision Token và Inspector gói tin postMessage.
 */
export default function EmbeddedSdkShell({
  balance,
  latestToken,
  hostSettlementRef,
  sdkTab,
  onSdkTabChange,
  events,
  onClearEvents,
  children,
}: EmbeddedSdkShellProps) {
  const { t, money } = useI18n();
  const signatureValid = latestToken ? verifyDecisionToken(latestToken) : null;

  const tabClass = (tab: EmbeddedSdkTab) =>
    `flex-1 cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
      sdkTab === tab
        ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm"
        : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
    }`;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* ===================== Tầng 1: Host App bao bọc SDK ===================== */}
      <div className="min-w-0 lg:col-span-7">
        <div className="overflow-hidden rounded-[2rem] border-[6px] border-[#a50064] bg-white shadow-2xl shadow-[#a50064]/20">
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white font-extrabold text-[#a50064]">
                M
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold">
                  {t.sdk.hostName} · {t.sdk.hostScreen}
                </p>
                <p className="truncate text-[10px] text-white/85">{t.sdk.hostBadge}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-white/80">{t.sdk.hostBalance}</p>
              <p className="font-mono text-sm font-bold">{money(balance)}</p>
            </div>
          </div>

          <div className="space-y-4 bg-slate-50 p-3 sm:p-4">
            {/* Khung SDK (Tầng 2) */}
            <div className="rounded-3xl border-2 border-dashed border-sky-300 bg-white p-2 sm:p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-bold text-white">
                  <Plug className="h-3.5 w-3.5" />
                  {t.sdk.sdkBadge} · <span className="tp-code">{t.sdk.sdkHook}</span>
                </span>
                <div role="tablist" aria-label={t.sdk.sdkBadge} className="flex min-w-[220px] gap-1 rounded-2xl bg-slate-100 p-1">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sdkTab === "transfer"}
                    onClick={() => onSdkTabChange("transfer")}
                    className={tabClass("transfer")}
                  >
                    {t.sdk.tabTransfer}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sdkTab === "qr"}
                    onClick={() => onSdkTabChange("qr")}
                    className={tabClass("qr")}
                  >
                    {t.sdk.tabQr}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-4">{children}</div>
            </div>

            {/* Host xử lý Decision Token */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Server className="h-4 w-4 text-[#a50064]" />
                {t.sdk.hostStepTitle}
              </p>
              {!latestToken ? (
                <p className="mt-1.5 text-[11px] text-slate-500">{t.sdk.hostWaiting}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-[11px]">
                  <li className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${DECISION_STYLE[latestToken.decision]}`}>
                      {latestToken.decision}
                    </span>
                    <span className="font-semibold text-slate-800">{t.sdk.hostDecision(latestToken.decision)}</span>
                  </li>
                  <li className="flex items-center gap-1.5 text-slate-700">
                    {signatureValid ? (
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                    )}
                    <span>{signatureValid ? t.sdk.signatureOk : t.sdk.signatureBad}</span>
                    <span className="tp-code truncate text-[10px] text-slate-400">{latestToken.signatureHash.slice(0, 20)}…</span>
                  </li>
                  <li className="flex items-center gap-1.5 text-slate-700">
                    <Fingerprint className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                    <span>{latestToken.biometricRequired ? t.sdk.hostC06Required : t.sdk.hostC06NotRequired}</span>
                  </li>
                  <li className="flex items-center gap-1.5 text-slate-700">
                    <Network className="h-3.5 w-3.5 shrink-0 text-[#a50064]" />
                    <span>
                      {latestToken.decision !== "ALLOW"
                        ? t.sdk.hostNapasStopped
                        : hostSettlementRef
                          ? t.sdk.hostNapasDone(hostSettlementRef)
                          : t.sdk.hostNapasPending}
                    </span>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== Phân tách trách nhiệm + Inspector ===================== */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-5">
        <section className="rounded-3xl border border-pink-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Wallet className="h-4 w-4 shrink-0 text-[#a50064]" />
            {t.sdk.tier1Title}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {t.sdk.tier1Items.map((item, index) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-slate-700">
                {index === 0 ? (
                  <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a50064]" />
                ) : index === 1 ? (
                  <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a50064]" />
                ) : (
                  <Network className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a50064]" />
                )}
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-sky-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Plug className="h-4 w-4 shrink-0 text-sky-600" />
            {t.sdk.tier2Title}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {t.sdk.tier2Items.map((item) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-slate-700">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <SdkEventInspector events={events} onClear={onClearEvents} />
      </div>
    </div>
  );
}

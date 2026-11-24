"use client";

import { useEffect, useState } from "react";
import {
  ScanFace,
  Lock,
  LockOpen,
  Camera,
  XCircle,
  Minimize2,
  HeartHandshake,
  Send,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ShieldBan,
  Download,
  Hourglass,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import type {
  AwsPipelineTrace,
  TransactionAnalysisResponse,
  TrustedGuardian,
  VerifyFaceResponse,
} from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";
import GuardianPhoneMockup, { type GuardianPhoneStage } from "@/components/user-wallet/GuardianPhoneMockup";
import AwsPipelineBar from "@/components/shared/AwsPipelineBar";
import {
  buildGuardianAlertSummary,
  COOLING_OFF_MS,
  GUARDIAN_DELIVERY_MS,
} from "@/lib/guardian/guardian-alert";
import { requestFaceVerification } from "@/lib/aws/pipeline-trace";
import { createDemoFaceBase64 } from "@/lib/biometric/demo-face";
import { maskPhoneForDisplay, maskRecipientForDisplay } from "@/lib/security/pii-display";
import { formatClock } from "@/lib/wallet/format";

export type CoolingOffOutcome = "pending" | "guardian_blocked" | "guardian_approved" | "ops_blocked";

export interface CoolingOffModalProps {
  analysis: TransactionAnalysisResponse;
  guardian: TrustedGuardian;
  /** Thời điểm giao dịch bị tạm giữ (epoch ms). */
  frozenAt: number;
  /** Thời điểm mở modal (epoch ms) — giá trị khởi tạo đồng hồ, tránh gọi Date.now() khi render. */
  openedAt: number;
  guardianSentAt: number | null;
  outcome: CoolingOffOutcome;
  balance: number;
  reportReady: boolean;
  approveError: string | null;
  onClose: () => void;
  onSendGuardianAlert: () => void;
  onGuardianBlock: () => void;
  onGuardianApprove: () => void;
  onFaceVerified: (result: VerifyFaceResponse) => void;
  onUseWebcam: () => void;
  onCancelTransaction: () => void;
  onDownloadReport: () => void;
  /** Vòng 3: sau khi Người giám hộ cho phép → mở hộp "Chuyển tiền thật qua Ngân hàng / MoMo". */
  onOpenRealHandoff?: () => void;
}

type FaceState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "matched" | "mismatch"; result: VerifyFaceResponse; trace: AwsPipelineTrace }
  | { status: "error" };

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Cơ chế Hạ nhiệt tâm lý 15 giây & Phê duyệt từ Người giám hộ.
 * Bước 1: giao dịch FROZEN + mô phỏng quét FaceID với đồng hồ 15 giây.
 * Bước 2: gửi cảnh báo → khung điện thoại Người giám hộ với tóm tắt AI động.
 * Bước 3: Người giám hộ "Chặn & Hủy" hoặc "Xác nhận an toàn – Cho phép chuyển".
 */
export default function CoolingOffModal({
  analysis,
  guardian,
  frozenAt,
  openedAt,
  guardianSentAt,
  outcome,
  balance,
  reportReady,
  approveError,
  onClose,
  onSendGuardianAlert,
  onGuardianBlock,
  onGuardianApprove,
  onFaceVerified,
  onUseWebcam,
  onCancelTransaction,
  onDownloadReport,
  onOpenRealHandoff,
}: CoolingOffModalProps) {
  const { t, lang, money, data } = useI18n();
  const [now, setNow] = useState<number>(openedAt);
  const [face, setFace] = useState<FaceState>({ status: "idle" });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const elapsed = Math.max(0, now - frozenAt);
  const remainingMs = Math.max(0, COOLING_OFF_MS - elapsed);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const coolingDone = remainingMs === 0;
  const ringOffset = RING_CIRCUMFERENCE * (1 - remainingMs / COOLING_OFF_MS);
  const resolved = outcome !== "pending";

  const recipientLabel = maskRecipientForDisplay(data(analysis.recipient));
  const amountLabel = money(analysis.parsedAmount);
  const summary = buildGuardianAlertSummary({ analysis, ownerName: t.common.ownerName, lang });

  let phoneStage: GuardianPhoneStage = "idle";
  if (outcome === "guardian_blocked") {
    phoneStage = "blocked";
  } else if (outcome === "guardian_approved") {
    phoneStage = "approved";
  } else if (guardianSentAt !== null) {
    phoneStage = now - guardianSentAt < GUARDIAN_DELIVERY_MS ? "sending" : "delivered";
  }

  const handleVerifyFace = async () => {
    setFace({ status: "verifying" });
    try {
      const { result, trace } = await requestFaceVerification(createDemoFaceBase64());
      setFace({ status: result.matched ? "matched" : "mismatch", result, trace });
    } catch {
      setFace({ status: "error" });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-cooling-title"
      aria-describedby="tp-cooling-desc"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4 lg:items-end lg:justify-end lg:bg-slate-950/35 lg:p-6"
    >
      {/* Điện thoại: bottom sheet • Tablet: modal giữa • Laptop: thẻ nổi góc phải dưới */}
      <div className="tp-sheet-in relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-sky-200/60 bg-white shadow-2xl shadow-slate-950/40 sm:max-h-[94vh] sm:rounded-3xl lg:max-h-[calc(100dvh-7rem)] lg:max-w-4xl">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/50 sm:hidden"
        />
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 px-5 py-4 text-white sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/20 px-2.5 py-0.5 text-[11px] font-bold text-sky-100 ring-1 ring-sky-300/40">
                <Lock className="h-3 w-3" />
                {t.cooling.frozenBadge}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/25 px-2.5 py-0.5 text-[11px] font-bold text-rose-100 ring-1 ring-rose-300/40">
                <AlertTriangle className="h-3 w-3" />
                {t.cooling.riskBadge(analysis.scamReport.riskScore)}
              </span>
            </div>
            <h2 id="tp-cooling-title" className="mt-2 text-base font-bold sm:text-lg">
              {t.cooling.title}
            </h2>
            <p id="tp-cooling-desc" className="mt-0.5 text-xs text-sky-100/90">
              {t.cooling.heldDesc(amountLabel, recipientLabel)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          >
            <Minimize2 className="h-4 w-4" />
            <span className="hidden sm:inline">{resolved ? t.common.close : t.cooling.minimize}</span>
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-2">
          {/* Cột trái: Hạ nhiệt + FaceID hoặc kết quả */}
          <div className="space-y-4">
            {outcome === "guardian_blocked" ? (
              <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
                  <ShieldCheck className="h-9 w-9" />
                </div>
                <h3 className="text-lg font-extrabold text-emerald-900">{t.cooling.protectedTitle}</h3>
                <p className="mt-1.5 text-sm text-emerald-800">
                  {t.cooling.protectedDesc(amountLabel, recipientLabel, money(balance))}
                </p>
                <p className="mt-2 text-xs font-semibold text-emerald-700">
                  {t.cooling.ticketPushed(analysis.fintechOpsTicket.ticketId)}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  <button
                    type="button"
                    disabled={!reportReady}
                    onClick={onDownloadReport}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {reportReady ? <Download className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                    {reportReady ? t.cooling.downloadReport : t.cooling.preparingReport}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                  >
                    {t.common.close}
                  </button>
                </div>
              </div>
            ) : outcome === "guardian_approved" ? (
              <div className="rounded-3xl border border-sky-200 bg-sky-50 p-6 text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg shadow-sky-600/30">
                  <CheckCircle2 className="h-9 w-9" />
                </div>
                <h3 className="text-lg font-extrabold text-sky-900">{t.cooling.approvedTitle}</h3>
                <p className="mt-1.5 text-sm text-sky-800">{t.cooling.approvedDesc(amountLabel)}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  {onOpenRealHandoff && (
                    <button
                      type="button"
                      onClick={onOpenRealHandoff}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/25 hover:brightness-110"
                    >
                      {t.handoff.openFromCooling}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-sky-700 px-5 py-3 text-sm font-bold text-white hover:bg-sky-800"
                  >
                    {t.common.close}
                  </button>
                </div>
              </div>
            ) : outcome === "ops_blocked" ? (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center">
                <ShieldBan className="mx-auto mb-3 h-12 w-12 text-rose-600" />
                <p className="text-sm font-bold text-rose-900">{t.cooling.opsResolved}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 inline-flex cursor-pointer items-center rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700"
                >
                  {t.common.close}
                </button>
              </div>
            ) : (
              <>
                {/* Mô phỏng quét FaceID + đồng hồ 15 giây */}
                <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="relative mx-auto flex h-56 w-56 items-center justify-center">
                    <svg aria-hidden="true" className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                      <circle
                        cx="60"
                        cy="60"
                        r={RING_RADIUS}
                        fill="none"
                        stroke={coolingDone ? "#059669" : "#0284c7"}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={ringOffset}
                        style={{ transition: "stroke-dashoffset 0.25s linear" }}
                      />
                    </svg>
                    <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-slate-900 to-slate-800 shadow-inner">
                      <ScanFace
                        className={`h-20 w-20 ${
                          face.status === "matched" ? "text-emerald-400" : coolingDone ? "text-sky-200" : "text-sky-400"
                        }`}
                      />
                      {(!coolingDone || face.status === "verifying") && (
                        <span aria-hidden="true" className="tp-scan-line absolute inset-x-4 h-0.5 rounded-full" />
                      )}
                    </div>
                  </div>

                  <div className="mt-3 text-center" aria-live="polite">
                    {coolingDone ? (
                      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                        <LockOpen className="h-4 w-4" />
                        {t.cooling.ready}
                      </p>
                    ) : (
                      <>
                        <p className="font-mono text-4xl font-extrabold text-sky-800">{secondsLeft}s</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                          <Hourglass className="h-3.5 w-3.5" />
                          {t.cooling.countdownLabel} · {t.cooling.scanning}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Gợi ý tự kiểm tra */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                    <Lightbulb className="h-3.5 w-3.5" />
                    {t.cooling.tipsTitle}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {t.cooling.tips.map((tip) => (
                      <li key={tip} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-900">
                        <span aria-hidden="true">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                    {data(analysis.scamReport.scamType)}
                  </p>
                </div>

                {/* Xác thực FaceID sau khi hết 15 giây */}
                <div className="space-y-2.5">
                  {face.status === "matched" || face.status === "mismatch" ? (
                    <div
                      className={`rounded-2xl border p-3.5 text-xs font-semibold ${
                        face.status === "matched"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {face.status === "matched"
                        ? t.cooling.faceMatched(face.result.similarity)
                        : t.cooling.faceMismatch}
                      <p className="mt-0.5 text-[11px] font-normal opacity-80">{data(face.result.message)}</p>
                    </div>
                  ) : face.status === "error" ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      {t.cooling.faceError}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {face.status === "matched" ? (
                      <button
                        type="button"
                        onClick={() => onFaceVerified(face.result)}
                        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/25 hover:brightness-110 sm:col-span-2"
                      >
                        <LockOpen className="h-4 w-4" />
                        {t.cooling.unlock}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!coolingDone || face.status === "verifying"}
                          onClick={() => void handleVerifyFace()}
                          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-700 to-indigo-700 px-4 py-3 text-xs font-bold text-white shadow-md shadow-sky-700/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none"
                        >
                          {face.status === "verifying" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : coolingDone ? (
                            <ScanFace className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                          {face.status === "verifying"
                            ? t.cooling.verifying
                            : coolingDone
                              ? t.cooling.verifyNow
                              : t.cooling.verifyLocked(secondsLeft)}
                        </button>
                        <button
                          type="button"
                          disabled={!coolingDone || face.status === "verifying"}
                          onClick={onUseWebcam}
                          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-bold text-sky-800 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Camera className="h-4 w-4" />
                          {t.cooling.useWebcam}
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onCancelTransaction}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    <XCircle className="h-4 w-4" />
                    {t.cooling.cancel}
                  </button>

                  {(face.status === "matched" || face.status === "mismatch") && <AwsPipelineBar trace={face.trace} />}
                </div>
              </>
            )}
          </div>

          {/* Cột phải: Người giám hộ */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-sky-900">
                <HeartHandshake className="h-4 w-4" />
                {t.cooling.guardianTitle}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {guardian.name} ({maskPhoneForDisplay(guardian.phone)})
              </p>
              {guardianSentAt === null ? (
                <>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{t.cooling.guardianDesc}</p>
                  <button
                    type="button"
                    disabled={resolved}
                    onClick={onSendGuardianAlert}
                    className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {t.cooling.sendGuardian}
                  </button>
                </>
              ) : (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t.cooling.sentTo(guardian.name)} · {formatClock(guardianSentAt, true)}
                </p>
              )}
            </div>

            <GuardianPhoneMockup
              guardian={guardian}
              stage={phoneStage}
              summary={summary}
              amountLabel={amountLabel}
              recipientLabel={recipientLabel}
              riskScore={analysis.scamReport.riskScore}
              clockLabel={formatClock(now)}
              onBlock={onGuardianBlock}
              onApprove={onGuardianApprove}
              approveError={approveError}
              decisionsDisabled={resolved}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

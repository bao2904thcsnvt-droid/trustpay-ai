"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Fingerprint,
  Loader2,
  QrCode,
  ScanLine,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { AwsPipelineTrace, BudgetCategory, CategoryName, RiskLevel } from "@/types/trustpay";
import { decideBiometric, type BiometricDecision } from "@/lib/compliance/biometric-policy";
import {
  buildQrContextCommand,
  inspectVietQr,
  QR_SAMPLES,
  qrRecipientLabel,
  type QrInspectionReport,
  type QrSampleId,
  type QrVerdict,
} from "@/lib/qr/vietqr-inspector";
import type { TlvField } from "@/lib/qr/emvco";
import { requestTransactionAnalysis } from "@/lib/aws/pipeline-trace";
import { expandBlacklistForText, mergeBlacklist } from "@/lib/wallet/blacklist-patterns";
import { ANOMALY_CLUSTER_PATTERN } from "@/lib/ops/anomaly-cluster";
import { createClientId, resolveWalletCategory } from "@/lib/wallet/ledger";
import { formatLatency } from "@/lib/wallet/format";
import { setLastQrPayload, useFeatureState } from "@/lib/features/feature-store";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface QrCheckResult {
  id: string;
  report: QrInspectionReport;
  amount: number;
  finalScore: number;
  finalLevel: RiskLevel;
  verdict: QrVerdict;
  category: CategoryName;
  policy: BiometricDecision;
}

export interface QrInspectorProps {
  budgets: BudgetCategory[];
  blacklist: string[];
  walletBalance: number;
  getDailyOutflow: () => number;
  verifiedCheckId: string | null;
  /** Mã NGUY HIỂM: tạo ticket Ops, trả về mã ticket. */
  onDanger: (check: QrCheckResult) => string | null;
  /** Thanh toán thật (trừ số dư + hạn mức); trả về true nếu thành công. */
  onPay: (check: QrCheckResult) => boolean;
  onRequestBiometric: (check: QrCheckResult) => void;
}

type ImageStatus = "idle" | "decoding" | "decoded" | "unsupported" | "not-found";
type InputSource = "sample" | "paste" | "image";

interface ContextState {
  status: "idle" | "pending" | "done" | "failed";
  score: number | null;
  trace: AwsPipelineTrace | null;
}

interface DetectedBarcodeLike {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcodeLike[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const VERDICT_STYLE: Record<QrVerdict, { box: string; icon: string; badge: string }> = {
  SAFE: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "bg-emerald-600 text-white",
    badge: "bg-emerald-600 text-white",
  },
  WARNING: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "bg-amber-500 text-white",
    badge: "bg-amber-500 text-white",
  },
  DANGER: {
    box: "border-rose-200 bg-rose-50 text-rose-900",
    icon: "bg-rose-600 text-white",
    badge: "bg-rose-600 text-white",
  },
};

function levelFromScore(score: number): RiskLevel {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

interface FlatTlvRow {
  path: string;
  field: TlvField;
}

function flattenTlv(fields: readonly TlvField[], prefix = ""): FlatTlvRow[] {
  const rows: FlatTlvRow[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.tag}` : field.tag;
    rows.push({ path, field });
    if (field.children) {
      rows.push(...flattenTlv(field.children, path));
    }
  }
  return rows;
}

/**
 * VietQR Inspector: dán chuỗi / tải ảnh / bấm mẫu → giải mã EMVCo TLV ngay trên
 * trình duyệt → đối chiếu Blacklist + ngữ cảnh Amazon Bedrock → cho phép trả
 * tiền thật (mã an toàn) hoặc chặn & đẩy ticket Ops (mã nguy hiểm).
 */
export default function QrInspector({
  budgets,
  blacklist,
  walletBalance,
  getDailyOutflow,
  verifiedCheckId,
  onDanger,
  onPay,
  onRequestBiometric,
}: QrInspectorProps) {
  const { t, money, category: categoryLabel, data } = useI18n();
  const features = useFeatureState();
  const [payload, setPayload] = useState("");
  const [source, setSource] = useState<InputSource>("paste");
  const [check, setCheck] = useState<QrCheckResult | null>(null);
  const [parseMs, setParseMs] = useState<number | null>(null);
  const [imageMs, setImageMs] = useState<number | null>(null);
  const [context, setContext] = useState<ContextState>({ status: "idle", score: null, trace: null });
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [amountText, setAmountText] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [paidCheckId, setPaidCheckId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const restoredRef = useRef(false);
  const runRef = useRef(0);
  // Một mã nguy hiểm chỉ tạo một ticket Ops trong phiên (soi lại → dùng lại mã ticket).
  const flaggedRef = useRef<Record<string, string>>({});

  const flagDanger = (danger: QrCheckResult): string | null => {
    const existing = flaggedRef.current[danger.report.payload];
    if (existing) return existing;
    const created = onDanger(danger);
    if (created) flaggedRef.current[danger.report.payload] = created;
    return created;
  };

  const buildCheck = (report: QrInspectionReport, amount: number, aiScore: number | null, id: string): QrCheckResult => {
    const finalScore = Math.max(report.riskScore, aiScore ?? 0);
    const finalLevel = levelFromScore(finalScore);
    const verdict: QrVerdict =
      report.verdict === "DANGER" || finalScore >= 70
        ? "DANGER"
        : report.verdict === "WARNING" || finalScore >= 40
          ? "WARNING"
          : "SAFE";
    return {
      id,
      report,
      amount,
      finalScore,
      finalLevel,
      verdict,
      category: resolveWalletCategory(report.suggestedCategory, budgets),
      policy: decideBiometric({
        parsedAmount: amount,
        riskLevel: finalLevel,
        dailyCumulativeBefore: getDailyOutflow(),
      }),
    };
  };

  const runInspection = async (raw: string, from: InputSource, options: { remote: boolean } = { remote: true }) => {
    const text = raw.trim();
    if (!text) return;
    restoredRef.current = true;
    const runId = ++runRef.current;
    const started = nowMs();
    const report = inspectVietQr(text, { blacklist });
    setParseMs(nowMs() - started);
    setSource(from);
    setPayError(null);
    setTicketId(null);
    setPaidCheckId(null);
    setLastQrPayload(text);

    const initialAmount = report.decoded?.amount ?? 0;
    setAmountText(initialAmount > 0 ? String(initialAmount) : "");
    const id = createClientId("QRC");
    const localCheck = buildCheck(report, initialAmount, null, id);
    setCheck(localCheck);

    if (!options.remote || !report.decoded) {
      setContext({ status: "idle", score: null, trace: null });
      if (options.remote && localCheck.verdict === "DANGER") {
        setTicketId(flagDanger(localCheck));
      }
      return;
    }

    setContext({ status: "pending", score: null, trace: null });
    const command = buildQrContextCommand(report, initialAmount);
    try {
      const effective = expandBlacklistForText(mergeBlacklist(blacklist, [ANOMALY_CLUSTER_PATTERN]), command);
      const { result, trace } = await requestTransactionAnalysis(
        { commandText: command, currentBudgets: budgets, blacklist: effective },
        "CONTEXT_CHECK",
      );
      if (runId !== runRef.current) return;
      const aiScore = Math.max(0, Math.min(100, Math.round(result.scamReport.riskScore)));
      const merged = buildCheck(report, initialAmount, aiScore, id);
      setContext({ status: "done", score: aiScore, trace });
      setCheck(merged);
      if (merged.verdict === "DANGER") {
        setTicketId(flagDanger(merged));
      }
    } catch {
      if (runId !== runRef.current) return;
      setContext({ status: "failed", score: null, trace: null });
      if (localCheck.verdict === "DANGER") {
        setTicketId(flagDanger(localCheck));
      }
    }
  };

  // Khôi phục mã soi gần nhất sau khi tải lại trang (chỉ phân tích cục bộ, không tạo ticket mới).
  const savedPayload = features.lastQrPayload;
  useEffect(() => {
    if (restoredRef.current || !savedPayload) return;
    const timer = window.setTimeout(() => {
      if (restoredRef.current) return;
      setPayload(savedPayload);
      void runInspection(savedPayload, "paste", { remote: false });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPayload]);

  const handleSample = (id: QrSampleId) => {
    const sample = QR_SAMPLES.find((item) => item.id === id);
    if (!sample) return;
    setPayload(sample.payload);
    setImageStatus("idle");
    setImageMs(null);
    void runInspection(sample.payload, "sample");
  };

  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageStatus("decoding");
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) {
      setImageStatus("unsupported");
      return;
    }
    const started = nowMs();
    try {
      const formats = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : null;
      if (formats && !formats.includes("qr_code")) {
        setImageStatus("unsupported");
        return;
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close();
      const raw = codes.find((code) => code.rawValue)?.rawValue;
      if (!raw) {
        setImageStatus("not-found");
        return;
      }
      setImageMs(nowMs() - started);
      setImageStatus("decoded");
      setPayload(raw);
      void runInspection(raw, "image");
    } catch {
      setImageStatus("not-found");
    }
  };

  const amountValue = Number(amountText.replace(/\D/g, "")) || 0;
  const activeCheck = check && amountValue !== check.amount ? buildCheck(check.report, amountValue, context.score, check.id) : check;
  const decoded = activeCheck?.report.decoded ?? null;
  const style = activeCheck ? VERDICT_STYLE[activeCheck.verdict] : null;
  const budget = activeCheck ? budgets.find((item) => item.name === activeCheck.category) : undefined;
  const budgetRemaining = budget ? budget.limit - budget.spent : null;
  const needsFace = Boolean(activeCheck?.policy.requireBiometric) && verifiedCheckId !== activeCheck?.id;
  const isPaid = activeCheck !== null && paidCheckId === activeCheck.id;

  const handlePay = () => {
    if (!activeCheck) return;
    if (activeCheck.amount > walletBalance) {
      setPayError(t.qr.insufficient);
      return;
    }
    const ok = onPay(activeCheck);
    if (ok) {
      setPaidCheckId(activeCheck.id);
      setPayError(null);
    }
  };

  const tlvRows = activeCheck ? flattenTlv(activeCheck.report.parse.fields) : [];
  const engineLabel = context.trace?.engine === "AWS" ? "Amazon Bedrock" : t.qr.pipeline.offline;

  return (
    <section
      id="tp-qr-inspector"
      aria-labelledby="tp-qr-title"
      className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
          <QrCode className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 id="tp-qr-title" className="text-base font-bold text-slate-900">
            {t.qr.title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.qr.subtitle}</p>
        </div>
      </div>

      {/* Mẫu demo */}
      <div className="mt-4">
        <p className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">{t.qr.samplesLabel}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {QR_SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => handleSample(sample.id)}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                sample.id === "cafe-valid"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300"
                  : "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300"
              }`}
            >
              {sample.id === "cafe-valid" ? (
                <ShieldCheck className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0">{t.qr.samples[sample.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dán chuỗi / tải ảnh */}
      <div className="mt-4">
        <label htmlFor="tp-qr-payload" className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          {t.qr.inputLabel}
        </label>
        <textarea
          id="tp-qr-payload"
          rows={3}
          value={payload}
          maxLength={512}
          spellCheck={false}
          onChange={(event) => setPayload(event.target.value)}
          placeholder={t.qr.placeholder}
          className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 font-mono text-[11px] break-all text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!payload.trim()}
            onClick={() => void runInspection(payload, "paste")}
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-[#a50064]/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {context.status === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {context.status === "pending" ? t.qr.inspecting : t.qr.inspect}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-[#a50064]"
          >
            <Upload className="h-4 w-4" />
            {t.qr.upload}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleImage(event)} />
          <span className="text-[11px] text-slate-400">{t.qr.uploadHint}</span>
        </div>
        {imageStatus !== "idle" && (
          <p
            role="status"
            className={`mt-2 text-xs ${
              imageStatus === "decoded" ? "text-emerald-700" : imageStatus === "decoding" ? "text-slate-500" : "text-amber-700"
            }`}
          >
            {imageStatus === "decoding"
              ? t.qr.imageDecoding
              : imageStatus === "decoded"
                ? t.qr.imageDecoded
                : imageStatus === "unsupported"
                  ? t.qr.imageUnsupported
                  : t.qr.imageNotFound}
          </p>
        )}
      </div>

      {/* Kết quả */}
      {!activeCheck || !style ? (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
          {t.qr.empty}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className={`rounded-2xl border p-4 ${style.box}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
                {activeCheck.verdict === "SAFE" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : activeCheck.verdict === "WARNING" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Ban className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">{t.qr.verdict[activeCheck.verdict]}</p>
                <p className="text-xs opacity-90">
                  {t.qr.riskScore(activeCheck.finalScore)} • {t.qr.riskLevel[activeCheck.finalLevel]}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${style.badge}`}>
                {activeCheck.finalScore}/100
              </span>
            </div>

            {activeCheck.report.signals.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {activeCheck.report.signals.map((signal) => (
                  <li key={`${signal.code}-${signal.detail ?? ""}`} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${signal.weight > 0 ? "bg-rose-500" : "bg-emerald-500"}`}
                    />
                    <span className="min-w-0 break-words">{t.qr.signals[signal.code](signal.detail ?? "")}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] opacity-70">
                      {signal.weight > 0 ? `+${signal.weight}` : signal.weight}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-[11px] opacity-90">
              <span className="font-semibold">{t.qr.contextCheck}: </span>
              {context.status === "pending"
                ? t.qr.contextPending
                : context.status === "done" && context.score !== null
                  ? t.qr.contextResult(engineLabel, context.score)
                  : context.status === "failed"
                    ? t.qr.contextFailed
                    : "—"}
            </p>
          </div>

          {/* Thông tin giải mã */}
          {decoded && (
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { label: t.qr.fields.merchant, value: decoded.merchantName ?? "—" },
                {
                  label: t.qr.fields.holder,
                  value: activeCheck.report.registeredName ?? t.qr.fields.holderUnknown,
                },
                {
                  label: t.qr.fields.bank,
                  value: decoded.bankBin ? `${decoded.bankName ?? "?"} (${decoded.bankBin})` : "—",
                },
                { label: t.qr.fields.account, value: decoded.accountNumber ?? "—" },
                {
                  label: t.qr.fields.amount,
                  value: decoded.amount !== null ? money(decoded.amount) : t.qr.fields.amountNone,
                },
                {
                  label: t.qr.fields.qrType,
                  value:
                    decoded.initiation === "DYNAMIC"
                      ? t.qr.fields.dynamic
                      : decoded.initiation === "STATIC"
                        ? t.qr.fields.static
                        : t.qr.fields.unknown,
                },
                { label: t.qr.fields.purpose, value: decoded.purpose ?? decoded.referenceLabel ?? "—" },
                {
                  label: t.qr.fields.crc,
                  value: !decoded.crc.present
                    ? t.qr.fields.crcMissing
                    : decoded.crc.valid
                      ? t.qr.fields.crcValid(decoded.crc.actual ?? "")
                      : t.qr.fields.crcInvalid(decoded.crc.actual ?? "", decoded.crc.expected ?? ""),
                },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{item.label}</dt>
                  <dd className="mt-0.5 font-mono text-xs break-all text-slate-900">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-[11px] text-slate-400">{t.qr.ownerViewNote}</p>

          {/* Thanh toán */}
          {activeCheck.verdict === "DANGER" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
              <Ban className="h-4 w-4 shrink-0" />
              <span>{t.qr.blocked}</span>
              {ticketId && <span className="font-mono text-[11px] text-rose-700">• {t.qr.ticketPushed(ticketId)}</span>}
            </div>
          ) : isPaid ? (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t.qr.paid(money(activeCheck.amount), data(qrRecipientLabel(activeCheck.report)))}
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <label htmlFor="tp-qr-amount" className="text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                {t.qr.amountInput}
              </label>
              <input
                id="tp-qr-amount"
                inputMode="numeric"
                value={amountText}
                readOnly={decoded?.amount !== null && decoded?.amount !== undefined}
                onChange={(event) => setAmountText(event.target.value.replace(/[^\d]/g, "").slice(0, 10))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none read-only:cursor-not-allowed read-only:opacity-80"
              />
              {budgetRemaining !== null && activeCheck.amount > budgetRemaining && (
                <p className="text-[11px] font-semibold text-amber-700">
                  {t.qr.overBudget(categoryLabel(activeCheck.category), money(Math.max(0, budgetRemaining)))}
                </p>
              )}
              {payError && <p className="text-[11px] font-semibold text-rose-700">{payError}</p>}
              {needsFace ? (
                <button
                  type="button"
                  onClick={() => onRequestBiometric(activeCheck)}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-sky-700"
                >
                  <Fingerprint className="h-4 w-4" />
                  {t.qr.verifyFace}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={activeCheck.amount <= 0 || context.status === "pending"}
                  onClick={handlePay}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.qr.pay(money(activeCheck.amount))}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              {activeCheck.policy.requireBiometric && (
                <p className="text-[11px] text-slate-500">
                  {needsFace ? t.qr.needBiometric : t.qr.faceVerified}
                </p>
              )}
            </div>
          )}

          {/* Bảng TLV (cuộn ngang trên điện thoại) */}
          {tlvRows.length > 0 && (
            <details className="group rounded-2xl border border-slate-200 bg-white">
              <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold text-slate-700">
                {t.qr.tlvTitle} ({tlvRows.length})
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full min-w-[560px] text-left text-[11px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t.qr.tlvTag}</th>
                      <th className="px-3 py-2 font-semibold">{t.qr.tlvLength}</th>
                      <th className="px-3 py-2 font-semibold">{t.qr.tlvValue}</th>
                      <th className="px-3 py-2 font-semibold">{t.qr.tlvMeaning}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tlvRows.map(({ path, field }) => (
                      <tr key={`${path}-${field.offset}`} className="text-slate-700">
                        <td className="px-3 py-1.5 font-mono font-bold whitespace-nowrap text-[#a50064]">{path}</td>
                        <td className="px-3 py-1.5 font-mono">{field.length}</td>
                        <td className="max-w-[260px] px-3 py-1.5 font-mono break-all">
                          {field.children ? "…" : field.value}
                        </td>
                        <td className="px-3 py-1.5">{t.qr.tagNames[path] ?? t.qr.tagNames[field.tag] ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Thanh luồng công nghệ */}
      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white">
        <ol className="flex flex-col gap-2 text-[11px] sm:flex-row sm:flex-wrap sm:items-center">
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400" />
            <span className="font-bold">{t.qr.pipeline.rekognition}</span>
            <span className="text-slate-300">{t.qr.pipeline.rekognitionRole}</span>
            <span className="text-slate-400">
              · {source === "image" ? `${t.qr.pipeline.fromImage}${imageMs !== null ? ` ${formatLatency(imageMs)}` : ""}` : t.qr.pipeline.skipped}
            </span>
          </li>
          <li aria-hidden="true" className="hidden text-slate-500 sm:block">
            →
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            <span className="font-bold">{t.qr.pipeline.parser}</span>
            <span className="text-slate-300">{t.qr.pipeline.parserRole}</span>
            <span className="text-slate-400">
              · {t.qr.pipeline.local}
              {parseMs !== null ? ` ${formatLatency(parseMs)}` : ""}
            </span>
          </li>
          <li aria-hidden="true" className="hidden text-slate-500 sm:block">
            →
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                context.status === "pending"
                  ? "animate-pulse bg-amber-400"
                  : context.trace?.engine === "AWS"
                    ? "bg-emerald-400"
                    : "bg-pink-400"
              }`}
            />
            <span className="font-bold">{t.qr.pipeline.bedrock}</span>
            <span className="text-slate-300">{t.qr.pipeline.bedrockRole}</span>
            {context.trace && (
              <span className="text-slate-400">
                · {engineLabel} {formatLatency(context.trace.totalLatencyMs)}
              </span>
            )}
          </li>
        </ol>
      </div>
    </section>
  );
}

"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import {
  Sparkles,
  ImagePlus,
  X,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Send,
  FileImage,
  Wand2,
  ClipboardPaste,
} from "lucide-react";
import type {
  AwsPipelineTrace,
  BudgetCategory,
  TransactionAnalysisRequest,
  TransactionAnalysisResponse,
} from "@/types/trustpay";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/mock-scenarios";
import { expandBlacklistForText } from "@/lib/wallet/blacklist-patterns";
import { requestTransactionAnalysis } from "@/lib/aws/pipeline-trace";
import { findInstitution } from "@/lib/payments/banks";
import { accountNumbersInText, buildAnalysisCommand, type PayeeDetails } from "@/lib/payments/vietqr-builder";
import {
  looksLikePaymentMessage,
  parsePaymentMessage,
  PASTE_MAX_LENGTH,
  type PasteField,
} from "@/lib/hub/paste-to-pay";
import { useI18n } from "@/components/i18n/I18nProvider";
import PayeeFields, { resolvePayeeDraft, type PayeeDraft } from "@/components/payments/PayeeFields";

interface DetectedBarcodeLike {
  rawValue: string;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): { detect(source: ImageBitmapSource): Promise<DetectedBarcodeLike[]> };
}

type ImageQrRead = { kind: "found"; payload: string } | { kind: "none" } | { kind: "unsupported" };

/** Đọc mã QR trong ảnh ngay trên máy (BarcodeDetector) — ảnh không rời trình duyệt. */
async function readQrFromImageFile(file: File): Promise<ImageQrRead> {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (typeof ctor !== "function" || typeof createImageBitmap !== "function") return { kind: "unsupported" };
  try {
    const bitmap = await createImageBitmap(file);
    const codes = await new ctor({ formats: ["qr_code"] }).detect(bitmap);
    bitmap.close();
    const payload = codes.find((code) => code.rawValue)?.rawValue;
    return payload ? { kind: "found", payload } : { kind: "none" };
  } catch {
    return { kind: "unsupported" };
  }
}

/** Kết quả Paste-to-Pay hiển thị lại sau khi biểu mẫu được điền sẵn. */
export interface PasteSummary {
  found: PasteField[];
  missing: PasteField[];
}

export interface TransactionAnalysisMeta {
  commandText: string;
  imageBase64?: string;
  trace: AwsPipelineTrace;
  /** Vòng 3: người nhận thật (ngân hàng/ví + STK) đã được đưa vào phân tích. */
  payee?: PayeeDetails | null;
  /** Vòng 4: nội dung chuyển khoản gợi ý (Paste-to-Pay) khi lệnh điền sẵn chưa bị sửa. */
  memo?: string;
}

export interface TransactionInputPanelProps {
  budgets: BudgetCategory[];
  blacklist: string[];
  onAnalysisComplete: (result: TransactionAnalysisResponse, meta: TransactionAnalysisMeta) => void;
  onAnalyzingChange?: (isAnalyzing: boolean) => void;
  /** Lệnh điền sẵn (vd từ Tour hướng dẫn). Panel được remount bằng `key` khi đổi. */
  initialCommandText?: string;
  initialScenarioId?: string | null;
  /** Kịch bản cần làm nổi bật (Tour bước 1). */
  highlightScenarioId?: string | null;
  /** Vòng 3: bản nháp người nhận thật (giữ ở component cha để không mất khi panel remount). */
  payeeDraft?: PayeeDraft;
  onPayeeDraftChange?: (draft: PayeeDraft) => void;
  /** Vòng 4: tự bấm "Phân tích" ngay sau khi được điền sẵn (Danh bạ 1 chạm / Paste-to-Pay). */
  initialAutoSubmit?: boolean;
  initialPasteSummary?: PasteSummary | null;
  /** Nội dung chuyển khoản bóc từ tin nhắn đã dán (dùng cho mã VietQR thật). */
  initialMemo?: string;
  /** Paste-to-Pay (tin nhắn): cha bóc tách + điền sẵn; trả về false nếu không nhận ra gì. */
  onPasteToPay?: (raw: string) => boolean;
  /** Paste-to-Pay (ảnh có mã VietQR): cha chuyển sang Soi mã VietQR. */
  onPasteQr?: (payload: string) => void;
}

function getScenarioStyle(scenario: DemoScenario, isSelected: boolean) {
  if (scenario.expectedRiskLevel === "HIGH") {
    return {
      card: isSelected
        ? "border-rose-400 bg-rose-50 ring-2 ring-rose-200"
        : "border-rose-200/80 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50/80",
      badge: "bg-rose-100 text-rose-700",
      Icon: ShieldAlert,
      iconColor: "text-rose-600",
    };
  }

  if (scenario.expectedBudgetExceeded) {
    return {
      card: isSelected
        ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
        : "border-amber-200/80 bg-amber-50/40 hover:border-amber-300 hover:bg-amber-50/80",
      badge: "bg-amber-100 text-amber-800",
      Icon: AlertTriangle,
      iconColor: "text-amber-600",
    };
  }

  return {
    card: isSelected
      ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
      : "border-emerald-200/80 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50/80",
    badge: "bg-emerald-100 text-emerald-700",
    Icon: ShieldCheck,
    iconColor: "text-emerald-600",
  };
}

export default function TransactionInputPanel({
  budgets,
  blacklist,
  onAnalysisComplete,
  onAnalyzingChange,
  initialCommandText = "",
  initialScenarioId = null,
  highlightScenarioId = null,
  payeeDraft,
  onPayeeDraftChange,
  initialAutoSubmit = false,
  initialPasteSummary = null,
  initialMemo,
  onPasteToPay,
  onPasteQr,
}: TransactionInputPanelProps) {
  const { t } = useI18n();
  const payeeStatus = payeeDraft ? resolvePayeeDraft(payeeDraft, t.payee) : ({ state: "EMPTY" } as const);
  const readyPayee = payeeStatus.state === "READY" ? payeeStatus.payee : null;
  const readyInstitution = readyPayee ? findInstitution(readyPayee.institutionCode) : undefined;
  const [commandText, setCommandText] = useState(initialCommandText);
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageName, setImageName] = useState<string>("");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(initialScenarioId);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Vòng 4 — Paste-to-Pay
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteFileRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<() => void>(() => {});
  const autoSubmittedRef = useRef(false);

  const handleSelectScenario = (scenario: DemoScenario) => {
    setCommandText(scenario.commandText);
    setActiveScenarioId(scenario.id);
    setErrorMsg(null);
  };

  /** Kiểm tra & đính kèm ảnh làm bằng chứng cho Lá chắn AI (≤ 5 MB, chỉ ảnh). */
  const attachImageFile = (file: File): boolean => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg(t.transfer.errorInvalidFile);
      return false;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg(t.transfer.errorFileTooLarge);
      return false;
    }

    setErrorMsg(null);
    setImageName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
    return true;
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    attachImageFile(file);
  };

  const handleRemoveImage = () => {
    setImageBase64(undefined);
    setImageName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();

    const trimmed = commandText.trim();
    if (!trimmed && !imageBase64) {
      setErrorMsg(t.transfer.errorEmpty);
      return;
    }
    if (payeeStatus.state === "INVALID") {
      setErrorMsg(payeeStatus.message);
      return;
    }

    // Vòng 3: nối STK người nhận thật vào lệnh để Lá chắn AI đối chiếu đúng tài khoản sẽ nhận tiền.
    const analysisCommand = buildAnalysisCommand(trimmed, readyPayee);
    // Vòng 4: nội dung gợi ý chỉ dùng khi người dùng chưa sửa lệnh đã điền sẵn.
    const memo = initialMemo && trimmed === initialCommandText.trim() ? initialMemo : undefined;

    setErrorMsg(null);
    setIsAnalyzing(true);
    onAnalyzingChange?.(true);

    try {
      const payload: TransactionAnalysisRequest = {
        commandText: analysisCommand,
        ...(imageBase64 ? { imageBase64 } : {}),
        currentBudgets: budgets,
        // Nở các mục cụm (vd 1903xxxx) thành STK cụ thể có trong lệnh — hợp đồng API giữ nguyên.
        blacklist: expandBlacklistForText(blacklist, analysisCommand),
      };

      const { result, trace } = await requestTransactionAnalysis(
        payload,
        imageBase64 ? "IMAGE_EVIDENCE" : "CONTEXT_CHECK",
      );
      onAnalysisComplete(result, {
        commandText: analysisCommand,
        imageBase64,
        trace,
        payee: readyPayee,
        ...(memo ? { memo } : {}),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? t.transfer.errorServer(err.message) : t.transfer.errorGeneric);
    } finally {
      setIsAnalyzing(false);
      onAnalyzingChange?.(false);
    }
  };

  // Luôn trỏ tới bản handleSubmit mới nhất (dùng cho tự phân tích sau khi điền sẵn).
  useEffect(() => {
    submitRef.current = () => void handleSubmit();
  });

  // Danh bạ 1 chạm / Paste-to-Pay: tự phân tích ngay khi panel được điền sẵn. Cờ chặn được đặt
  // BÊN TRONG hẹn giờ để React Strict Mode (chạy effect 2 lần khi dev) không làm mất lượt tự phân tích.
  useEffect(() => {
    if (!initialAutoSubmit) return;
    const timer = window.setTimeout(() => {
      if (autoSubmittedRef.current) return;
      autoSubmittedRef.current = true;
      submitRef.current();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialAutoSubmit]);

  // ------------------------------------------------------------ Paste-to-Pay

  /** Gửi tin nhắn cho component cha bóc tách + điền sẵn (panel sẽ được remount). */
  const fillFromMessage = (raw: string): boolean => {
    const text = raw.trim();
    if (!text) {
      setPasteNote(t.paste.nothing);
      return false;
    }
    if (onPasteToPay?.(text)) {
      return true;
    }
    setPasteNote(t.paste.nothing);
    return false;
  };

  /** Ảnh dán / chọn: có mã VietQR → soi mã; không có → đính kèm để Lá chắn AI đọc chữ. */
  const handlePastedImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg(t.transfer.errorInvalidFile);
      return;
    }
    setPasteBusy(true);
    const read = await readQrFromImageFile(file);
    setPasteBusy(false);
    if (read.kind === "found" && onPasteQr) {
      setPasteNote(t.paste.imageQr);
      onPasteQr(read.payload);
      return;
    }
    if (attachImageFile(file)) {
      setPasteNote(read.kind === "unsupported" ? t.paste.imageNoDetector : t.paste.imageNoQr);
    }
  };

  /** Ctrl+V vào ô lệnh hoặc ô dán: ảnh → QR/bằng chứng; tin nhắn chuyển khoản → tự điền. */
  const handleClipboardPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteToPay) return;
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
    const imageFile = imageItem?.getAsFile() ?? null;
    if (imageFile) {
      event.preventDefault();
      void handlePastedImage(imageFile);
      return;
    }
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.trim() || !looksLikePaymentMessage(parsePaymentMessage(text))) {
      return; // Dán bình thường.
    }
    if (onPasteToPay(text)) {
      event.preventDefault();
    }
  };

  const handleReadClipboard = async () => {
    setPasteNote(null);
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) {
      setPasteNote(t.paste.clipboardDenied);
      return;
    }
    try {
      if (typeof clipboard.read === "function") {
        const items = await clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((type) => type.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            await handlePastedImage(new File([blob], "clipboard-image.png", { type: imageType }));
            return;
          }
        }
      }
      const text = (await clipboard.readText()).slice(0, PASTE_MAX_LENGTH);
      setPasteText(text);
      fillFromMessage(text);
    } catch {
      setPasteNote(t.paste.clipboardDenied);
    }
  };

  const handlePasteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void handlePastedImage(file);
    }
  };

  const smallButton =
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-[#a50064] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="rounded-3xl border border-pink-100 bg-white p-6 shadow-sm shadow-[#a50064]/5">
      {/* Tiêu đề */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
            <Wand2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{t.transfer.title}</h2>
            <p className="text-xs text-slate-500">{t.transfer.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Vòng 4 — 📋 Paste-to-Pay: dán tin nhắn / ảnh để tự điền */}
      {onPasteToPay && (
        <div className="mb-5">
          <button
            type="button"
            disabled={isAnalyzing}
            aria-expanded={pasteOpen}
            aria-controls="tp-paste-panel"
            onClick={() => {
              setPasteOpen((open) => !open);
              setPasteNote(null);
            }}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#d82d8b]/50 bg-pink-50/70 px-4 py-3 text-sm font-bold text-[#a50064] transition-colors hover:border-[#d82d8b] hover:bg-pink-100/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ClipboardPaste className="h-4 w-4 shrink-0" />
            <span className="text-center">{t.paste.button}</span>
          </button>
          <p className="mt-1.5 px-1 text-center text-[11px] text-slate-400">{t.paste.ctrlvHint}</p>

          {pasteOpen && (
            <div id="tp-paste-panel" className="mt-3 space-y-2.5 rounded-2xl border border-pink-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{t.paste.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t.paste.hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPasteOpen(false)}
                  aria-label={t.paste.close}
                  title={t.paste.close}
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label htmlFor="tp-paste-input" className="sr-only">
                {t.paste.title}
              </label>
              <textarea
                id="tp-paste-input"
                rows={3}
                value={pasteText}
                maxLength={PASTE_MAX_LENGTH}
                disabled={isAnalyzing}
                onChange={(event) => {
                  setPasteText(event.target.value);
                  setPasteNote(null);
                }}
                onPaste={handleClipboardPaste}
                placeholder={t.paste.placeholder}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isAnalyzing || !pasteText.trim()}
                  onClick={() => fillFromMessage(pasteText)}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t.paste.fill}
                </button>
                <button
                  type="button"
                  disabled={isAnalyzing || pasteBusy}
                  onClick={() => void handleReadClipboard()}
                  className={smallButton}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  {t.paste.readClipboard}
                </button>
                <button
                  type="button"
                  disabled={isAnalyzing || pasteBusy}
                  onClick={() => pasteFileRef.current?.click()}
                  className={smallButton}
                >
                  {pasteBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {t.paste.attachImage}
                </button>
                <input ref={pasteFileRef} type="file" accept="image/*" onChange={handlePasteFile} className="hidden" />
              </div>
            </div>
          )}

          {pasteNote && (
            <p
              role="status"
              className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-800"
            >
              {pasteNote}
            </p>
          )}
        </div>
      )}

      {/* Kết quả Paste-to-Pay sau khi tự điền */}
      {initialPasteSummary && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3" role="status">
          <p className="text-xs font-bold text-emerald-900">{t.paste.found}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {initialPasteSummary.found.map((field) => (
              <span
                key={field}
                className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
              >
                ✓ {t.paste.fields[field]}
              </span>
            ))}
          </div>
          {initialPasteSummary.missing.length > 0 && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
              {t.paste.missing(initialPasteSummary.missing.map((field) => t.paste.fields[field]).join(", "))}
            </p>
          )}
        </div>
      )}

      {/* Hàng 4 nút kịch bản Demo 1-click */}
      <div className="mb-5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-[#a50064]" />
            {t.transfer.scenariosTitle}
          </span>
          <span className="text-[11px] text-slate-400">{t.transfer.scenariosHint}</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {DEMO_SCENARIOS.map((scenario) => {
            const isSelected = activeScenarioId === scenario.id;
            const style = getScenarioStyle(scenario, isSelected);
            const Icon = style.Icon;
            const text = t.transfer.scenarios[scenario.id] ?? {
              label: scenario.label,
              badge: scenario.badge,
              description: scenario.description,
            };
            const isHighlighted = highlightScenarioId === scenario.id;

            return (
              <button
                key={scenario.id}
                type="button"
                disabled={isAnalyzing}
                onClick={() => handleSelectScenario(scenario)}
                className={`group flex cursor-pointer flex-col items-start rounded-2xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${style.card} ${
                  isHighlighted ? "tp-highlight" : ""
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${style.iconColor}`} />
                    <span className="line-clamp-1">{text.label}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}>
                    {text.badge}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">{text.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form nhập liệu */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label htmlFor="trustpay-command-input" className="mb-1.5 block text-xs font-semibold text-slate-700">
            {t.transfer.inputLabel}
          </label>
          <textarea
            id="trustpay-command-input"
            rows={3}
            value={commandText}
            disabled={isAnalyzing}
            maxLength={2000}
            onChange={(e) => {
              setCommandText(e.target.value);
              setActiveScenarioId(null);
              if (errorMsg) setErrorMsg(null);
            }}
            onPaste={handleClipboardPaste}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={t.transfer.placeholder}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60"
          />
        </div>

        {/* Vòng 3: Ngân hàng / Ví nhận tiền thật (BIN NAPAS) */}
        {payeeDraft && onPayeeDraftChange && (
          <div className="space-y-1.5">
            <PayeeFields draft={payeeDraft} onChange={onPayeeDraftChange} disabled={isAnalyzing} />
            {readyPayee && readyInstitution && (
              <p className="px-1 text-[11px] text-slate-500">
                {t.payee.appendedNote(readyPayee.accountNumber, readyInstitution.shortName)}
              </p>
            )}
            {readyPayee &&
              accountNumbersInText(commandText).some((account) => account !== readyPayee.accountNumber) && (
                <p className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t.payee.mismatch}
                </p>
              )}
          </div>
        )}

        {/* Khu vực tải ảnh & preview nhỏ */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              className="hidden"
            />

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3.5 py-2 text-xs font-semibold text-[#a50064] transition-all hover:border-[#d82d8b] hover:bg-pink-100/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ImagePlus className="h-4 w-4" />
              <span>{t.transfer.upload}</span>
            </button>

            {!imageBase64 && <span className="hidden text-xs text-slate-400 sm:inline">{t.transfer.uploadHint}</span>}
          </div>

          {imageBase64 && (
            <div className="flex items-center gap-2.5 rounded-xl border border-pink-200 bg-white py-1.5 pr-2 pl-1.5 shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageBase64}
                alt={t.transfer.imageAlt}
                className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200"
              />
              <div className="max-w-36">
                <p className="flex items-center gap-1 truncate text-xs font-semibold text-slate-800">
                  <FileImage className="h-3 w-3 shrink-0 text-[#a50064]" />
                  <span className="truncate">{imageName || t.transfer.imageAttached}</span>
                </p>
                <p className="text-[10px] font-medium text-emerald-600">{t.transfer.imageReady}</p>
              </div>
              <button
                type="button"
                onClick={handleRemoveImage}
                title={t.transfer.removeImage}
                aria-label={t.transfer.removeImage}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-400">
            {t.transfer.tipPrefix}{" "}
            <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
              Ctrl
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
              Enter
            </kbd>{" "}
            {t.transfer.tipSuffix}
          </p>

          <button
            type="submit"
            disabled={isAnalyzing || (!commandText.trim() && !imageBase64)}
            className="inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t.transfer.analyzing}</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>{t.transfer.submit}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from "react";
import {
  Check,
  ChevronDown,
  Contact,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  Landmark,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { findInstitution, PAYER_BANK_APPS, type PayeeInstitutionCode } from "@/lib/payments/banks";
import {
  buildBankDeeplink,
  buildPayeeVietQr,
  buildVietQrImageUrl,
  removeDiacritics,
  sanitizeAccountName,
  sanitizeMemo,
  VIETQR_MEMO_MAX,
  type PayeeDetails,
} from "@/lib/payments/vietqr-builder";
import { decodeVietQr } from "@/lib/qr/vietqr-inspector";
import { useI18n } from "@/components/i18n/I18nProvider";
import QrCodeSvg, { downloadQrPng, useQrMatrix } from "@/components/payments/QrCodeSvg";

export type HandoffState =
  | { kind: "hidden" }
  | { kind: "need-payee" }
  | { kind: "locked"; reason: "risk" | "biometric" | "blocked" }
  | { kind: "ready"; via: "safe" | "guardian"; guardianName: string };

export interface RealPaymentHandoffProps {
  state: HandoffState;
  payee: PayeeDetails | null;
  /** Số tiền đã được Lá chắn AI phân tích (0 → mã tĩnh, người trả tự nhập). */
  amount: number;
  defaultMemo: string;
  onRequestPayee: () => void;
  onCopied: (ok: boolean) => void;
  onPngSaved: () => void;
  highlighted?: boolean;
  /** Vòng 4: Khóa sinh trắc học đang bật và chưa mở khóa gần đây → chưa hiện mã VietQR. */
  locked?: boolean;
  onRequestUnlock?: () => void;
  /** Vòng 4: app ngân hàng của NGƯỜI TRẢ mặc định = nguồn tiền mặc định (nếu là ngân hàng). */
  preferredPayerApp?: PayeeInstitutionCode | null;
  /** Vòng 4: người nhận MẪU trong Danh bạ Tin cậy (STK minh họa) → không tạo mã chuyển tiền thật. */
  samplePayee?: boolean;
}

const QR_SIZE = 220;
const REMOTE_TIMEOUT_MS = 6000;

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};
const getOnlineSnapshot = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const getServerOnlineSnapshot = () => true;

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent || "";
  return (
    /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1)
  );
}

/** Lọc nội dung khi đang gõ (giữ khoảng trắng giữa các từ; cắt gọn khi dựng mã). */
function cleanMemoInput(raw: string): string {
  return removeDiacritics(raw)
    .replace(/[^A-Za-z0-9 ]+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "")
    .slice(0, VIETQR_MEMO_MAX);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Rơi xuống cách dự phòng bên dưới.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Hộp "Chuyển tiền thật qua Ngân hàng / MoMo (Real Payment Handoff)": chỉ mở khi
 * Lá chắn AI đánh giá AN TOÀN hoặc Người giám hộ đã cho phép. Người nhận bị KHÓA
 * theo đúng STK đã phân tích; chỉ nội dung chuyển khoản được chỉnh.
 */
export default function RealPaymentHandoff({
  state,
  payee,
  amount,
  defaultMemo,
  onRequestPayee,
  onCopied,
  onPngSaved,
  highlighted = false,
  locked = false,
  onRequestUnlock,
  preferredPayerApp = null,
  samplePayee = false,
}: RealPaymentHandoffProps) {
  const { t, money } = useI18n();
  const institution = payee ? findInstitution(payee.institutionCode) : undefined;
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);

  const [memo, setMemo] = useState(() => sanitizeMemo(defaultMemo));
  const [debouncedMemo, setDebouncedMemo] = useState(() => sanitizeMemo(defaultMemo));
  const [preferLocal, setPreferLocal] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [payerApp, setPayerApp] = useState<PayeeInstitutionCode>(() => {
    const preferred = findInstitution(preferredPayerApp);
    if (preferred && preferred.kind === "BANK") return preferred.code;
    return institution && institution.kind === "BANK" ? institution.code : "VCB";
  });
  const [desktopNote, setDesktopNote] = useState(false);
  const [momoGuideOpen, setMomoGuideOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const loadedRef = useRef<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  // Vòng 4: đã mở khóa và hiện mã cho phiên này (component remount theo phiên) → giữ mã, không ẩn
  // giữa chừng khi hết 2 phút trong lúc người dùng đang quét.
  const [revealed, setRevealed] = useState(false);
  if (!revealed && !locked && state.kind === "ready") {
    setRevealed(true);
  }
  const lockActive = locked && !revealed;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedMemo(sanitizeMemo(memo)), 450);
    return () => window.clearTimeout(timer);
  }, [memo]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const qrAmount = amount > 0 ? Math.round(amount) : null;
  const payload = useMemo(() => {
    if (!payee) return null;
    try {
      return buildPayeeVietQr(payee, qrAmount, debouncedMemo);
    } catch {
      return null;
    }
  }, [payee, qrAmount, debouncedMemo]);
  const matrix = useQrMatrix(payload ?? "");

  const selfCheck = useMemo(() => {
    if (!payload || !payee || !institution) return null;
    const decoded = decodeVietQr(payload).decoded;
    const ok =
      decoded !== null &&
      decoded.crc.valid &&
      decoded.bankBin === institution.bin &&
      decoded.accountNumber === payee.accountNumber;
    return { ok, crc: decoded?.crc.actual ?? "" };
  }, [payload, payee, institution]);

  const accountName = payee ? sanitizeAccountName(payee.accountName) : "";
  const imageUrl =
    payee && institution
      ? buildVietQrImageUrl({ institution, accountNumber: payee.accountNumber, amount: qrAmount, memo: debouncedMemo, accountName })
      : null;

  const remoteAllowed = Boolean(institution?.remoteImage) && online && !preferLocal;
  const remoteStatus: "loading" | "loaded" | "error" =
    imageUrl === null || failedUrl === imageUrl ? "error" : loadedUrl === imageUrl ? "loaded" : "loading";
  const useRemote = remoteAllowed && remoteStatus !== "error";

  // Quá thời gian chờ ảnh từ xa → tự chuyển sang QR vẽ trên máy.
  useEffect(() => {
    if (!useRemote || !imageUrl || remoteStatus !== "loading") return;
    const timer = window.setTimeout(() => {
      if (loadedRef.current !== imageUrl) setFailedUrl(imageUrl);
    }, REMOTE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [useRemote, imageUrl, remoteStatus]);

  if (state.kind === "hidden") {
    return null;
  }

  if (state.kind === "need-payee") {
    return (
      <section id="tp-real-handoff" className="rounded-3xl border border-dashed border-pink-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
            <QrCode className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">{t.handoff.needPayeeTitle}</p>
            <p className="text-[11px] text-slate-500">{t.handoff.needPayeeDesc}</p>
          </div>
          <button
            type="button"
            onClick={onRequestPayee}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-xs font-semibold text-[#a50064] transition-colors hover:bg-pink-100"
          >
            <Landmark className="h-4 w-4" />
            {t.handoff.needPayeeCta}
          </button>
        </div>
      </section>
    );
  }

  if (state.kind === "locked") {
    return (
      <section id="tp-real-handoff" className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
            <Lock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{t.handoff.lockedTitle}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
              {state.reason === "biometric"
                ? t.handoff.lockedBiometric
                : state.reason === "blocked"
                  ? t.handoff.blockedDesc
                  : t.handoff.lockedDesc}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Vòng 4: người nhận MẪU (STK minh họa) — Lá chắn AI đã soát xong nhưng KHÔNG tạo mã chuyển tiền thật,
  // tránh việc tiền thật có thể đi tới một tài khoản ngoài đời trùng số minh họa.
  if (samplePayee) {
    return (
      <section id="tp-real-handoff" className="rounded-3xl border border-sky-200 bg-sky-50/70 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white">
            <Contact className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{t.payees.sampleLockedTitle}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{t.payees.sampleLockedDesc}</p>
          </div>
        </div>
      </section>
    );
  }

  // Vòng 4: Khóa sinh trắc học thiết bị — phải mở khóa (Vân tay / FaceID / PIN) trước khi hiện mã thật.
  if (lockActive) {
    return (
      <section
        id="tp-real-handoff"
        className={`rounded-3xl border border-amber-200 bg-amber-50/70 p-4 ${highlighted ? "tp-highlight" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
            <Fingerprint className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">{t.handoff.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{t.lock.qrLockedDesc}</p>
          </div>
          {onRequestUnlock && (
            <button
              type="button"
              onClick={onRequestUnlock}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:brightness-110 sm:w-auto"
            >
              {t.lock.qrLocked}
            </button>
          )}
        </div>
      </section>
    );
  }

  if (!payee || !institution || !payload) {
    return null;
  }

  const payerInstitution = findInstitution(payerApp) ?? PAYER_BANK_APPS[0];
  const deeplink = buildBankDeeplink(payerInstitution.slug);
  const copyLines = [
    `${t.handoff.copyLines.bank}: ${institution.shortName} (${institution.bin})`,
    `${t.handoff.copyLines.account}: ${payee.accountNumber}`,
    ...(accountName ? [`${t.handoff.copyLines.holder}: ${accountName}`] : []),
    ...(qrAmount !== null ? [`${t.handoff.copyLines.amount}: ${money(qrAmount)}`] : []),
    ...(debouncedMemo ? [`${t.handoff.copyLines.memo}: ${debouncedMemo}`] : []),
  ].join("\n");

  const handleCopy = async () => {
    const ok = await copyText(copyLines);
    onCopied(ok);
    if (ok) {
      setCopied(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleOpenBank = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (isMobileDevice()) {
      setDesktopNote(false);
      return; // Để trình duyệt mở VietQR DeepLink → app ngân hàng.
    }
    event.preventDefault();
    setDesktopNote(true);
    void handleCopy();
  };

  const handleOpenMomo = () => {
    setMomoGuideOpen(true);
    if (isMobileDevice()) {
      window.location.href = "momo://";
    }
  };

  const handleSavePng = () => {
    if (matrix && downloadQrPng(matrix, `vietqr-${institution.code.toLowerCase()}-${payee.accountNumber.slice(-4)}.png`)) {
      onPngSaved();
    }
  };

  const buttonBase =
    "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-all";

  return (
    <section
      id="tp-real-handoff"
      aria-labelledby="tp-real-handoff-title"
      className={`rounded-3xl border border-emerald-200 bg-white p-4 shadow-xs sm:p-5 ${highlighted ? "tp-highlight" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="tp-real-handoff-title" className="text-base font-bold text-slate-900">
            {t.handoff.title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.handoff.subtitle}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          {state.via === "guardian" ? t.handoff.readyGuardian(state.guardianName) : t.handoff.readySafe}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
        {/* Mã QR quét được thật */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 p-2"
            style={{ backgroundColor: "#ffffff", width: QR_SIZE + 18, minHeight: QR_SIZE + 18 }}
          >
            {useRemote && imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt={t.handoff.sourceRemote}
                  width={QR_SIZE}
                  height={QR_SIZE}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  onLoad={() => {
                    loadedRef.current = imageUrl;
                    setLoadedUrl(imageUrl);
                  }}
                  onError={() => setFailedUrl(imageUrl)}
                  className={`h-auto w-full max-w-[220px] object-contain ${remoteStatus === "loaded" ? "" : "opacity-0"}`}
                />
                {remoteStatus === "loading" && (
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-slate-500">
                    {t.handoff.imageLoading}
                  </span>
                )}
              </>
            ) : (
              <QrCodeSvg value={payload} size={QR_SIZE} title={t.handoff.sourceLocal} />
            )}
          </div>

          <div role="group" aria-label={t.handoff.sourceRemote} className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              disabled={!institution.remoteImage || !online}
              aria-pressed={useRemote}
              onClick={() => {
                setPreferLocal(false);
                setFailedUrl(null);
              }}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                useRemote ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
              }`}
            >
              {t.handoff.sourceRemote}
            </button>
            <button
              type="button"
              aria-pressed={!useRemote}
              onClick={() => setPreferLocal(true)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                !useRemote ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
              }`}
            >
              {t.handoff.sourceLocal}
            </button>
          </div>

          <p className="max-w-[240px] text-center text-[11px] leading-relaxed text-slate-500">
            {!online ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                <WifiOff className="h-3.5 w-3.5 shrink-0" />
                {t.handoff.offline}
              </span>
            ) : !institution.remoteImage ? (
              t.handoff.walletLocalOnly
            ) : remoteAllowed && remoteStatus === "error" ? (
              <span className="font-semibold text-amber-700">{t.handoff.imageFallback}</span>
            ) : useRemote ? (
              t.handoff.privacyRemote
            ) : (
              t.handoff.scanHint
            )}
          </p>
        </div>

        {/* Thông tin chuyển khoản + hành động */}
        <div className="min-w-0 space-y-3">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { label: t.handoff.bank, value: `${institution.shortName} (${institution.bin})`, style: "font-semibold" },
              // Chỉ STK dùng font mã (JetBrains Mono); số tiền dùng Inter tabular như mọi số tiền khác.
              { label: t.handoff.account, value: payee.accountNumber, style: "tp-code" },
              { label: t.handoff.holder, value: accountName || t.handoff.holderUnknown, style: "font-semibold" },
              { label: t.handoff.amount, value: qrAmount !== null ? money(qrAmount) : "—", style: "tp-num font-bold" },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{item.label}</dt>
                <dd className={`mt-0.5 text-sm break-all text-slate-900 ${item.style}`}>{item.value}</dd>
              </div>
            ))}
          </dl>

          <label className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600">
              <span>{t.handoff.memo}</span>
              <span className="font-normal text-slate-400">{t.handoff.memoHint}</span>
            </span>
            <input
              value={memo}
              maxLength={VIETQR_MEMO_MAX}
              autoComplete="off"
              onChange={(event) => setMemo(cleanMemoInput(event.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.handoff.payerAppLabel}</span>
            <select
              value={payerApp}
              onChange={(event) => {
                const next = findInstitution(event.target.value);
                if (next && next.kind === "BANK") setPayerApp(next.code);
              }}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:outline-none"
            >
              {PAYER_BANK_APPS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.shortName} · {item.slug}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            <a
              href={deeplink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpenBank}
              className={`${buttonBase} bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-md shadow-[#a50064]/25 hover:brightness-110`}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="text-center">{t.handoff.openBank}</span>
            </a>
            <button
              type="button"
              onClick={handleOpenMomo}
              className={`${buttonBase} border border-pink-200 bg-pink-50 text-[#a50064] hover:bg-pink-100`}
            >
              <Smartphone className="h-4 w-4 shrink-0" />
              <span className="text-center">{t.handoff.openMomo}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`${buttonBase} border border-slate-200 bg-white text-slate-800 hover:bg-slate-100`}
            >
              {copied ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <Copy className="h-4 w-4 shrink-0" />}
              <span className="text-center">{copied ? t.handoff.copied : t.handoff.copyAll}</span>
            </button>
          </div>

          {desktopNote && (
            <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-800">
              {t.handoff.desktopCopied}
            </p>
          )}

          {momoGuideOpen && (
            <div className="rounded-2xl border border-pink-200 bg-pink-50 px-3 py-2.5">
              <p className="text-xs font-bold text-[#a50064]">{t.handoff.momoGuideTitle}</p>
              <ol className="mt-1.5 space-y-1">
                {t.handoff.momoGuide.map((step, index) => (
                  <li key={step} className="flex gap-2 text-[11px] text-slate-700">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white font-mono text-[9px] font-bold text-[#a50064]">
                      {index + 1}
                    </span>
                    <span className="min-w-0">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-1.5 text-[10px] text-slate-500">{t.handoff.momoDesktop}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <button
              type="button"
              disabled={!matrix}
              onClick={handleSavePng}
              className="inline-flex cursor-pointer items-center gap-1 font-semibold text-[#a50064] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {t.handoff.savePng}
            </button>
            <span data-tp-tech="" className="tp-code min-w-0 truncate text-slate-400">
              {deeplink}
            </span>
          </div>

          <details data-tp-tech="" className="group rounded-2xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold text-slate-700">
              <span>
                {t.handoff.emvcoLabel}
                {selfCheck?.ok ? ` · ${t.handoff.crcOk(selfCheck.crc)}` : ""}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 px-3 py-2">
              <p className="tp-code text-[10px] leading-relaxed break-all text-slate-700">{payload}</p>
              {selfCheck?.ok && (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t.handoff.selfCheck}
                </p>
              )}
            </div>
          </details>

          <p className="text-[11px] font-semibold text-amber-700">{t.handoff.realMoneyWarning}</p>
        </div>
      </div>
    </section>
  );
}

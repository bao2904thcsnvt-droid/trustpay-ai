"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, ScanLine, Upload, X, Zap } from "lucide-react";
import { analyzeQrIntegrityFromVideo, type QrIntegrityResult } from "@/lib/cv-forensics";
import { useI18n } from "@/components/i18n/I18nProvider";

interface DetectedBarcodeLike {
  rawValue: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcodeLike[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

type ScannerStatus = "starting" | "scanning" | "denied" | "unsupported" | "insecure";

export interface CameraQrScannerProps {
  /**
   * Đọc được chuỗi QR (từ camera, ảnh chụp hoặc dán tay). Khi quét trực tiếp bằng camera, kèm
   * kết quả đo viền mã (CV Forensics) để cảnh báo tem dán đè.
   */
  onDetected: (raw: string, integrity?: QrIntegrityResult | null) => void;
  onClose: () => void;
}

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

function initialStatus(): ScannerStatus {
  if (typeof window === "undefined") return "starting";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") return "unsupported";
  return "starting";
}

/**
 * Quét mã QR TRỰC TIẾP bằng camera thật: `getUserMedia` (camera sau) +
 * `BarcodeDetector`. Dự phòng: chụp / tải ảnh QR, hoặc dán chuỗi mã.
 * Khung hình chỉ xử lý trong bộ nhớ, dừng camera ngay khi đọc được mã hoặc đóng.
 */
export default function CameraQrScanner({ onDetected, onClose }: CameraQrScannerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [status, setStatus] = useState<ScannerStatus>(initialStatus);
  const [photoError, setPhotoError] = useState(false);
  const [manual, setManual] = useState("");
  // Đèn flash (torch): chỉ bật được khi thiết bị / trình duyệt hỗ trợ.
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (status !== "starting") return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;

    const stop = () => {
      if (timer !== null) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stop();
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        const videoTrack = stream.getVideoTracks()[0] ?? null;
        trackRef.current = videoTrack;
        const capabilities = (videoTrack?.getCapabilities?.() ?? {}) as { torch?: boolean };
        if (capabilities.torch === true) setTorchSupported(true);
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const Detector = getDetectorCtor();
        if (!Detector) {
          setStatus("unsupported");
          return;
        }
        const detector = new Detector({ formats: ["qr_code"] });
        setStatus("scanning");

        const tick = async () => {
          if (cancelled) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const hit = codes.find((code) => code.rawValue);
              if (hit && !cancelled) {
                cancelled = true;
                // Đo viền mã trên đúng khung hình vừa đọc, TRƯỚC khi tắt camera.
                let integrity: QrIntegrityResult | null = null;
                try {
                  integrity = hit.boundingBox ? analyzeQrIntegrityFromVideo(video, hit.boundingBox) : null;
                } catch {
                  integrity = null;
                }
                stop();
                onDetectedRef.current(hit.rawValue, integrity);
                return;
              }
            }
          } catch {
            // Khung hình lỗi tạm thời → thử lại ở nhịp sau.
          }
          timer = window.setTimeout(() => void tick(), 250);
        };
        void tick();
      } catch {
        if (!cancelled) setStatus("denied");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // Chỉ chạy một lần khi mở máy quét.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoError(false);
    const Detector = getDetectorCtor();
    if (!Detector) {
      setPhotoError(true);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await new Detector({ formats: ["qr_code"] }).detect(bitmap);
      bitmap.close();
      const raw = codes.find((code) => code.rawValue)?.rawValue;
      if (raw) {
        onDetectedRef.current(raw);
      } else {
        setPhotoError(true);
      }
    } catch {
      setPhotoError(true);
    }
  };

  const message =
    status === "insecure"
      ? t.camera.insecure
      : status === "denied"
        ? t.camera.denied
        : status === "unsupported"
          ? t.camera.unsupported
          : status === "scanning"
            ? t.camera.scanning
            : t.camera.starting;

  // Cổng ra <body>: các thẻ kính mờ (backdrop-filter) tạo khối chứa cho phần tử `fixed`,
  // nên hộp camera phải nằm ngoài thẻ để luôn phủ đúng toàn màn hình.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-camera-title"
      className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-4"
    >
      <div className="tp-sheet-in w-full max-w-lg overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 text-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 id="tp-camera-title" className="flex items-center gap-2 text-sm font-bold">
            <Camera className="h-4 w-4 text-sky-300" />
            {t.camera.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.camera.close}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mx-4 aspect-square overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
          {/* Khung ngắm phong cách chấm ma trận trắng */}
          <div aria-hidden="true" className="mb-reticle">
            {status === "scanning" && <span className="tp-scan-line absolute right-2 left-2 h-0.5" />}
          </div>
          <p className="absolute inset-x-3 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-semibold">
            {message}
          </p>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-xs text-slate-300">{t.camera.hint}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-xs font-bold hover:bg-white/20"
            >
              <Upload className="h-4 w-4" />
              {t.mob.camera.gallery}
            </button>
            {/* Không đặt `capture` để điện thoại cho chọn ảnh từ thư viện (và vẫn có tùy chọn chụp mới). */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handlePhoto(event)}
            />
            <button
              type="button"
              disabled={!torchSupported}
              aria-pressed={torchOn}
              title={torchSupported ? undefined : t.mob.camera.flashUnavailable}
              onClick={() => void toggleTorch()}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-xs font-bold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Zap className="h-4 w-4" />
              {torchSupported ? (torchOn ? t.mob.camera.flashOff : t.mob.camera.flashOn) : t.mob.camera.flashUnavailable}
            </button>
          </div>
          {photoError && <p className="text-xs font-semibold text-amber-300">{t.camera.photoNoQr}</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const raw = manual.trim();
              if (raw) onDetectedRef.current(raw);
            }}
            className="space-y-2"
          >
            <label htmlFor="tp-camera-manual" className="text-[11px] font-semibold text-slate-300">
              {t.camera.pasteLabel}
            </label>
            <div className="flex gap-2">
              <input
                id="tp-camera-manual"
                value={manual}
                maxLength={512}
                spellCheck={false}
                onChange={(event) => setManual(event.target.value)}
                placeholder="000201…"
                className="tp-code min-w-0 flex-1 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-sky-300 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!manual.trim()}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ScanLine className="h-4 w-4" />
                {t.camera.pasteSubmit}
              </button>
            </div>
          </form>
          <p className="text-[11px] text-slate-400">{t.camera.privacy}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

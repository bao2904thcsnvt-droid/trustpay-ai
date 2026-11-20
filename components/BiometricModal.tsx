"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  X,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import type { VerifyFaceRequest, VerifyFaceResponse } from "@/types/trustpay";

export interface BiometricModalProps {
  isOpen: boolean;
  recipient?: string;
  amount?: number;
  riskScore?: number;
  onClose: () => void;
  onVerified: (result: VerifyFaceResponse) => void;
  onCancelTransaction: () => void;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + "đ";
}

function createDemoFaceBase64(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  }

  // Nền gradient nhẹ nhàng
  const bg = ctx.createLinearGradient(0, 0, 320, 240);
  bg.addColorStop(0, "#fdf2f8");
  bg.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 320, 240);

  // Khung oval nhận diện khuôn mặt Demo
  ctx.fillStyle = "#fce7f3";
  ctx.beginPath();
  ctx.ellipse(160, 118, 56, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#d82d8b";
  ctx.stroke();

  // Mắt và miệng đơn giản để minh họa ảnh chân dung Demo
  ctx.fillStyle = "#334155";
  ctx.beginPath();
  ctx.arc(140, 105, 5, 0, Math.PI * 2);
  ctx.arc(180, 105, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(160, 130, 18, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = "#a50064";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("DEMO BIOMETRIC PROFILE", 160, 218);

  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function BiometricModal({
  isOpen,
  recipient,
  amount,
  riskScore,
  onClose,
  onVerified,
  onCancelTransaction,
}: BiometricModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyFaceResponse | null>(
    null
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const resetModalState = useCallback(() => {
    stopCamera();
    setCameraError(null);
    setCapturedPreview(null);
    setIsVerifying(false);
    setVerifyResult(null);
    setVerifyError(null);
  }, [stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      resetModalState();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, resetModalState, stopCamera]);

  const handleStartCamera = async () => {
    setCameraError(null);
    setVerifyError(null);
    setVerifyResult(null);
    setCapturedPreview(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Trình duyệt không hỗ trợ webcam. Vui lòng dùng nút 'Dùng ảnh khuôn mặt Demo'."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);

      // Gắn stream vào thẻ video sau khi render
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        "Không thể truy cập camera (chưa cấp quyền hoặc không có webcam). Bạn có thể chọn 'Dùng ảnh khuôn mặt Demo'."
      );
      stopCamera();
    }
  };

  const runFaceVerification = async (selfieBase64: string) => {
    setIsVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);

    try {
      const payload: VerifyFaceRequest = { selfieBase64 };
      const response = await fetch("/api/verify-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Lỗi xác thực sinh trắc học (${response.status})`);
      }

      const data = (await response.json()) as VerifyFaceResponse;
      setVerifyResult(data);
    } catch (err) {
      setVerifyError(
        err instanceof Error
          ? err.message
          : "Không thể kết nối máy chủ xác thực khuôn mặt."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCaptureFromWebcam = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 360;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const selfieBase64 = canvas.toDataURL("image/jpeg", 0.85);

    setCapturedPreview(selfieBase64);
    stopCamera();
    await runFaceVerification(selfieBase64);
  };

  const handleUseDemoFace = async () => {
    stopCamera();
    setCameraError(null);
    const demoBase64 = createDemoFaceBase64();
    setCapturedPreview(demoBase64);
    await runFaceVerification(demoBase64);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="biometric-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-pink-200/80 bg-white shadow-2xl shadow-slate-950/30">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
              <ScanFace className="h-6 w-6" />
            </div>
            <div>
              <h2 id="biometric-modal-title" className="text-base font-bold">
                Xác thực Sinh trắc học Khuôn mặt
              </h2>
              <p className="text-xs text-pink-100">
                Bảo vệ giao dịch rủi ro cao • AWS Rekognition
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ xác thực"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Thông tin cảnh báo giao dịch */}
          {(recipient || typeof amount === "number") && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-rose-900">
                  Giao dịch đang bị tạm khóa do phát hiện rủi ro cao
                  {typeof riskScore === "number" ? ` (${riskScore}/100)` : ""}
                </p>
                <p className="mt-0.5 text-rose-800">
                  {typeof amount === "number" && (
                    <span className="font-mono font-bold">
                      {formatVND(amount)}
                    </span>
                  )}
                  {recipient && (
                    <>
                      {" "}
                      → <span className="font-semibold">{recipient}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Khung Camera / Ảnh xem trước */}
          <div className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
            {isCameraActive ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] object-cover"
                />
                {/* Khung ngắm khuôn mặt */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <div className="h-48 w-36 rounded-full border-2 border-dashed border-pink-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
                </div>
              </>
            ) : capturedPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={capturedPreview}
                alt="Ảnh khuôn mặt xác thực"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center px-6 text-center text-slate-300">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-pink-300">
                  <ScanFace className="h-9 w-9" />
                </div>
                <p className="text-sm font-semibold text-white">
                  Sẵn sàng quét khuôn mặt chính chủ
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Bật webcam thật để chụp ảnh hoặc dùng ảnh khuôn mặt Demo nếu
                  thiết bị không có camera.
                </p>
              </div>
            )}

            {/* Lớp phủ loading khi đang đối chiếu */}
            {isVerifying && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 text-white backdrop-blur-xs">
                <Loader2 className="h-9 w-9 animate-spin text-pink-400" />
                <p className="mt-3 text-sm font-semibold">
                  Đang đối chiếu sinh trắc học...
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Amazon Rekognition CompareFaces
                </p>
              </div>
            )}
          </div>

          {/* Lỗi camera hoặc lỗi API */}
          {(cameraError || verifyError) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
              {cameraError || verifyError}
            </div>
          )}

          {/* Kết quả khớp khuôn mặt */}
          {verifyResult && (
            <div
              className={`rounded-2xl border p-4 ${
                verifyResult.matched
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-rose-200 bg-rose-50/80"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {verifyResult.matched ? (
                    <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-6 w-6 shrink-0 text-rose-600" />
                  )}
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        verifyResult.matched
                          ? "text-emerald-900"
                          : "text-rose-900"
                      }`}
                    >
                      {verifyResult.matched
                        ? "Xác thực khuôn mặt thành công"
                        : "Khuôn mặt không trùng khớp"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {verifyResult.message}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-right shadow-2xs ring-1 ring-slate-200/70">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">
                    Độ khớp
                  </p>
                  <p
                    className={`font-mono text-lg font-extrabold ${
                      verifyResult.matched
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {verifyResult.similarity}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Nút điều khiển */}
          {!verifyResult ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {isCameraActive ? (
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => void handleCaptureFromWebcam()}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  <span>Chụp &amp; Xác thực ngay</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => void handleStartCamera()}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm font-bold text-[#a50064] transition-all hover:border-[#d82d8b] hover:bg-pink-100 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  <span>Bật Webcam thật</span>
                </button>
              )}

              <button
                type="button"
                disabled={isVerifying}
                onClick={() => void handleUseDemoFace()}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3 text-sm font-bold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                <span>Dùng ảnh khuôn mặt Demo</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  resetModalState();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Quét lại</span>
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onCancelTransaction}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 sm:text-sm"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Hủy giao dịch</span>
                </button>

                {verifyResult.matched && (
                  <button
                    type="button"
                    onClick={() => onVerified(verifyResult)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all hover:brightness-110 sm:text-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Mở khóa giao dịch</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

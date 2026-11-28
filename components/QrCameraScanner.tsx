"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, CameraOff, LoaderCircle, RefreshCw, ScanLine, Upload, X, Zap } from "lucide-react";
import type { Options as JsQrOptions, QRCode } from "jsqr";
import { analyzeQrIntegrityFromVideo, type QrBox, type QrIntegrityResult } from "@/lib/cv-forensics";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Máy quét QR đa nền tảng cho mọi điện thoại:
 * - Chrome / Edge / Samsung Internet (Android), Chrome macOS: `BarcodeDetector` gốc của trình duyệt.
 * - iPhone Safari, Firefox, Chrome Windows (không có BarcodeDetector), hoặc khi BarcodeDetector lỗi /
 *   im lặng quá ~2 giây: nạp lười `jsqr` (chỉ tải khi cần) và giải mã khung hình trên canvas ẩn.
 * - Dự phòng: chọn ảnh QR từ thư viện (ảnh chụp màn hình Zalo / Messenger) hoặc dán chuỗi mã.
 *
 * Quyền riêng tư (NĐ 13/2023): khung hình chỉ xử lý trong RAM trên máy, không lưu, không gửi đi và
 * không ghi log nội dung mã. Camera tắt ngay khi đọc được mã, khi đóng hoặc khi gỡ component.
 */

// ------------------------------------------------------------------ Hợp đồng công khai

export type QrDecodeEngine = "barcode-detector" | "jsqr";
export type QrDecodeSource = "camera" | "gallery";

/** Số liệu một lần giải mã thành công (không chứa nội dung mã). */
export interface QrDecodeStats {
  engine: QrDecodeEngine;
  source: QrDecodeSource;
  /** Camera: thời gian giải mã khung hình trúng. Ảnh: từ lúc đọc tệp tới khi ra mã (ms). */
  decodeMs: number;
}

export interface CameraQrScannerProps {
  /**
   * Đọc được chuỗi QR (từ camera, ảnh chụp hoặc dán tay). Khi quét trực tiếp bằng camera, kèm
   * kết quả đo viền mã (CV Forensics) để cảnh báo tem dán đè.
   */
  onDetected: (raw: string, integrity?: QrIntegrityResult | null) => void;
  onClose: () => void;
  /** Tùy chọn: bộ giải mã đã dùng, nguồn ảnh và thời gian giải mã (phục vụ đo hiệu năng). */
  onDecodeStats?: (stats: QrDecodeStats) => void;
}

// ------------------------------------------------- Kiểu cho API thử nghiệm / ngoài lib.dom

interface DetectedBarcodeLike {
  rawValue: string;
  boundingBox?: QrBox;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcodeLike[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Thuộc tính camera ngoài chuẩn lib.dom (MediaStream Image Capture): đèn flash & lấy nét. */
interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  focusMode?: string[];
}
interface CameraConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  focusMode?: string;
}

type JsQrDecoder = (data: Uint8ClampedArray, width: number, height: number, options?: JsQrOptions) => QRCode | null;

type ScannerStatus =
  | "starting"
  | "scanning"
  | "detected"
  | "insecure"
  | "no-camera"
  | "denied"
  | "not-found"
  | "in-use"
  | "failed"
  | "decoder-failed";

type EngineMode = "native" | "jsqr" | "hybrid";
type PhotoIssue = "no-qr" | "heic" | "unreadable" | "decoder";

interface DeviceEnvironment {
  platform: "ios" | "android" | "other";
  /** Trình duyệt nhúng trong ứng dụng (Zalo, Facebook, Messenger…) — thường chặn camera. */
  inApp: boolean;
}

// ------------------------------------------------------------------------ Hằng số

/** Nhịp giải mã ≈ 8–10 khung/giây: đủ nhanh để "đưa vào là đọc", không làm nóng máy. */
const FRAME_INTERVAL_MS = 100;
/** Luôn chừa tối thiểu chừng này giữa hai lượt giải mã để luồng chính kịp vẽ giao diện. */
const MIN_IDLE_GAP_MS = 30;
/** requestVideoFrameCallback không gọi lại (video đứng hình) → vẫn quét bằng setTimeout. */
const FRAME_WATCHDOG_MS = 400;
/** BarcodeDetector im lặng quá ~2 giây → nạp thêm jsQR và giải mã xen kẽ hai bộ. */
const NATIVE_GRACE_MS = 2000;
/** Số lần BarcodeDetector lỗi liên tiếp trước khi bỏ hẳn, chỉ dùng jsQR. */
const NATIVE_MAX_ERRORS = 3;
/** Tải chunk jsQR lỗi (mất mạng) → chờ chừng này mới thử tải lại, tránh dội yêu cầu mỗi khung. */
const JSQR_RETRY_MS = 5000;
/** Cạnh dài tối đa của khung hình camera đưa vào jsQR. */
const LIVE_MAX_EDGE = 720;
/** Cứ mỗi N lượt jsQR thử thêm mã đảo màu (QR sáng trên nền tối, giao diện tối). */
const INVERT_EVERY = 4;
/** Ảnh thư viện: cạnh dài ảnh gốc (giới hạn 1600 px) → 1024 → 640 px. */
const GALLERY_EDGES = [1600, 1024, 640] as const;
/** Chrome Android có thể báo khả năng `torch` muộn → hỏi lại một lần sau chừng này. */
const TORCH_RECHECK_MS = 1000;
const HAPTIC_MS = 80;

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

const CAMERA_ERRORS: ReadonlySet<ScannerStatus> = new Set<ScannerStatus>([
  "insecure",
  "no-camera",
  "denied",
  "not-found",
  "in-use",
  "failed",
  "decoder-failed",
]);
const RETRYABLE: ReadonlySet<ScannerStatus> = new Set<ScannerStatus>([
  "denied",
  "not-found",
  "in-use",
  "failed",
  "decoder-failed",
]);

// ------------------------------------------------------------------- Môi trường

function initialStatus(): ScannerStatus {
  if (typeof window === "undefined") return "starting";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") return "no-camera";
  return "starting";
}

function detectEnvironment(): DeviceEnvironment {
  if (typeof navigator === "undefined") return { platform: "other", inApp: false };
  const ua = navigator.userAgent;
  // iPadOS 13+ tự nhận là "Macintosh" nhưng có màn hình cảm ứng.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return {
    platform: ios ? "ios" : /Android/i.test(ua) ? "android" : "other",
    inApp: /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\//i.test(ua),
  };
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
    ? error.name
    : "";
}

function classifyCameraError(error: unknown): ScannerStatus {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "not-found";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in-use";
    default:
      return "failed";
  }
}

/** Camera sau, ~720p; camera không đáp ứng ràng buộc (máy cũ, webcam lạ) → thử lại không ràng buộc. */
async function openCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (error) {
    const name = errorName(error);
    if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") throw error;
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
  }
}

// --------------------------------------------------------------------- Bộ giải mã

let nativeDetectorPromise: Promise<BarcodeDetectorLike | null> | null = null;
let jsQrPromise: Promise<JsQrDecoder> | null = null;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/** BarcodeDetector gốc, chỉ khi trình duyệt thật sự hỗ trợ định dạng "qr_code". */
function getNativeDetector(): Promise<BarcodeDetectorLike | null> {
  if (!nativeDetectorPromise) {
    nativeDetectorPromise = (async () => {
      const Detector = getDetectorCtor();
      if (!Detector) return null;
      try {
        if (typeof Detector.getSupportedFormats === "function") {
          const formats = await Detector.getSupportedFormats();
          if (!formats.includes("qr_code")) return null;
        }
        return new Detector({ formats: ["qr_code"] });
      } catch {
        return null;
      }
    })();
  }
  return nativeDetectorPromise;
}

/** Lấy hàm jsQR bất kể kiểu đóng gói CJS/ESM bundler trả về (`fn`, `{ default: fn }`, lồng 2 lớp). */
function pickJsQr(mod: unknown): JsQrDecoder | null {
  let candidate = mod;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof candidate === "function") return candidate as JsQrDecoder;
    if (typeof candidate !== "object" || candidate === null || !("default" in candidate)) return null;
    candidate = candidate.default;
  }
  return null;
}

/** Nạp lười jsQR — chỉ tải chunk khi thật sự cần; lỗi mạng → cho phép tải lại ở lần sau. */
function loadJsQr(): Promise<JsQrDecoder> {
  if (!jsQrPromise) {
    jsQrPromise = import("jsqr")
      .then((mod) => {
        const decoder = pickJsQr(mod);
        if (!decoder) throw new Error("jsQR export không hợp lệ");
        return decoder;
      })
      .catch((error: unknown) => {
        jsQrPromise = null;
        throw error;
      });
  }
  return jsQrPromise;
}

// ------------------------------------------------------------------- Hình học khung

interface FrameWindow {
  sx: number;
  sy: number;
  /** Cạnh ô vuông nguồn (px khung hình gốc). */
  side: number;
  /** Cạnh ô vuông đưa vào jsQR (≤ LIVE_MAX_EDGE). */
  size: number;
  scale: number;
}

/**
 * Vùng giải mã = ô vuông giữa khung hình — đúng phần người dùng nhìn thấy (video `object-cover`
 * trong khung vuông) — thu nhỏ để cạnh dài ≤ 720 px.
 */
function liveWindow(videoWidth: number, videoHeight: number): FrameWindow {
  const side = Math.min(videoWidth, videoHeight);
  const scale = Math.min(1, LIVE_MAX_EDGE / side);
  return {
    sx: Math.floor((videoWidth - side) / 2),
    sy: Math.floor((videoHeight - side) / 2),
    side,
    size: Math.max(1, Math.round(side * scale)),
    scale,
  };
}

/** Khung bao 4 góc mã do jsQR trả về, quy đổi về tọa độ khung hình gốc của <video>. */
function boxFromLocation(location: QRCode["location"], win: FrameWindow): QrBox {
  const corners = [location.topLeftCorner, location.topRightCorner, location.bottomRightCorner, location.bottomLeftCorner];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: win.sx + minX / win.scale,
    y: win.sy + minY / win.scale,
    width: (Math.max(...xs) - minX) / win.scale,
    height: (Math.max(...ys) - minY) / win.scale,
  };
}

/** Các cạnh dài cần thử cho ảnh thư viện, không phóng to ảnh nhỏ. */
function galleryEdges(longEdge: number): number[] {
  const edges: number[] = [];
  for (const edge of [Math.min(longEdge, GALLERY_EDGES[0]), ...GALLERY_EDGES.slice(1)]) {
    if (edge > 0 && edge <= longEdge && !edges.includes(edge)) edges.push(edge);
  }
  return edges;
}

// -------------------------------------------------------------------- Ảnh thư viện

interface LoadedImage {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  release: () => void;
}

type GalleryOutcome =
  | { kind: "hit"; raw: string; engine: QrDecodeEngine }
  | { kind: "no-qr" | "unreadable" | "decoder" };

function isHeicFile(file: File): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** createImageBitmap (nhanh, không chặn luồng chính) → dự phòng <img> cho Safari cũ. */
async function loadImageFile(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      }
      bitmap.close();
    } catch {
      // Safari cũ / định dạng lạ → thử qua <img>.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (image.naturalWidth === 0 || image.naturalHeight === 0) throw new Error("Ảnh rỗng");
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/** BarcodeDetector trên ảnh gốc → jsQR ở nhiều tỉ lệ (ảnh chụp màn hình Zalo / Messenger). */
async function decodeGalleryFile(file: File): Promise<GalleryOutcome> {
  let image: LoadedImage;
  try {
    image = await loadImageFile(file);
  } catch {
    return { kind: "unreadable" };
  }
  try {
    const detector = await getNativeDetector();
    if (detector) {
      try {
        const hit = (await detector.detect(image.source)).find((code) => code.rawValue);
        if (hit) return { kind: "hit", raw: hit.rawValue, engine: "barcode-detector" };
      } catch {
        // BarcodeDetector lỗi trên ảnh này → thử jsQR.
      }
    }
    let decode: JsQrDecoder;
    try {
      decode = await loadJsQr();
    } catch {
      return { kind: "decoder" };
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { kind: "decoder" };
    const longEdge = Math.max(image.width, image.height);
    for (const edge of galleryEdges(longEdge)) {
      const scale = edge / longEdge;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      canvas.width = width;
      canvas.height = height;
      // Nền trắng: PNG trong suốt (mã QR tải về) không bị đọc thành ô tối.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image.source, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      const code = decode(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
      if (code && code.data) return { kind: "hit", raw: code.data, engine: "jsqr" };
      await nextTask(); // nhường luồng chính giữa các tỉ lệ để giao diện không đơ
    }
    return { kind: "no-qr" };
  } finally {
    image.release();
  }
}

// ------------------------------------------------------------------------ Tiện ích

function measureMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

/** Rung nhẹ báo đã đọc được mã (iOS Safari không có `navigator.vibrate`). */
function haptic(): void {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(HAPTIC_MS);
  } catch {
    // Trình duyệt chặn rung → bỏ qua.
  }
}

/** Số liệu đo không được phép chặn luồng chính nếu màn cha ném lỗi. */
function emitStats(callback: ((stats: QrDecodeStats) => void) | undefined, stats: QrDecodeStats): void {
  if (!callback) return;
  try {
    callback(stats);
  } catch {
    // Bỏ qua lỗi của bộ thu số liệu.
  }
}

function readCapabilities(track: MediaStreamTrack): CameraCapabilities {
  try {
    return typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------------ Component

/**
 * Hộp quét QR (cổng ra <body>, `role="dialog"`, Esc để đóng). Giữ nguyên hợp đồng của
 * `components/payments/CameraQrScanner` (đường dẫn cũ chỉ còn re-export).
 */
export default function QrCameraScanner({ onDetected, onClose, onDecodeStats }: CameraQrScannerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onDecodeStatsRef = useRef(onDecodeStats);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const torchOnRef = useRef(false);
  /** Đã trả kết quả cho màn cha → camera / ảnh không gọi `onDetected` thêm lần nữa. */
  const detectedRef = useRef(false);
  /** Đang giải mã ảnh thư viện → vòng quét camera tạm nhường CPU. */
  const galleryBusyRef = useRef(false);
  /** Dừng hẳn phiên camera hiện tại (effect gán lại cho từng phiên). */
  const haltCameraRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<ScannerStatus>(initialStatus);
  /** Tăng lên để mở lại camera (nút Thử lại, hoặc iOS tắt camera khi chạy nền). */
  const [session, setSession] = useState(0);
  const [engineMode, setEngineMode] = useState<EngineMode | null>(null);
  const [env] = useState<DeviceEnvironment>(detectEnvironment);
  const [photoIssue, setPhotoIssue] = useState<PhotoIssue | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [manual, setManual] = useState("");
  // Đèn flash (torch): chỉ bật được khi thiết bị / trình duyệt hỗ trợ.
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onDecodeStatsRef.current = onDecodeStats;
  }, [onDetected, onDecodeStats]);

  useEffect(() => {
    if (initialStatus() !== "starting") return;
    const node = videoRef.current;
    if (!node) return;
    const video: HTMLVideoElement = node;
    video.muted = true;

    let disposed = false;
    let finished = false;
    let paused = document.visibilityState === "hidden";
    let stream: MediaStream | null = null;
    let track: MediaStreamTrack | null = null;
    let timer: number | null = null;
    let watchdog: number | null = null;
    let frameHandle: number | null = null;
    let torchTimer: number | null = null;
    let busy = false;
    let lastStartedAt = 0;
    let detector: BarcodeDetectorLike | null = null;
    let nativeBroken = false;
    let nativeErrors = 0;
    let nativeSince: number | null = null;
    let decodeJs: JsQrDecoder | null = null;
    let jsLoading = false;
    let jsRetryAt = 0;
    let turn = 0;
    let jsRuns = 0;
    // Canvas ẩn (không gắn vào DOM) cho jsQR; CPU-backed để getImageData nhanh.
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const alive = () => !disposed && !finished;

    function publishEngine(): void {
      if (disposed) return;
      const native = detector !== null && !nativeBroken;
      setEngineMode(native && decodeJs ? "hybrid" : native ? "native" : decodeJs ? "jsqr" : null);
    }

    function cancelPending(): void {
      if (timer !== null) window.clearTimeout(timer);
      if (watchdog !== null) window.clearTimeout(watchdog);
      if (frameHandle !== null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameHandle);
      }
      timer = null;
      watchdog = null;
      frameHandle = null;
    }

    function resetTorchUi(): void {
      torchOnRef.current = false;
      setTorchOn(false);
      setTorchSupported(false);
    }

    function releaseCamera(): void {
      cancelPending();
      track?.removeEventListener("ended", handleTrackEnded);
      stream?.getTracks().forEach((item) => item.stop());
      stream = null;
      track = null;
      trackRef.current = null;
      torchOnRef.current = false;
      if (video.srcObject) video.srcObject = null;
    }

    /** Nhịp ~8–10 khung/giây: rVFC (khung hình MỚI) nếu có, không thì setTimeout. */
    function scheduleNext(): void {
      if (!alive() || paused || stream === null) return;
      cancelPending();
      const wait = Math.max(MIN_IDLE_GAP_MS, FRAME_INTERVAL_MS - (performance.now() - lastStartedAt));
      timer = window.setTimeout(() => {
        timer = null;
        if (typeof video.requestVideoFrameCallback !== "function") {
          void tick();
          return;
        }
        let fired = false;
        const run = () => {
          if (fired) return;
          fired = true;
          cancelPending();
          void tick();
        };
        frameHandle = video.requestVideoFrameCallback(run);
        watchdog = window.setTimeout(run, FRAME_WATCHDOG_MS);
      }, wait);
    }

    function ensureJsQr(force = false): void {
      if (decodeJs !== null || jsLoading || disposed) return;
      if (!force && performance.now() < jsRetryAt) return;
      jsLoading = true;
      loadJsQr()
        .then((decoder) => {
          if (disposed) return;
          decodeJs = decoder;
          publishEngine();
        })
        .catch(() => {
          jsRetryAt = performance.now() + JSQR_RETRY_MS;
          // Camera đang chạy mà không còn bộ giải mã nào → tắt camera, báo lỗi kèm nút Thử lại.
          // (Camera chưa mở → `start()` sẽ thử tải lại khi mở xong.)
          if (!alive() || stream === null || (detector !== null && !nativeBroken)) return;
          releaseCamera();
          resetTorchUi();
          setStatus("decoder-failed");
        })
        .finally(() => {
          jsLoading = false;
        });
    }

    function complete(raw: string, engine: QrDecodeEngine, box: QrBox | null, startedAt: number): void {
      if (!alive() || detectedRef.current) return;
      finished = true;
      detectedRef.current = true;
      const decodeMs = measureMs(startedAt);
      haptic();
      emitStats(onDecodeStatsRef.current, { engine, source: "camera", decodeMs });
      // Đo viền mã trên khung hình vừa đọc, TRƯỚC khi tắt camera (CV Forensics như bản cũ).
      let integrity: QrIntegrityResult | null = null;
      try {
        integrity = box ? analyzeQrIntegrityFromVideo(video, box) : null;
      } catch {
        integrity = null;
      }
      releaseCamera();
      setStatus("detected");
      onDetectedRef.current(raw, integrity);
    }

    async function tick(): Promise<void> {
      if (!alive() || paused || busy) return;
      // readyState ≥ 2 (HAVE_CURRENT_DATA): đã có khung hình để đọc.
      if (galleryBusyRef.current || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        lastStartedAt = performance.now();
        scheduleNext();
        return;
      }
      busy = true;
      const startedAt = performance.now();
      lastStartedAt = startedAt;
      const native = nativeBroken ? null : detector;
      // Khi có cả hai bộ: xen kẽ BarcodeDetector / jsQR từng khung.
      const useNative = native !== null && (decodeJs === null || turn % 2 === 0);
      turn += 1;
      let found: { raw: string; engine: QrDecodeEngine; box: QrBox | null } | null = null;
      try {
        if (native !== null && useNative) {
          const since = nativeSince ?? startedAt;
          nativeSince = since;
          const hit = (await native.detect(video)).find((code) => code.rawValue);
          nativeErrors = 0;
          if (hit) {
            found = { raw: hit.rawValue, engine: "barcode-detector", box: hit.boundingBox ?? null };
          } else if (decodeJs === null && performance.now() - since >= NATIVE_GRACE_MS) {
            ensureJsQr();
          }
        } else if (decodeJs !== null && ctx !== null) {
          const win = liveWindow(video.videoWidth, video.videoHeight);
          if (canvas.width !== win.size || canvas.height !== win.size) {
            canvas.width = win.size;
            canvas.height = win.size;
          }
          ctx.drawImage(video, win.sx, win.sy, win.side, win.side, 0, 0, win.size, win.size);
          const frame = ctx.getImageData(0, 0, win.size, win.size);
          jsRuns += 1;
          const code = decodeJs(frame.data, win.size, win.size, {
            inversionAttempts: jsRuns % INVERT_EVERY === 0 ? "attemptBoth" : "dontInvert",
          });
          if (code && code.data) found = { raw: code.data, engine: "jsqr", box: boxFromLocation(code.location, win) };
        } else {
          // Chưa có bộ giải mã nào (jsQR đang tải / lần tải trước lỗi) → thử nạp, chờ nhịp sau.
          ensureJsQr();
        }
      } catch {
        if (useNative) {
          // BarcodeDetector lỗi (thiếu dịch vụ nhận diện trên máy…) → nạp jsQR ngay.
          nativeErrors += 1;
          ensureJsQr();
          if (nativeErrors >= NATIVE_MAX_ERRORS) {
            nativeBroken = true;
            publishEngine();
          }
        }
        // jsQR lỗi trên một khung hình → thử lại ở nhịp sau.
      } finally {
        busy = false;
      }
      if (found !== null) {
        complete(found.raw, found.engine, found.box, startedAt);
        return;
      }
      scheduleNext();
    }

    function handleTrackEnded(): void {
      if (!alive()) return;
      cancelPending();
      resetTorchUi();
      // Đang chạy nền (iOS tự tắt camera) → mở lại khi người dùng quay về.
      if (document.visibilityState === "hidden") return;
      releaseCamera();
      setStatus("in-use");
    }

    async function tuneTrack(target: MediaStreamTrack): Promise<void> {
      const capabilities = readCapabilities(target);
      if (capabilities.torch === true) {
        setTorchSupported(true);
      } else {
        torchTimer = window.setTimeout(() => {
          torchTimer = null;
          if (alive() && track === target && target.readyState === "live" && readCapabilities(target).torch === true) {
            setTorchSupported(true);
          }
        }, TORCH_RECHECK_MS);
      }
      // Lấy nét liên tục để đọc mã ở gần; thuộc tính ngoài chuẩn → bỏ qua nếu bị từ chối.
      if (capabilities.focusMode && !capabilities.focusMode.includes("continuous")) return;
      try {
        const focus: CameraConstraintSet = { focusMode: "continuous" };
        await target.applyConstraints({ advanced: [focus] });
      } catch {
        // Thiết bị / trình duyệt không hỗ trợ focusMode.
      }
    }

    function pauseCapture(): void {
      cancelPending();
      const live = track;
      if (live && live.readyState === "live") {
        if (torchOnRef.current) {
          const off: CameraConstraintSet = { torch: false };
          void live.applyConstraints({ advanced: [off] }).catch(() => undefined);
          torchOnRef.current = false;
          setTorchOn(false);
        }
        // Ngưng luồng hình khi chạy nền (không xử lý khung nào); bật lại không cần xin quyền.
        live.enabled = false;
      }
      video.pause();
    }

    function restartSession(): void {
      releaseCamera();
      resetTorchUi();
      setEngineMode(null);
      setStatus("starting");
      setSession((value) => value + 1);
    }

    function resumeCapture(): void {
      if (stream === null) return; // chưa mở được camera (đang xin quyền / đã lỗi) → giữ nguyên
      const live = track;
      if (live === null || live.readyState === "ended") {
        restartSession();
        return;
      }
      live.enabled = true;
      void video.play().catch(() => undefined);
      nativeSince = null;
      scheduleNext();
    }

    function handleVisibility(): void {
      if (!alive()) return;
      if (document.visibilityState === "hidden") {
        paused = true;
        pauseCapture();
      } else if (paused) {
        paused = false;
        resumeCapture();
      }
    }

    async function start(): Promise<void> {
      // Chuẩn bị bộ giải mã song song với hộp thoại xin quyền camera.
      const nativeReady = getNativeDetector();
      if (getDetectorCtor() === null) ensureJsQr(); // iPhone Safari / Firefox: cần jsQR ngay
      let opened: MediaStream;
      try {
        opened = await openCameraStream();
      } catch (error) {
        if (alive()) setStatus(classifyCameraError(error));
        return;
      }
      if (!alive()) {
        opened.getTracks().forEach((item) => item.stop());
        return;
      }
      stream = opened;
      track = opened.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      track?.addEventListener("ended", handleTrackEnded);
      video.srcObject = opened;
      try {
        await video.play();
      } catch {
        // iOS: `autoPlay muted playsInline` vẫn tự phát khi có khung hình đầu tiên.
      }
      // `stream === null`: camera đã bị nhả trong lúc chờ (vd tải jsQR lỗi → "decoder-failed",
      // track bị ngắt → "in-use") — giữ nguyên trạng thái lỗi đó, không ghi đè thành "scanning".
      if (!alive() || stream === null) return;
      if (track) void tuneTrack(track);
      detector = await nativeReady;
      if (!alive() || stream === null) return;
      // Không có BarcodeDetector / không hỗ trợ "qr_code" → bắt buộc có jsQR (thử lại ngay nếu lần
      // nạp sớm lúc xin quyền đã lỗi).
      if (detector === null) ensureJsQr(true);
      publishEngine();
      setStatus("scanning");
      if (paused) pauseCapture();
      else scheduleNext();
    }

    haltCameraRef.current = () => {
      finished = true;
      releaseCamera();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    void start();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (torchTimer !== null) window.clearTimeout(torchTimer);
      releaseCamera();
      haltCameraRef.current = () => undefined;
    };
  }, [session]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      haltCameraRef.current();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const close = () => {
    haltCameraRef.current();
    onClose();
  };

  const retryCamera = () => {
    torchOnRef.current = false;
    setTorchOn(false);
    setTorchSupported(false);
    setEngineMode(null);
    setStatus(initialStatus());
    setSession((value) => value + 1);
  };

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track || track.readyState !== "live") return;
    const next = !torchOnRef.current;
    try {
      const torch: CameraConstraintSet = { torch: next };
      await track.applyConstraints({ advanced: [torch] });
      torchOnRef.current = next;
      setTorchOn(next);
    } catch {
      torchOnRef.current = false;
      setTorchOn(false);
      setTorchSupported(false);
    }
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || detectedRef.current) return;
    setPhotoIssue(null);
    setPhotoBusy(true);
    galleryBusyRef.current = true;
    const startedAt = performance.now();
    try {
      const outcome = await decodeGalleryFile(file);
      if (detectedRef.current) return; // camera đã đọc được mã trong lúc chờ
      if (outcome.kind !== "hit") {
        setPhotoIssue(outcome.kind === "unreadable" && isHeicFile(file) ? "heic" : outcome.kind);
        return;
      }
      detectedRef.current = true;
      const decodeMs = measureMs(startedAt);
      haptic();
      emitStats(onDecodeStatsRef.current, { engine: outcome.engine, source: "gallery", decodeMs });
      haltCameraRef.current();
      setStatus("detected");
      onDetectedRef.current(outcome.raw);
    } catch {
      setPhotoIssue(isHeicFile(file) ? "heic" : "unreadable");
    } finally {
      galleryBusyRef.current = false;
      setPhotoBusy(false);
    }
  };

  if (typeof document === "undefined") return null;

  const deniedText = env.inApp
    ? t.scanner.inAppBrowser
    : env.platform === "ios"
      ? t.scanner.deniedIos
      : env.platform === "android"
        ? t.scanner.deniedAndroid
        : t.scanner.deniedOther;
  const statusText: Record<ScannerStatus, string> = {
    starting: t.camera.starting,
    scanning: engineMode === null ? t.scanner.loadingDecoder : t.camera.scanning,
    detected: t.camera.detected,
    insecure: t.camera.insecure,
    "no-camera": env.inApp ? t.scanner.inAppBrowser : t.scanner.noCamera,
    denied: deniedText,
    "not-found": t.scanner.notFound,
    "in-use": t.scanner.inUse,
    failed: env.inApp ? t.scanner.inAppBrowser : t.camera.denied,
    "decoder-failed": t.scanner.decoderFailed,
  };
  const message = statusText[status];
  const cameraError = CAMERA_ERRORS.has(status);
  const engineText =
    engineMode === "hybrid"
      ? t.scanner.engineHybrid
      : engineMode === "native"
        ? t.scanner.engineNative
        : engineMode === "jsqr"
          ? t.scanner.engineJsqr
          : null;
  const photoText =
    photoIssue === "heic"
      ? t.scanner.photoHeic
      : photoIssue === "unreadable"
        ? t.scanner.photoUnreadable
        : photoIssue === "decoder"
          ? t.scanner.decoderFailed
          : null;

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
            onClick={close}
            aria-label={t.camera.close}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mx-4 aspect-square overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
          {cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">
              <CameraOff aria-hidden="true" className="h-8 w-8 text-slate-400" />
              <p role="status" aria-live="polite" className="text-xs leading-relaxed font-semibold">
                {message}
              </p>
              <p className="text-[11px] text-slate-300">{t.scanner.fallbackHint}</p>
              {RETRYABLE.has(status) && (
                <button
                  type="button"
                  onClick={retryCamera}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5 text-xs font-bold hover:bg-white/25"
                >
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                  {t.scanner.retry}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Khung ngắm phong cách chấm ma trận trắng */}
              <div aria-hidden="true" className="mb-reticle">
                {status === "scanning" && <span className="tp-scan-line absolute right-2 left-2 h-0.5" />}
              </div>
              {status === "scanning" && engineText && (
                <span className="absolute top-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-slate-200">
                  {t.scanner.engine(engineText)}
                </span>
              )}
              <p
                role="status"
                aria-live="polite"
                className="absolute inset-x-3 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-semibold"
              >
                {message}
              </p>
            </>
          )}
        </div>

        <div className="space-y-3 p-4">
          <p className="text-xs text-slate-300">{t.camera.hint}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              aria-busy={photoBusy}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-xs font-bold hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
            >
              {photoBusy ? (
                <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {photoBusy ? t.scanner.photoReading : t.mob.camera.gallery}
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
          {photoIssue === "no-qr" && (
            <p role="status" aria-live="polite" className="text-xs text-amber-300">
              <span className="font-semibold">{t.camera.photoNoQr}</span> {t.scanner.photoTip}
            </p>
          )}
          {photoText && (
            <p role="status" aria-live="polite" className="text-xs font-semibold text-amber-300">
              {photoText}
            </p>
          )}
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
                autoComplete="off"
                autoCapitalize="off"
                onChange={(event) => setManual(event.target.value)}
                placeholder="000201…"
                className="tp-code min-h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-sky-300 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!manual.trim()}
                className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
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

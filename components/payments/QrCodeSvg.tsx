"use client";

import { useMemo } from "react";
import { encodeQrText, qrSvgPath, type QrMatrix } from "@/lib/qr/qr-matrix";

export interface QrCodeSvgProps {
  value: string;
  /** Kích thước hiển thị (px). */
  size?: number;
  title: string;
  className?: string;
}

const QUIET_ZONE = 4;

export function useQrMatrix(value: string): QrMatrix | null {
  return useMemo(() => {
    try {
      return value ? encodeQrText(value, "M") : null;
    } catch {
      return null;
    }
  }, [value]);
}

/**
 * Vẽ mã QR ngay trên máy (SVG). Màu nền/ô dùng thuộc tính SVG & style nội tuyến
 * — không phụ thuộc lớp Tailwind — để Dark mode không đảo màu, máy quét luôn đọc được.
 */
export default function QrCodeSvg({ value, size = 220, title, className = "" }: QrCodeSvgProps) {
  const matrix = useQrMatrix(value);
  if (!matrix) {
    return null;
  }
  const dimension = matrix.size + QUIET_ZONE * 2;
  return (
    <svg
      role="img"
      aria-label={title}
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
      className={className}
      style={{ backgroundColor: "#ffffff", display: "block" }}
    >
      <title>{title}</title>
      <rect width={dimension} height={dimension} fill="#ffffff" />
      <path d={qrSvgPath(matrix, QUIET_ZONE)} fill="#000000" />
    </svg>
  );
}

/**
 * Vẽ mã QR lên canvas nền trắng (kèm vùng lề yên tĩnh) và — nếu có — vài dòng chú thích bên dưới
 * (ngân hàng, STK đã che, số tiền) để người dùng tự đối chiếu khi mở ảnh trong app ngân hàng.
 */
function renderQrCanvas(matrix: QrMatrix, scale: number, caption: readonly string[] = []): HTMLCanvasElement | null {
  const dimension = (matrix.size + QUIET_ZONE * 2) * scale;
  const lineHeight = Math.round(scale * 2.6);
  const captionHeight = caption.length > 0 ? caption.length * lineHeight + scale * 2 : 0;
  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension + captionHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        context.fillRect((x + QUIET_ZONE) * scale, (y + QUIET_ZONE) * scale, scale, scale);
      }
    }
  }
  if (caption.length > 0) {
    context.fillStyle = "#0f172a";
    context.textAlign = "center";
    context.textBaseline = "top";
    caption.forEach((line, index) => {
      context.font = `${index === 0 ? "700" : "500"} ${Math.round(scale * 1.7)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      context.fillText(line, dimension / 2, dimension - scale + index * lineHeight, dimension - scale * 2);
    });
  }
  return canvas;
}

/** dataURL → Blob đồng bộ (giữ nguyên "cử chỉ người dùng" để gọi Web Share trên iOS Safari). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",", 2);
  const mime = /data:([^;]+);/.exec(header)?.[1] ?? "image/png";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Xuất ảnh PNG (để chọn từ thư viện trong app ngân hàng). Trả về false nếu trình duyệt không hỗ trợ. */
export function downloadQrPng(matrix: QrMatrix, filename: string, scale = 10): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const canvas = renderQrCanvas(matrix, scale);
  if (!canvas) {
    return false;
  }
  triggerDownload(canvas.toDataURL("image/png"), filename);
  return true;
}

export type QrImageSaveResult = "shared" | "downloaded" | "cancelled" | "failed";

/**
 * "Tải ảnh mã QR xuống máy": trên điện thoại mở bảng chia sẻ của hệ điều hành (iPhone → "Lưu hình
 * ảnh" vào thư viện Ảnh, Android → Lưu / gửi Zalo) bằng Web Share API kèm tệp PNG; trình duyệt không
 * hỗ trợ chia sẻ tệp → tải tệp PNG như cũ. Phải được gọi trực tiếp trong sự kiện bấm nút.
 */
export async function saveQrImage(
  matrix: QrMatrix,
  filename: string,
  options: { title?: string; caption?: readonly string[]; scale?: number } = {},
): Promise<QrImageSaveResult> {
  if (typeof document === "undefined") {
    return "failed";
  }
  const canvas = renderQrCanvas(matrix, options.scale ?? 12, options.caption ?? []);
  if (!canvas) {
    return "failed";
  }
  const dataUrl = canvas.toDataURL("image/png");
  const coarsePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (coarsePointer && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const file = new File([dataUrlToBlob(dataUrl)], filename, { type: "image/png" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: options.title ?? filename });
        return "shared";
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      // Trình duyệt từ chối chia sẻ tệp → tải xuống như bình thường.
    }
  }
  try {
    triggerDownload(dataUrl, filename);
    return "downloaded";
  } catch {
    return "failed";
  }
}

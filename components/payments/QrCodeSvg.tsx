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

/** Xuất ảnh PNG (để chọn từ thư viện trong app ngân hàng). Trả về false nếu trình duyệt không hỗ trợ. */
export function downloadQrPng(matrix: QrMatrix, filename: string, scale = 10): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const dimension = (matrix.size + QUIET_ZONE * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension;
  const context = canvas.getContext("2d");
  if (!context) {
    return false;
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, dimension, dimension);
  context.fillStyle = "#000000";
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        context.fillRect((x + QUIET_ZONE) * scale, (y + QUIET_ZONE) * scale, scale, scale);
      }
    }
  }
  const anchor = document.createElement("a");
  anchor.href = canvas.toDataURL("image/png");
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

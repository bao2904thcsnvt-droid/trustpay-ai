/**
 * Ảnh chân dung Demo (vẽ bằng canvas) để mô phỏng quét FaceID khi thiết bị không
 * có webcam. Ảnh chỉ tồn tại trong RAM (REQ-A7.7) và chỉ gọi trong event handler.
 */

const TINY_PNG_FALLBACK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function createDemoFaceBase64(): string {
  if (typeof document === "undefined") {
    return TINY_PNG_FALLBACK;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return TINY_PNG_FALLBACK;
  }

  const bg = ctx.createLinearGradient(0, 0, 320, 240);
  bg.addColorStop(0, "#fdf2f8");
  bg.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 320, 240);

  ctx.fillStyle = "#fce7f3";
  ctx.beginPath();
  ctx.ellipse(160, 118, 56, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#d82d8b";
  ctx.stroke();

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

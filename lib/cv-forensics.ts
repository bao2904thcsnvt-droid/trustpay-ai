/**
 * Computer Vision Forensics — chạy hoàn toàn trên trình duyệt, ảnh không rời thiết bị.
 *
 * 1. Error Level Analysis (ELA): tái nén ảnh JPEG ở chất lượng 0.85 bằng HTML5 Canvas, lấy sai
 *    phân tuyệt đối từng kênh RGB giữa ảnh gốc và ảnh tái nén, khuếch đại ×15. Vùng bị cắt ghép
 *    (chữ số / tên người nhận dán vào bằng Photoshop, app tạo bill giả) có mức lỗi nén khác hẳn
 *    phần còn lại. Điểm "Tampering Score" dựa trên các khối 16×16 có lỗi nén là ngoại lai so với
 *    trung vị toàn ảnh (z-score bền vững theo MAD, ngưỡng 3.5 — Iglewicz & Hoaglin).
 * 2. QR Overlay Integrity: đo năng lượng biên thẳng song song với 4 cạnh mã QR ở dải ngay bên
 *    ngoài vùng lặng (quiet zone). Tem giấy dán đè tạo một đường viền thẳng, liên tục, tương phản
 *    cao bao quanh mã — khác với nền tự nhiên.
 *
 * Các hàm thuần (`computeEla`, `analyzeQrBorderIntegrity`, …) không dùng DOM nên kiểm thử được
 * trên Node; các hàm `*FromFile` / `*FromVideo` chỉ gọi trong trình duyệt.
 */

export const ELA_JPEG_QUALITY = 0.85;
export const ELA_AMPLIFICATION = 15;
export const ELA_BLOCK = 16;
const MAD_Z_THRESHOLD = 3.5;
const MAX_ELA_EDGE = 1024;

export interface ElaResult {
  width: number;
  height: number;
  /** Bản đồ lỗi đã khuếch đại (0–255) cho từng điểm ảnh. */
  errorMap: Uint8ClampedArray;
  /** Lỗi trung bình (chưa khuếch đại, 0–255). */
  meanError: number;
  blocksX: number;
  blocksY: number;
  blockErrors: Float32Array;
  /** Khối 16×16 có lỗi nén ngoại lai (true = nghi chỉnh sửa). */
  anomalousBlocks: Uint8Array;
  anomalousRatio: number;
  /** 0–100: độ tin cậy ảnh đã bị chỉnh sửa cục bộ. */
  tamperingScore: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * ELA trên hai bộ đệm RGBA cùng kích thước (ảnh gốc và ảnh đã tái nén JPEG).
 * Không dùng DOM — kiểm thử được trên Node.
 */
export function computeEla(
  original: Uint8ClampedArray,
  recompressed: Uint8ClampedArray,
  width: number,
  height: number,
  amplification = ELA_AMPLIFICATION,
): ElaResult {
  const pixels = width * height;
  if (pixels <= 0 || original.length < pixels * 4 || recompressed.length < pixels * 4) {
    throw new RangeError("Kích thước bộ đệm ảnh không hợp lệ");
  }
  const errorMap = new Uint8ClampedArray(pixels);
  const raw = new Float32Array(pixels);
  let total = 0;
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    const diff =
      (Math.abs(original[o] - recompressed[o]) +
        Math.abs(original[o + 1] - recompressed[o + 1]) +
        Math.abs(original[o + 2] - recompressed[o + 2])) /
      3;
    raw[i] = diff;
    total += diff;
    errorMap[i] = Math.min(255, diff * amplification);
  }

  const blocksX = Math.max(1, Math.ceil(width / ELA_BLOCK));
  const blocksY = Math.max(1, Math.ceil(height / ELA_BLOCK));
  const blockErrors = new Float32Array(blocksX * blocksY);
  const blockCounts = new Uint32Array(blocksX * blocksY);
  for (let y = 0; y < height; y++) {
    const by = Math.floor(y / ELA_BLOCK);
    for (let x = 0; x < width; x++) {
      const b = by * blocksX + Math.floor(x / ELA_BLOCK);
      blockErrors[b] += raw[y * width + x];
      blockCounts[b] += 1;
    }
  }
  const means: number[] = [];
  for (let b = 0; b < blockErrors.length; b++) {
    blockErrors[b] = blockCounts[b] > 0 ? blockErrors[b] / blockCounts[b] : 0;
    means.push(blockErrors[b]);
  }

  const med = median(means);
  const mad = median(means.map((value) => Math.abs(value - med)));
  // MAD = 0 (ảnh đồng nhất): dùng sàn nhỏ để vẫn phát hiện khối lệch rõ rệt.
  const scale = Math.max(1.4826 * mad, 0.35);
  const anomalousBlocks = new Uint8Array(blockErrors.length);
  let anomalous = 0;
  let excess = 0;
  for (let b = 0; b < blockErrors.length; b++) {
    const z = (blockErrors[b] - med) / scale;
    if (z > MAD_Z_THRESHOLD) {
      anomalousBlocks[b] = 1;
      anomalous += 1;
      excess += Math.min(4, z / MAD_Z_THRESHOLD);
    }
  }
  const anomalousRatio = anomalous / blockErrors.length;
  // Vùng chỉnh sửa cục bộ: có khối ngoại lai nhưng không phủ cả ảnh (ảnh đã nén lại toàn bộ thì
  // lỗi đồng đều → MAD lớn → ít khối ngoại lai). Điểm tăng theo số khối & mức độ lệch.
  const spread = anomalousRatio > 0.6 ? 0.5 : 1;
  const tamperingScore =
    anomalous === 0 ? 0 : Math.max(0, Math.min(100, Math.round(spread * (35 + 400 * anomalousRatio + 4 * excess))));

  return {
    width,
    height,
    errorMap,
    meanError: total / pixels,
    blocksX,
    blocksY,
    blockErrors,
    anomalousBlocks,
    anomalousRatio,
    tamperingScore,
  };
}

/** Bản đồ nhiệt pháp y RGBA (đen → xanh → vàng → đỏ) + viền khối ngoại lai. */
export function renderElaHeatmap(result: ElaResult): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, errorMap, anomalousBlocks, blocksX } = result;
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let i = 0; i < width * height; i++) {
    const v = errorMap[i] / 255;
    const o = i * 4;
    out[o] = Math.round(255 * Math.min(1, Math.max(0, (v - 0.35) * 2.2)));
    out[o + 1] = Math.round(255 * Math.min(1, v * 1.8) * (1 - Math.max(0, v - 0.75) * 2));
    out[o + 2] = Math.round(255 * Math.max(0, 0.55 - v));
    out[o + 3] = Math.round(120 + 135 * v);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = Math.floor(y / ELA_BLOCK) * blocksX + Math.floor(x / ELA_BLOCK);
      if (!anomalousBlocks[b]) continue;
      const onEdge = x % ELA_BLOCK === 0 || y % ELA_BLOCK === 0;
      if (!onEdge) continue;
      const o = (y * width + x) * 4;
      out[o] = 244;
      out[o + 1] = 63;
      out[o + 2] = 94;
      out[o + 3] = 255;
    }
  }
  return out;
}

// ------------------------------------------------------- ELA (trình duyệt)

export interface ElaImageReport {
  result: ElaResult;
  /** Ảnh nguồn (đã thu nhỏ) và bản đồ nhiệt dạng data URL PNG. */
  sourceUrl: string;
  heatmapUrl: string;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Không mã hóa được ảnh"))), type, quality);
  });
}

/** ELA cho ảnh người dùng chọn (chỉ gọi trong trình duyệt). */
export async function analyzeElaFromFile(file: File, quality = ELA_JPEG_QUALITY): Promise<ElaImageReport> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    throw new Error("Trình duyệt không hỗ trợ Canvas / createImageBitmap");
  }
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_ELA_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error("Không tạo được Canvas 2D");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const original = ctx.getImageData(0, 0, width, height);
  const sourceUrl = canvas.toDataURL("image/png");

  const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
  const recompressedBitmap = await createImageBitmap(jpeg);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(recompressedBitmap, 0, 0, width, height);
  recompressedBitmap.close();
  const recompressed = ctx.getImageData(0, 0, width, height);

  const result = computeEla(original.data, recompressed.data, width, height);
  const heat = new ImageData(renderElaHeatmap(result), width, height);
  ctx.putImageData(heat, 0, 0);
  const heatmapUrl = canvas.toDataURL("image/png");
  return { result, sourceUrl, heatmapUrl };
}

// -------------------------------------------------- QR Overlay Integrity

export interface QrBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QrIntegrityResult {
  /** 0–100: khả năng có tem dán đè lên mã QR gốc. */
  overlayScore: number;
  /** Số cạnh (0–4) có đường biên thẳng, liên tục bao quanh mã. */
  framedSides: number;
  /** Độ đồng nhất vùng lặng (0–1, càng cao càng sạch). */
  quietZoneUniformity: number;
  suspicious: boolean;
}

/** Độ sáng ITU-R BT.601 cho bộ đệm RGBA. */
export function toLuminance(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }
  return out;
}

/**
 * Đo biên thẳng bao quanh mã QR trên ảnh độ sáng. Với mỗi cạnh, quét các đường song song từ
 * 2% → 30% kích thước mã ra ngoài; một đường "viền tem" khi ≥ 70% điểm có gradient vuông góc
 * ≥ 28 và trung bình ≥ 36. Đồng thời đo độ đồng nhất vùng lặng sát mã.
 */
export function analyzeQrBorderIntegrity(
  luminance: Float32Array,
  width: number,
  height: number,
  box: QrBox,
): QrIntegrityResult {
  const at = (x: number, y: number) =>
    luminance[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  const size = Math.max(8, Math.min(box.width, box.height));
  const minOffset = Math.max(2, Math.round(size * 0.02));
  const maxOffset = Math.max(minOffset + 2, Math.round(size * 0.3));
  const x0 = Math.round(box.x);
  const y0 = Math.round(box.y);
  const x1 = Math.round(box.x + box.width);
  const y1 = Math.round(box.y + box.height);

  type Side = "top" | "bottom" | "left" | "right";
  const sides: Side[] = ["top", "bottom", "left", "right"];
  let framedSides = 0;

  for (const side of sides) {
    let best = 0;
    for (let d = minOffset; d <= maxOffset; d++) {
      let strong = 0;
      let sum = 0;
      let count = 0;
      const horizontal = side === "top" || side === "bottom";
      const from = horizontal ? x0 : y0;
      const to = horizontal ? x1 : y1;
      for (let t = from; t <= to; t++) {
        let grad: number;
        if (side === "top") grad = Math.abs(at(t, y0 - d - 1) - at(t, y0 - d + 1));
        else if (side === "bottom") grad = Math.abs(at(t, y1 + d + 1) - at(t, y1 + d - 1));
        else if (side === "left") grad = Math.abs(at(x0 - d - 1, t) - at(x0 - d + 1, t));
        else grad = Math.abs(at(x1 + d + 1, t) - at(x1 + d - 1, t));
        sum += grad;
        if (grad >= 28) strong += 1;
        count += 1;
      }
      if (count === 0) continue;
      const coverage = strong / count;
      const mean = sum / count;
      if (coverage >= 0.7 && mean >= 36) best = Math.max(best, coverage);
    }
    if (best > 0) framedSides += 1;
  }

  // Vùng lặng: dải 0 → minOffset quanh mã phải sáng & đồng nhất trên mã in thật.
  const samples: number[] = [];
  for (let t = x0; t <= x1; t += 2) {
    samples.push(at(t, y0 - 1), at(t, y1 + 1));
  }
  for (let t = y0; t <= y1; t += 2) {
    samples.push(at(x0 - 1, t), at(x1 + 1, t));
  }
  const mean = samples.reduce((s, v) => s + v, 0) / Math.max(1, samples.length);
  const std = Math.sqrt(samples.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, samples.length));
  const quietZoneUniformity = Math.max(0, Math.min(1, 1 - std / 64));

  const overlayScore = Math.max(
    0,
    Math.min(100, Math.round(framedSides * 22 + (framedSides >= 3 ? 12 : 0) + (1 - quietZoneUniformity) * 20)),
  );
  return { overlayScore, framedSides, quietZoneUniformity, suspicious: framedSides >= 3 };
}

/** Chụp khung hình từ <video> và đo viền QR (chỉ gọi trong trình duyệt). */
export function analyzeQrIntegrityFromVideo(video: HTMLVideoElement, box: QrBox): QrIntegrityResult | null {
  if (typeof document === "undefined" || video.videoWidth === 0 || video.videoHeight === 0) return null;
  const ratio = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * ratio));
  const height = Math.max(1, Math.round(video.videoHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return analyzeQrBorderIntegrity(toLuminance(data, width, height), width, height, {
    x: box.x * ratio,
    y: box.y * ratio,
    width: box.width * ratio,
    height: box.height * ratio,
  });
}

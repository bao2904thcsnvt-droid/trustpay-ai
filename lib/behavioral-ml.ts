/**
 * Edge Machine Learning — Sinh trắc học hành vi (Behavioral Biometrics).
 *
 * Chạy hoàn toàn trên trình duyệt (< 1 ms / lần suy luận), KHÔNG gửi dữ liệu thô ra ngoài:
 * chỉ thời điểm gõ phím (không lưu ký tự), độ dài đoạn dán và trạng thái cuộc gọi.
 *
 * Mô hình: StandardScaler (z = (x − μ) / σ) + Hồi quy Logistic tuyến tính
 *   P(cưỡng ép | x) = σ(b + Σ wᵢ·zᵢ).
 * Giải thích (XAI): với mô hình tuyến tính và các đặc trưng độc lập, giá trị SHAP chính xác
 * trong không gian logit so với điểm nền μ là φᵢ = wᵢ·zᵢ (Σφᵢ = logit − b).
 *
 * Trọng số `COERCION_MODEL` là tham số tiên nghiệm được hiệu chỉnh thủ công theo các mẫu lừa đảo
 * đã mô tả trong bộ kiểm thử (chưa huấn luyện trên dữ liệu giao dịch thật). `fitLogisticRegression`
 * cung cấp bộ huấn luyện Gradient Descent thật để thay trọng số khi có dữ liệu gán nhãn.
 */

export const FEATURE_KEYS = [
  "keystrokeHesitationMs",
  "clipboardPasteRatio",
  "flowVelocityScore",
  "activeCallRisk",
  "amountZScore",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type BehavioralFeatureVector = Record<FeatureKey, number>;

export interface LinearModel {
  means: BehavioralFeatureVector;
  stds: BehavioralFeatureVector;
  weights: BehavioralFeatureVector;
  bias: number;
}

export interface FeatureAttribution {
  key: FeatureKey;
  value: number;
  /** Giá trị SHAP (logit) — dương làm tăng rủi ro, âm làm giảm. */
  contribution: number;
  /** Tỷ trọng đóng góp có dấu (%), Σ|sharePct| = 100. */
  sharePct: number;
}

export interface CoercionPrediction {
  probability: number;
  logit: number;
  attributions: FeatureAttribution[];
}

/** Ngưỡng "bất thường hành vi cao" — kích hoạt xác thực sinh trắc học bổ sung. */
export const COERCION_HIGH_THRESHOLD = 0.7;

export const COERCION_MODEL: LinearModel = {
  means: {
    keystrokeHesitationMs: 220,
    clipboardPasteRatio: 0.15,
    flowVelocityScore: 0.35,
    activeCallRisk: 0.05,
    amountZScore: 0,
  },
  stds: {
    keystrokeHesitationMs: 160,
    clipboardPasteRatio: 0.3,
    flowVelocityScore: 0.25,
    activeCallRisk: 0.22,
    amountZScore: 1,
  },
  weights: {
    keystrokeHesitationMs: 0.5,
    clipboardPasteRatio: 0.4,
    flowVelocityScore: 0.45,
    activeCallRisk: 1.15,
    amountZScore: 0.75,
  },
  bias: -2,
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

/** StandardScaler; σ được kẹp tối thiểu 1e-6 để không chia cho 0. */
export function standardize(vector: BehavioralFeatureVector, model: LinearModel = COERCION_MODEL): BehavioralFeatureVector {
  const out = {} as BehavioralFeatureVector;
  for (const key of FEATURE_KEYS) {
    const raw = Number.isFinite(vector[key]) ? vector[key] : model.means[key];
    out[key] = clamp((raw - model.means[key]) / Math.max(1e-6, model.stds[key]), -6, 6);
  }
  return out;
}

/** Xác suất bị cưỡng ép / bất thường + giải thích SHAP chính xác cho mô hình tuyến tính. */
export function predictCoercion(vector: BehavioralFeatureVector, model: LinearModel = COERCION_MODEL): CoercionPrediction {
  const z = standardize(vector, model);
  let logit = model.bias;
  const raw: { key: FeatureKey; value: number; contribution: number }[] = [];
  for (const key of FEATURE_KEYS) {
    const contribution = model.weights[key] * z[key];
    logit += contribution;
    raw.push({ key, value: vector[key], contribution });
  }
  const totalAbs = raw.reduce((sum, item) => sum + Math.abs(item.contribution), 0);
  const attributions = raw
    .map((item) => ({
      ...item,
      sharePct: totalAbs > 0 ? Math.round((item.contribution / totalAbs) * 1000) / 10 : 0,
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { probability: sigmoid(logit), logit, attributions };
}

// ------------------------------------------------------------- đặc trưng

/** Độ lệch chuẩn khoảng cách giữa các lần gõ phím (ms); < 3 khoảng → null (chưa đủ dữ liệu). */
export function interKeyStdMs(times: readonly number[], capMs = 3000): number | null {
  if (times.length < 4) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push(Math.min(capMs, Math.max(0, times[i] - times[i - 1])));
  }
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance);
}

/** 1 = thao tác cực nhanh (bị hối thúc / đọc theo kịch bản), 0 = bình tĩnh (≥ 90 giây). */
export function flowVelocity(durationMs: number | null, slowMs = 90_000): number | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return null;
  return clamp(1 - durationMs / slowMs, 0, 1);
}

/** Độ lệch chuẩn của số tiền so với lịch sử cá nhân (không gian log, cần ≥ 3 giao dịch). */
export function amountZScore(amount: number, history: readonly number[]): number {
  const values = history.filter((value) => Number.isFinite(value) && value > 0).map((value) => Math.log(value));
  if (!(amount > 0) || values.length < 3) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return clamp((Math.log(amount) - mean) / Math.max(0.25, std), -6, 6);
}

export interface BehaviorContext {
  /** 1 = đang nghe cuộc gọi lạ (Active Call Shield), 0 = không. */
  callRisk: number;
  amount: number;
  historyAmounts: readonly number[];
}

/**
 * Bộ ghi hành vi phía client: chỉ lưu dấu thời gian phím (không lưu ký tự) và số ký tự dán.
 * Không chạm `window` khi khởi tạo → an toàn khi import ở môi trường SSR.
 */
export class BehaviorTracker {
  private keyTimes: number[] = [];
  private typed = 0;
  private pasted = 0;
  private startedAt: number | null = null;

  start(now: number): void {
    if (this.startedAt === null) this.startedAt = now;
  }

  key(now: number): void {
    this.start(now);
    this.keyTimes.push(now);
    if (this.keyTimes.length > 240) this.keyTimes.shift();
    this.typed += 1;
  }

  paste(length: number, now: number): void {
    this.start(now);
    this.pasted += Math.max(0, Math.min(5000, Math.floor(length)));
  }

  snapshot(now: number, context: BehaviorContext): BehavioralFeatureVector {
    const means = COERCION_MODEL.means;
    const hesitation = interKeyStdMs(this.keyTimes);
    const total = this.typed + this.pasted;
    // Tốc độ thao tác chỉ có ý nghĩa khi người dùng tự gõ (≥ 4 phím); điền sẵn tự động
    // (Paste-to-Pay, Danh bạ 1 chạm) không bị coi là "vội vàng".
    const velocity =
      this.typed >= 4 ? flowVelocity(this.startedAt === null ? null : now - this.startedAt) : null;
    return {
      keystrokeHesitationMs: hesitation ?? means.keystrokeHesitationMs,
      clipboardPasteRatio: total > 0 ? this.pasted / total : means.clipboardPasteRatio,
      flowVelocityScore: velocity ?? means.flowVelocityScore,
      activeCallRisk: clamp(context.callRisk, 0, 1),
      amountZScore: amountZScore(context.amount, context.historyAmounts),
    };
  }

  reset(): void {
    this.keyTimes = [];
    this.typed = 0;
    this.pasted = 0;
    this.startedAt = null;
  }
}

// ------------------------------------------------------------- huấn luyện

export interface LogisticFit {
  weights: number[];
  bias: number;
  loss: number;
}

/**
 * Hồi quy Logistic bằng Gradient Descent toàn lô + điều chuẩn L2 (đầu vào nên đã chuẩn hóa).
 * Dùng để thay `COERCION_MODEL.weights` khi có dữ liệu gán nhãn thật.
 */
export function fitLogisticRegression(
  samples: readonly (readonly number[])[],
  labels: readonly number[],
  options: { epochs?: number; learningRate?: number; l2?: number } = {},
): LogisticFit {
  const epochs = options.epochs ?? 600;
  const lr = options.learningRate ?? 0.3;
  const l2 = options.l2 ?? 0.001;
  const n = samples.length;
  const d = n > 0 ? samples[0].length : 0;
  const weights = new Array<number>(d).fill(0);
  let bias = 0;
  let loss = 0;
  if (n === 0 || labels.length !== n) return { weights, bias, loss };

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array<number>(d).fill(0);
    let gradB = 0;
    loss = 0;
    for (let i = 0; i < n; i++) {
      let logit = bias;
      for (let j = 0; j < d; j++) logit += weights[j] * samples[i][j];
      const p = sigmoid(logit);
      const y = labels[i];
      const err = p - y;
      for (let j = 0; j < d; j++) gradW[j] += err * samples[i][j];
      gradB += err;
      loss -= y * Math.log(Math.max(1e-12, p)) + (1 - y) * Math.log(Math.max(1e-12, 1 - p));
    }
    for (let j = 0; j < d; j++) {
      weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
    }
    bias -= lr * (gradB / n);
    loss /= n;
  }
  return { weights, bias, loss };
}

/**
 * Mô hình chi phí đơn vị (Unit Economics) cho mỗi giao dịch được Lá chắn AI
 * phân tích. Khớp `pitch-prep/unit-economics-finops.md`:
 *  - Baseline (mục 1.3): 60% giao dịch gọi Claude Sonnet, không cache → ≈ 5,56 USD / 1.000 GD.
 *  - Tối ưu FinOps (mục 1.4): định tuyến 40%, 80% Haiku / 20% Sonnet, Prompt
 *    Caching 2/3 token đầu vào, `max_tokens` gọn, chỉ dịch văn bản không phải
 *    tiếng Việt → ≈ 1,23 USD / 1.000 GD ≈ 0,0012 USD/GD.
 * Mọi đơn giá là GIẢ ĐỊNH MẪU để minh họa mô hình tính, không phải báo giá AWS.
 */

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface UnitEconomicsInputs {
  label: string;
  /** Tỷ lệ giao dịch cần gọi Bedrock (còn lại dùng bộ luật). */
  bedrockCallRate: number;
  /** Trong các lần gọi Bedrock, tỷ lệ đi mô hình rẻ (Haiku). */
  lightModelShare: number;
  inputTokens: number;
  outputTokens: number;
  /** Tỷ lệ token đầu vào là phần tĩnh được Prompt Caching. */
  cachedInputShare: number;
  /** Hệ số giá token đọc từ cache so với token thường. */
  cacheReadPriceFactor: number;
  ocrRate: number;
  faceMatchRate: number;
  translateRate: number;
  translateCharsPerTxn: number;
  lambdaSecondsPerTxn: number;
  lambdaMemoryGb: number;
  requestsPerTxn: number;
  dynamoWritesPerTxn: number;
}

export const PRICING = {
  sonnet: { inputPerMillion: 3, outputPerMillion: 15 } satisfies ModelPrice,
  haiku: { inputPerMillion: 0.8, outputPerMillion: 4 } satisfies ModelPrice,
  rekognitionPerImage: 0.001,
  translatePerMillionChars: 15,
  lambdaPerGbSecond: 0.0000166667,
  lambdaPerMillionRequests: 0.2,
  apiGatewayPerMillionRequests: 1,
  dynamoPerMillionWrites: 1.25,
  vndPerUsd: 25_000,
} as const;

export const BASELINE_SONNET_ONLY: UnitEconomicsInputs = {
  label: "Baseline — Sonnet-only",
  bedrockCallRate: 0.6,
  lightModelShare: 0,
  inputTokens: 900,
  outputTokens: 350,
  cachedInputShare: 0,
  cacheReadPriceFactor: 1,
  ocrRate: 0.25,
  faceMatchRate: 0.08,
  translateRate: 0.1,
  translateCharsPerTxn: 300,
  lambdaSecondsPerTxn: 0.4,
  lambdaMemoryGb: 1,
  requestsPerTxn: 2,
  dynamoWritesPerTxn: 2,
};

export const OPTIMIZED_FINOPS: UnitEconomicsInputs = {
  ...BASELINE_SONNET_ONLY,
  label: "FinOps — routing + Haiku tiering + Prompt Caching",
  bedrockCallRate: 0.4,
  lightModelShare: 0.8,
  outputTokens: 250,
  cachedInputShare: 2 / 3,
  cacheReadPriceFactor: 0.1,
  translateRate: 0.02,
};

export interface CostBreakdown {
  bedrock: number;
  rekognition: number;
  translate: number;
  lambda: number;
  requests: number;
  dynamodb: number;
  /** USD cho 1.000 giao dịch. */
  totalPer1000: number;
  /** USD cho 1 giao dịch. */
  perTransaction: number;
  perTransactionVnd: number;
}

function bedrockCostPerCall(price: ModelPrice, inputs: UnitEconomicsInputs): number {
  const freshInput = inputs.inputTokens * (1 - inputs.cachedInputShare);
  const cachedInput = inputs.inputTokens * inputs.cachedInputShare * inputs.cacheReadPriceFactor;
  return (
    ((freshInput + cachedInput) * price.inputPerMillion + inputs.outputTokens * price.outputPerMillion) / 1_000_000
  );
}

/** Chi phí cho 1.000 giao dịch theo bộ giả định. */
export function computeUnitCost(inputs: UnitEconomicsInputs): CostBreakdown {
  const n = 1_000;
  const calls = n * inputs.bedrockCallRate;
  const lightCalls = calls * inputs.lightModelShare;
  const heavyCalls = calls - lightCalls;

  const bedrock =
    lightCalls * bedrockCostPerCall(PRICING.haiku, inputs) + heavyCalls * bedrockCostPerCall(PRICING.sonnet, inputs);
  const rekognition = n * (inputs.ocrRate + inputs.faceMatchRate) * PRICING.rekognitionPerImage;
  const translate = (n * inputs.translateRate * inputs.translateCharsPerTxn * PRICING.translatePerMillionChars) / 1_000_000;
  const lambda = n * inputs.lambdaSecondsPerTxn * inputs.lambdaMemoryGb * PRICING.lambdaPerGbSecond;
  const requests =
    (n * inputs.requestsPerTxn * (PRICING.lambdaPerMillionRequests + PRICING.apiGatewayPerMillionRequests)) / 1_000_000;
  const dynamodb = (n * inputs.dynamoWritesPerTxn * PRICING.dynamoPerMillionWrites) / 1_000_000;

  const totalPer1000 = bedrock + rekognition + translate + lambda + requests + dynamodb;
  const perTransaction = totalPer1000 / n;
  return {
    bedrock,
    rekognition,
    translate,
    lambda,
    requests,
    dynamodb,
    totalPer1000,
    perTransaction,
    perTransactionVnd: perTransaction * PRICING.vndPerUsd,
  };
}

/** Định dạng USD gọn: 0,0012 → "$0.0012". */
export function formatUsd(value: number, fractionDigits = 4): string {
  return `$${value.toFixed(fractionDigits)}`;
}

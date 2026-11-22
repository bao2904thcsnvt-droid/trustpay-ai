import { CircuitBreaker, TimeoutError, withTimeout, type CircuitSnapshot } from "@/lib/resilience/circuit-breaker";

/**
 * Circuit Breaker theo từng dịch vụ AWS (chỉ dùng phía máy chủ). Lưu trên
 * `globalThis` để mọi Route Handler trong cùng tiến trình (vd `/api/analyze` và
 * `/api/pii-preview`) dùng chung một trạng thái thật.
 *
 * Ngân sách thời gian theo `.kiro/steering/aws-resilience-and-finops.md`:
 * Bedrock ≤ 4000 ms, Rekognition ≤ 2500 ms, Translate ≤ 1500 ms.
 */

export const AWS_TIMEOUT_BUDGET_MS = {
  bedrock: 4000,
  rekognition: 2500,
  translate: 1500,
} as const;

export type AwsServiceName = keyof typeof AWS_TIMEOUT_BUDGET_MS;

export const AWS_SERVICE_NAMES: readonly AwsServiceName[] = ["bedrock", "rekognition", "translate"];

export type AwsFallbackReasonCode = "no-credentials" | "circuit-open" | "timeout" | "aws-error" | "invalid-json";

/** Lỗi có chủ đích để chuyển sang Offline Heuristic kèm lý do (đưa vào header telemetry). */
export class AwsFallbackSignal extends Error {
  readonly reason: AwsFallbackReasonCode;

  constructor(reason: AwsFallbackReasonCode, message: string) {
    super(message);
    this.name = "AwsFallbackSignal";
    this.reason = reason;
  }
}

type BreakerRegistry = Record<AwsServiceName, CircuitBreaker>;

const REGISTRY_KEY = "__trustpayAwsServiceBreakers__";

function registry(): BreakerRegistry {
  const holder = globalThis as typeof globalThis & { [REGISTRY_KEY]?: BreakerRegistry };
  const existing = holder[REGISTRY_KEY];
  if (existing) {
    return existing;
  }
  const created: BreakerRegistry = {
    bedrock: new CircuitBreaker("bedrock", { failureThreshold: 3, coolDownMs: 30_000 }),
    rekognition: new CircuitBreaker("rekognition", { failureThreshold: 3, coolDownMs: 30_000 }),
    translate: new CircuitBreaker("translate", { failureThreshold: 3, coolDownMs: 30_000 }),
  };
  holder[REGISTRY_KEY] = created;
  return created;
}

export function getServiceBreaker(name: AwsServiceName): CircuitBreaker {
  return registry()[name];
}

export function snapshotServiceBreakers(): CircuitSnapshot[] {
  return AWS_SERVICE_NAMES.map((name) => registry()[name].snapshot());
}

/** Giá trị header `x-trustpay-breaker`, vd `bedrock=CLOSED;rekognition=CLOSED;translate=OPEN`. */
export function breakerHeaderValue(): string {
  return AWS_SERVICE_NAMES.map((name) => `${name}=${registry()[name].state}`).join(";");
}

/**
 * Gọi một dịch vụ AWS có bảo vệ: mạch OPEN → ném `AwsFallbackSignal` ngay
 * (< 1 ms, không chờ mạng); quá ngân sách thời gian → `TimeoutError`. Mọi lỗi
 * đều được ghi nhận vào breaker rồi ném tiếp cho nhánh dự phòng của route.
 */
export async function callAwsService<T>(name: AwsServiceName, action: () => Promise<T>): Promise<T> {
  const breaker = registry()[name];
  if (!breaker.canRequest()) {
    throw new AwsFallbackSignal("circuit-open", `Circuit Breaker '${name}' đang OPEN`);
  }
  try {
    const result = await withTimeout(action(), AWS_TIMEOUT_BUDGET_MS[name], name);
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}

export function classifyFallbackReason(error: unknown): AwsFallbackReasonCode {
  if (error instanceof AwsFallbackSignal) {
    return error.reason;
  }
  if (error instanceof TimeoutError) {
    return "timeout";
  }
  return "aws-error";
}

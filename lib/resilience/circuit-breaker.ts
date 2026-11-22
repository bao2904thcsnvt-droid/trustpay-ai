/**
 * Circuit Breaker 3 trạng thái + ép ngân sách thời gian (timeout) cho các lệnh
 * gọi dịch vụ AWS (Bedrock, Rekognition, Translate) của TrustPay AI.
 *
 * Mục tiêu (REQ-A9.4, A9.5): khi một dịch vụ AWS lỗi liên tiếp hoặc chậm, breaker
 * chuyển sang OPEN và mọi lệnh gọi tiếp theo đi thẳng nhánh dự phòng (Offline
 * Heuristic Engine) trong < 50 ms, không chờ mạng.
 *
 * Module thuần TypeScript, không phụ thuộc thư viện ngoài.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Thao tác '${label}' vượt ngân sách thời gian ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** Chạy một promise với ngân sách thời gian; quá hạn sẽ ném TimeoutError. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "aws-call",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}

export interface CircuitBreakerOptions {
  /** Số lỗi liên tiếp để mở mạch. Mặc định 5. */
  failureThreshold?: number;
  /** Thời gian giữ trạng thái OPEN trước khi thử lại (ms). Mặc định 30000. */
  coolDownMs?: number;
  /** Hàm lấy thời gian hiện tại (tiêm vào để kiểm thử xác định). */
  now?: () => number;
}

export interface CircuitSnapshot {
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly coolDownMs: number;
  private readonly now: () => number;

  private stateValue: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.coolDownMs = options.coolDownMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  get state(): CircuitState {
    this.refresh();
    return this.stateValue;
  }

  /** Cho phép gửi một lệnh gọi thật hay không tại thời điểm hiện tại. */
  canRequest(): boolean {
    this.refresh();
    return this.stateValue !== "OPEN";
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.stateValue = "CLOSED";
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.stateValue = "OPEN";
      this.openedAt = this.now();
    } else if (this.stateValue === "HALF_OPEN") {
      this.stateValue = "OPEN";
      this.openedAt = this.now();
    }
  }

  snapshot(): CircuitSnapshot {
    this.refresh();
    return {
      name: this.name,
      state: this.stateValue,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
    };
  }

  /**
   * Thực thi `action` có bảo vệ. Khi mạch OPEN hoặc `action` lỗi/timeout, trả về
   * kết quả của `fallback`. `fallback` phải nhanh và không phụ thuộc mạng.
   */
  async execute<T>(
    action: () => Promise<T>,
    fallback: (error?: unknown) => Promise<T> | T,
  ): Promise<T> {
    this.refresh();

    if (this.stateValue === "OPEN") {
      return fallback(new Error(`CircuitBreaker '${this.name}' đang OPEN`));
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      return fallback(error);
    }
  }

  private refresh(): void {
    if (
      this.stateValue === "OPEN" &&
      this.openedAt !== null &&
      this.now() - this.openedAt >= this.coolDownMs
    ) {
      this.stateValue = "HALF_OPEN";
    }
  }
}

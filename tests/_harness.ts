/**
 * Khung kiểm thử tối giản, không phụ thuộc thư viện ngoài, cho bộ kiểm thử đối
 * kháng của TrustPay AI. Gọi trực tiếp Route Handler thật (`/api/analyze`,
 * `/api/verify-face`) ở chế độ Offline xác định (không cần AWS credentials).
 *
 * Chạy: `npx --yes tsx tests/<suite>.ts` (hoặc Node >= 22 với
 * `node --experimental-strip-types tests/<suite>.ts`).
 */

import { POST as analyzeRoute } from "@/app/api/analyze/route";
import { POST as verifyFaceRoute } from "@/app/api/verify-face/route";
import type {
  TransactionAnalysisRequest,
  TransactionAnalysisResponse,
  VerifyFaceRequest,
  VerifyFaceResponse,
} from "@/types/trustpay";

/** Xóa AWS credentials để ép nhánh Smart Fallback Engine (kết quả xác định). */
export function configureOfflineMode(): void {
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
}

function buildRequest(url: string, payload: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function analyze(
  payload: TransactionAnalysisRequest,
): Promise<TransactionAnalysisResponse> {
  const res = await analyzeRoute(buildRequest("https://trustpay.local/api/analyze", payload));
  return (await res.json()) as TransactionAnalysisResponse;
}

export async function verifyFace(payload: VerifyFaceRequest): Promise<VerifyFaceResponse> {
  const res = await verifyFaceRoute(
    buildRequest("https://trustpay.local/api/verify-face", payload),
  );
  return (await res.json()) as VerifyFaceResponse;
}

/** Ảnh base64 nhỏ hợp lệ (1x1 PNG) để mô phỏng ảnh bằng chứng/selfie. */
export const TINY_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface GapNote {
  task: string;
  note: string;
}

export class Check {
  public failed = false;
  public readonly lines: string[] = [];

  private record(pass: boolean, msg: string): void {
    if (!pass) {
      this.failed = true;
    }
    this.lines.push(`${pass ? "  ✓" : "  ✗"} ${msg}`);
  }

  ok(condition: boolean, msg: string): void {
    this.record(condition, msg);
  }

  eq<T>(actual: T, expected: T, msg: string): void {
    this.record(
      actual === expected,
      `${msg} (mong đợi=${String(expected)}, thực tế=${String(actual)})`,
    );
  }

  ge(actual: number, min: number, msg: string): void {
    this.record(actual >= min, `${msg} (>= ${min}; thực tế=${actual})`);
  }

  lt(actual: number, max: number, msg: string): void {
    this.record(actual < max, `${msg} (< ${max}; thực tế=${actual})`);
  }

  between(actual: number, lo: number, hi: number, msg: string): void {
    this.record(actual >= lo && actual <= hi, `${msg} (trong [${lo}, ${hi}]; thực tế=${actual})`);
  }

  includes(haystack: string, needle: string, msg: string): void {
    this.record(haystack.includes(needle), `${msg} (chứa "${needle}")`);
  }

  truthy(value: unknown, msg: string): void {
    this.record(Boolean(value), msg);
  }
}

interface CaseRecord {
  id: string;
  title: string;
  passed: boolean;
  gap: GapNote | undefined;
  lines: string[];
}

export class Suite {
  private readonly records: CaseRecord[] = [];
  private readonly strict: boolean;

  constructor(private readonly title: string) {
    this.strict = process.argv.includes("--strict") || process.env.TRUSTPAY_STRICT === "1";
  }

  async run(
    id: string,
    title: string,
    fn: (c: Check) => void | Promise<void>,
    gap?: GapNote,
  ): Promise<void> {
    const check = new Check();
    try {
      await fn(check);
    } catch (error) {
      check.failed = true;
      check.lines.push(`  ✗ Ngoại lệ: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.records.push({
      id,
      title,
      passed: !check.failed,
      gap,
      lines: check.lines,
    });
  }

  finish(): void {
    const line = "─".repeat(72);
    console.log(`\n${line}\n${this.title}\n${line}`);

    let passed = 0;
    let failed = 0;
    let gaps = 0;

    for (const rec of this.records) {
      const gapFailsStrict = this.strict && rec.gap !== undefined;
      const effectivePass = rec.passed && !gapFailsStrict;
      if (effectivePass) {
        passed += 1;
      } else {
        failed += 1;
      }
      const status = effectivePass ? "PASS" : "FAIL";
      console.log(`\n[${status}] ${rec.id} — ${rec.title}`);
      for (const l of rec.lines) {
        console.log(l);
      }
      if (rec.gap) {
        gaps += 1;
        console.log(`  ⚠ KNOWN-GAP (${rec.gap.task}): ${rec.gap.note}`);
      }
    }

    console.log(`\n${line}`);
    console.log(
      `Tổng: ${this.records.length} · PASS: ${passed} · FAIL: ${failed} · KNOWN-GAP: ${gaps}` +
        (this.strict ? " · chế độ --strict (KNOWN-GAP tính là FAIL)" : ""),
    );
    console.log(line);

    process.exitCode = failed > 0 ? 1 : 0;
  }
}

import type {
  AwsEngineMode,
  AwsPipelineKind,
  AwsPipelineStep,
  AwsPipelineStepId,
  AwsPipelineTrace,
  TransactionAnalysisRequest,
  TransactionAnalysisResponse,
  VerifyFaceRequest,
  VerifyFaceResponse,
} from "@/types/trustpay";

/**
 * Client gọi Lá chắn AI và dựng "luồng công nghệ AWS" cho thanh trạng thái ở
 * cuối thẻ kết quả. Telemetry (engine thực tế, thời gian từng chặng) được máy
 * chủ trả qua HTTP header `x-trustpay-engine`, `x-trustpay-ocr`, `server-timing`
 * — KHÔNG chèn vào JSON hợp đồng của API.
 */

export const ENGINE_HEADER = "x-trustpay-engine";
export const OCR_HEADER = "x-trustpay-ocr";

type ServerTimings = Record<string, number>;

export function parseServerTiming(header: string | null): ServerTimings {
  const timings: ServerTimings = {};
  if (!header) {
    return timings;
  }
  for (const metric of header.split(",")) {
    const parts = metric.trim().split(";");
    const name = parts[0]?.trim();
    if (!name) {
      continue;
    }
    for (const param of parts.slice(1)) {
      const [key, value] = param.trim().split("=");
      if (key === "dur" && value !== undefined) {
        const dur = Number(value);
        if (Number.isFinite(dur)) {
          timings[name] = dur;
        }
      }
    }
  }
  return timings;
}

function engineFromHeader(value: string | null): AwsEngineMode {
  return value === "bedrock" || value === "rekognition" ? "AWS" : "OFFLINE_HEURISTIC";
}

function timingOrNull(timings: ServerTimings, name: string): number | null {
  const value = timings[name];
  return typeof value === "number" ? value : null;
}

/** Dựng luồng AWS cho một lần gọi `/api/analyze`. */
export function buildAnalyzeTrace(
  headers: Headers,
  totalLatencyMs: number,
  kind: Exclude<AwsPipelineKind, "FACE_MATCH">,
): AwsPipelineTrace {
  const engine = engineFromHeader(headers.get(ENGINE_HEADER));
  const ocrMode = headers.get(OCR_HEADER);
  const timings = parseServerTiming(headers.get("server-timing"));
  const rulesMs = timingOrNull(timings, "rules");

  const bedrockStep: AwsPipelineStep = {
    id: "bedrock",
    status: engine === "AWS" ? "aws" : "fallback",
    latencyMs: engine === "AWS" ? timingOrNull(timings, "bedrock") : rulesMs,
  };
  const blacklistStep: AwsPipelineStep = { id: "blacklist", status: "local", latencyMs: rulesMs };

  const steps: AwsPipelineStep[] =
    kind === "IMAGE_EVIDENCE"
      ? [
          {
            id: "rekognition",
            status: ocrMode === "rekognition" ? "aws" : "fallback",
            latencyMs: timingOrNull(timings, "ocr"),
          },
          bedrockStep,
          blacklistStep,
        ]
      : [bedrockStep, { id: "biometric-policy", status: "local", latencyMs: null }, blacklistStep];

  return { kind, engine, totalLatencyMs: totalLatencyMs, steps };
}

/** Ghi độ trễ đo được phía client cho một chặng (vd Biometric Policy). */
export function withStepLatency(
  trace: AwsPipelineTrace,
  stepId: AwsPipelineStepId,
  latencyMs: number,
): AwsPipelineTrace {
  return {
    ...trace,
    steps: trace.steps.map((step) => (step.id === stepId ? { ...step, latencyMs } : step)),
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export interface AnalyzeCallResult {
  result: TransactionAnalysisResponse;
  trace: AwsPipelineTrace;
}

/** Gọi `/api/analyze` (chỉ dùng trong event handler phía trình duyệt). */
export async function requestTransactionAnalysis(
  payload: TransactionAnalysisRequest,
  kind: Exclude<AwsPipelineKind, "FACE_MATCH">,
): Promise<AnalyzeCallResult> {
  const started = nowMs();
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = (await response.json()) as TransactionAnalysisResponse;
  const trace = buildAnalyzeTrace(response.headers, nowMs() - started, kind);
  return { result, trace };
}

export interface FaceCallResult {
  result: VerifyFaceResponse;
  trace: AwsPipelineTrace;
}

/** Gọi `/api/verify-face` và dựng luồng Rekognition CompareFaces. */
export async function requestFaceVerification(selfieBase64: string): Promise<FaceCallResult> {
  const started = nowMs();
  const payload: VerifyFaceRequest = { selfieBase64 };
  const response = await fetch("/api/verify-face", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = (await response.json()) as VerifyFaceResponse;
  const totalLatencyMs = nowMs() - started;
  const engine = engineFromHeader(response.headers.get(ENGINE_HEADER));
  const timings = parseServerTiming(response.headers.get("server-timing"));
  return {
    result,
    trace: {
      kind: "FACE_MATCH",
      engine,
      totalLatencyMs,
      steps: [
        {
          id: "rekognition",
          status: engine === "AWS" ? "aws" : "fallback",
          latencyMs: timingOrNull(timings, "rekognition"),
        },
      ],
    },
  };
}

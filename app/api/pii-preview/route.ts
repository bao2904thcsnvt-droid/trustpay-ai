import { NextResponse } from "next/server";
import { hashCommandText } from "@/lib/security/pii-masking";
import { redactForPrompt } from "@/lib/security/prompt-redaction";
import { snapshotServiceBreakers, AWS_TIMEOUT_BUDGET_MS } from "@/lib/aws/service-breakers";

/**
 * Xem trước lớp che PII mà `/api/analyze` áp dụng TRƯỚC KHI gửi prompt sang
 * Amazon Bedrock (NĐ 13/2023/NĐ-CP), kèm trạng thái Circuit Breaker thật của
 * từng dịch vụ AWS trong tiến trình máy chủ. Route phụ trợ cho bảng "AWS
 * Security & FinOps" — không thay đổi hợp đồng `/api/analyze` hay `/api/verify-face`.
 *
 * Không ghi log nội dung đầu vào; văn bản gốc chỉ tồn tại trong RAM của request.
 */

const MAX_PREVIEW_CHARS = 2000;

export async function POST(request: Request) {
  const startedAt = performance.now();

  let text = "";
  try {
    const body = (await request.json()) as unknown;
    if (typeof body === "object" && body !== null && typeof (body as { text?: unknown }).text === "string") {
      text = (body as { text: string }).text.slice(0, MAX_PREVIEW_CHARS);
    }
  } catch {
    text = "";
  }

  const maskStartedAt = performance.now();
  const redaction = redactForPrompt(text);
  const maskingMs = performance.now() - maskStartedAt;

  return NextResponse.json(
    {
      masked: redaction.text,
      findings: redaction.findings,
      commandHash: text ? hashCommandText(text) : null,
      maskingMs,
      breakers: snapshotServiceBreakers().map((snapshot) => ({
        name: snapshot.name,
        state: snapshot.state,
        consecutiveFailures: snapshot.consecutiveFailures,
      })),
      timeoutBudgetMs: AWS_TIMEOUT_BUDGET_MS,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "server-timing": `mask;dur=${maskingMs.toFixed(2)}, total;dur=${(performance.now() - startedAt).toFixed(2)}`,
      },
    },
  );
}

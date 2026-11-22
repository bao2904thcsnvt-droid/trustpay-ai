/**
 * Lambda Production cho POST /api/analyze của TrustPay AI.
 * Tái sử dụng guard & chính sách dùng chung; luôn trả HTTP 200 đúng hợp đồng.
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { RekognitionClient, DetectTextCommand } from "@aws-sdk/client-rekognition";
import type { TransactionAnalysisRequest } from "@/types/trustpay";
import { parseAiAnalysis, safeMergeAnalysis } from "@/lib/security/ai-output-guard";
import { decideBiometric } from "@/lib/compliance/biometric-policy";
import { CircuitBreaker, withTimeout } from "@/lib/resilience/circuit-breaker";
import { maskPiiInText } from "@/lib/security/pii-masking";
import { buildBaseline } from "./heuristic";

const region = process.env.AWS_REGION ?? "ap-southeast-1";
const bedrockBreaker = new CircuitBreaker("bedrock", { failureThreshold: 5, coolDownMs: 30_000 });
const rekognitionBreaker = new CircuitBreaker("rekognition-ocr", {
  failureThreshold: 5,
  coolDownMs: 30_000,
});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let req: TransactionAnalysisRequest;
  try {
    req = JSON.parse(event.body ?? "{}") as TransactionAnalysisRequest;
  } catch {
    req = { commandText: "", currentBudgets: [], blacklist: [] };
  }

  // 1. OCR ảnh bằng chứng (nếu có) — có Circuit Breaker + ngân sách thời gian.
  const img = req.imageBase64;
  let ocrText = "";
  if (img) {
    ocrText = await rekognitionBreaker.execute(
      async () => {
        const rek = new RekognitionClient({ region });
        const bytes = Buffer.from(img.replace(/^data:image\/\w+;base64,/, ""), "base64");
        const out = await withTimeout(
          rek.send(new DetectTextCommand({ Image: { Bytes: bytes } })),
          2500,
          "rekognition-detect-text",
        );
        return (out.TextDetections ?? [])
          .filter((d) => d.Type === "LINE" && d.DetectedText)
          .map((d) => d.DetectedText as string)
          .join(" ");
      },
      () => "",
    );
  }

  // 2. Baseline xác định bằng bộ luật.
  const baseline = buildBaseline(req, ocrText);

  // 3. Làm giàu bằng Bedrock, có Circuit Breaker; lỗi/timeout -> baseline.
  const enriched = await bedrockBreaker.execute(
    async () => {
      const modelId = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20240620-v1:0";
      const bedrock = new BedrockRuntimeClient({ region });
      const prompt = [
        "Bạn là hệ thống AI chống lừa đảo tài chính TrustPay AI.",
        "Trả về DUY NHẤT một JSON hợp lệ theo cấu trúc TransactionAnalysisResponse.",
        `Câu lệnh (đã ẩn danh): "${maskPiiInText(req.commandText ?? "")}"`,
        `Văn bản OCR (đã ẩn danh): "${maskPiiInText(ocrText)}"`,
        `JSON baseline tham chiếu: ${JSON.stringify(baseline)}`,
      ].join("\n");

      const res = await withTimeout(
        bedrock.send(
          new InvokeModelCommand({
            modelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
              anthropic_version: "bedrock-2023-05-31",
              max_tokens: 1024,
              temperature: 0.1,
              messages: [{ role: "user", content: prompt }],
            }),
          }),
        ),
        4000,
        "bedrock-invoke",
      );

      const raw = new TextDecoder().decode(res.body as Uint8Array);
      const parsed = JSON.parse(raw) as { content?: Array<{ text?: string }> };
      const aiText = parsed.content?.[0]?.text ?? "";
      return safeMergeAnalysis(parseAiAnalysis(aiText), baseline);
    },
    () => baseline,
  );

  // 4. Chính sách sinh trắc học pháp lý (QĐ 2345 / TT 50) — không tin AI.
  const decision = decideBiometric({
    parsedAmount: enriched.parsedAmount,
    riskLevel: enriched.scamReport.riskLevel,
  });

  const finalResponse = {
    ...enriched,
    requireBiometric: enriched.requireBiometric || decision.requireBiometric,
  };

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(finalResponse),
  };
};

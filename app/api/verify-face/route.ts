import { NextResponse } from "next/server";
import {
  RekognitionClient,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";
import type { VerifyFaceRequest, VerifyFaceResponse } from "@/types/trustpay";

/** Ngưỡng độ khớp tối thiểu (Rekognition CompareFaces). */
const SIMILARITY_THRESHOLD = 80;

/**
 * Chế độ Demo (fail-open) CHỈ bật khi chạy `next dev` hoặc đặt rõ `TRUSTPAY_DEMO_MODE=1`
 * (vd. bản trình diễn hackathon). Mặc định — kể cả trên Vercel Production — là FAIL-CLOSED:
 * thiếu AWS, thiếu ảnh gốc đã đăng ký, không tìm thấy khuôn mặt hay dịch vụ lỗi → KHÔNG khớp.
 */
function isFaceDemoModeEnabled(): boolean {
  return process.env.TRUSTPAY_DEMO_MODE === "1" || process.env.NODE_ENV === "development";
}

const DEMO_MESSAGE = "Xác thực sinh trắc học AWS Rekognition thành công (Demo Mode)";
const MISMATCH_MESSAGE = "Khuôn mặt không khớp với hồ sơ sinh trắc học đã đăng ký.";
const UNAVAILABLE_MESSAGE =
  "Không xác thực được khuôn mặt (dịch vụ sinh trắc học chưa sẵn sàng hoặc chưa có ảnh gốc đã đăng ký). Giao dịch bị giữ lại.";

/**
 * Telemetry vận hành qua HTTP header (không chèn vào JSON hợp đồng):
 * `x-trustpay-engine` = `rekognition` | `offline-heuristic`, kèm `server-timing`.
 */
function faceTelemetryHeaders(
  engine: "rekognition" | "offline-heuristic",
  startedAt: number
): Record<string, string> {
  return {
    "x-trustpay-engine": engine,
    "server-timing": `rekognition;dur=${(performance.now() - startedAt).toFixed(1)}`,
    "cache-control": "no-store",
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let body: VerifyFaceRequest = { selfieBase64: "" };
  try {
    body = (await request.json()) as VerifyFaceRequest;
  } catch {
    // Giữ body mặc định nếu payload trống hoặc không hợp lệ
  }

  try {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";
    // Ảnh khuôn mặt gốc đã đăng ký (eKYC) trên S3 — KHÔNG so selfie với chính nó.
    const referenceBucket = process.env.AWS_S3_BUCKET_NAME;
    const referenceKey = process.env.AWS_FACE_REFERENCE_S3_KEY;

    if (!accessKeyId || !secretAccessKey || !body.selfieBase64 || !referenceBucket || !referenceKey) {
      throw new Error("Face verification unavailable: missing AWS credentials, selfie or enrolled reference image");
    }

    const rekognition = new RekognitionClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(process.env.AWS_SESSION_TOKEN
          ? { sessionToken: process.env.AWS_SESSION_TOKEN }
          : {}),
      },
    });

    const base64Clean = body.selfieBase64.replace(
      /^data:image\/\w+;base64,/,
      ""
    );
    const imageBytes = Buffer.from(base64Clean, "base64");

    const compareCommand = new CompareFacesCommand({
      SourceImage: { Bytes: imageBytes },
      TargetImage: { S3Object: { Bucket: referenceBucket, Name: referenceKey } },
      SimilarityThreshold: SIMILARITY_THRESHOLD,
    });

    const result = await rekognition.send(compareCommand);
    const topMatch = result.FaceMatches?.[0];
    // Không có khuôn mặt khớp → độ khớp 0 (fail-closed), không bao giờ tự gán giá trị "đẹp".
    const similarity =
      typeof topMatch?.Similarity === "number"
        ? Number(topMatch.Similarity.toFixed(2))
        : 0;
    const matched = similarity >= SIMILARITY_THRESHOLD;

    const response: VerifyFaceResponse = {
      matched,
      similarity,
      message: matched
        ? `Xác thực khuôn mặt thành công qua Amazon Rekognition (Độ khớp: ${similarity}%).`
        : MISMATCH_MESSAGE,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: faceTelemetryHeaders("rekognition", startedAt),
    });
  } catch {
    // Quy tắc dự án: vẫn trả HTTP 200 + đúng hợp đồng VerifyFaceResponse; nhưng chỉ chế độ Demo
    // được phép "khớp". Production → fail-closed để giao dịch rủi ro không lọt qua khi AWS lỗi.
    const fallbackResponse: VerifyFaceResponse = isFaceDemoModeEnabled()
      ? { matched: true, similarity: 98.4, message: DEMO_MESSAGE }
      : { matched: false, similarity: 0, message: UNAVAILABLE_MESSAGE };

    return NextResponse.json(fallbackResponse, {
      status: 200,
      headers: faceTelemetryHeaders("offline-heuristic", startedAt),
    });
  }
}

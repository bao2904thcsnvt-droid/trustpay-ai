/**
 * Lambda Production cho POST /api/verify-face của TrustPay AI.
 *
 * Khác với Demo Mode (fail-open) của ứng dụng: ở Production mặc định FAIL-CLOSED.
 * So khớp selfie với ẢNH THAM CHIẾU eKYC đã đăng ký (lưu S3, mã hóa KMS), không
 * so selfie với chính nó. Ảnh selfie chỉ tồn tại trong RAM, không ghi log.
 */

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { CompareFacesCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { VerifyFaceRequest, VerifyFaceResponse } from "@/types/trustpay";
import { CircuitBreaker, withTimeout } from "@/lib/resilience/circuit-breaker";

const region = process.env.AWS_REGION ?? "ap-southeast-1";
const threshold = Number(process.env.FACE_SIMILARITY_THRESHOLD ?? 90);
const demoMode = process.env.TRUSTPAY_DEMO_MODE === "true";
const faceBreaker = new CircuitBreaker("rekognition-compare", {
  failureThreshold: 5,
  coolDownMs: 30_000,
});

const FAIL_CLOSED: VerifyFaceResponse = {
  matched: false,
  similarity: 0,
  message: "Không thể xác thực khuôn mặt. Vui lòng chụp lại ảnh rõ nét, đủ sáng.",
};

const DEMO_OK: VerifyFaceResponse = {
  matched: true,
  similarity: 98.4,
  message: "Xác thực sinh trắc học (Demo Mode).",
};

async function loadReferenceImage(userRef: string): Promise<Uint8Array | null> {
  const bucket = process.env.REFERENCE_FACE_BUCKET;
  if (!bucket || !userRef) {
    return null;
  }
  try {
    const s3 = new S3Client({ region });
    const out = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: `reference-faces/${userRef}.jpg` }),
    );
    const body = out.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (body?.transformToByteArray) {
      return await body.transformToByteArray();
    }
    return null;
  } catch {
    return null;
  }
}

function json(body: VerifyFaceResponse) {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let req: VerifyFaceRequest = { selfieBase64: "" };
  try {
    req = JSON.parse(event.body ?? "{}") as VerifyFaceRequest;
  } catch {
    // giữ mặc định
  }

  if (!req.selfieBase64) {
    return json(demoMode ? DEMO_OK : FAIL_CLOSED);
  }

  const userRef = event.headers?.["x-user-ref"] ?? "";
  const selfieB64 = req.selfieBase64;

  const result = await faceBreaker.execute<VerifyFaceResponse>(
    async () => {
      const reference = await loadReferenceImage(userRef);
      if (!reference) {
        return demoMode ? DEMO_OK : FAIL_CLOSED;
      }
      const selfie = Buffer.from(selfieB64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const rek = new RekognitionClient({ region });
      const out = await withTimeout(
        rek.send(
          new CompareFacesCommand({
            SourceImage: { Bytes: reference },
            TargetImage: { Bytes: selfie },
            SimilarityThreshold: threshold,
          }),
        ),
        2500,
        "rekognition-compare-faces",
      );
      const top = out.FaceMatches?.[0];
      const similarity = typeof top?.Similarity === "number" ? Number(top.Similarity.toFixed(2)) : 0;
      const matched = similarity >= threshold;
      return {
        matched,
        similarity,
        message: matched
          ? `Xác thực khuôn mặt thành công qua Amazon Rekognition (Độ khớp: ${similarity}%).`
          : "Khuôn mặt không khớp với hồ sơ sinh trắc học đã đăng ký.",
      };
    },
    () => (demoMode ? DEMO_OK : FAIL_CLOSED),
  );

  return json(result);
};

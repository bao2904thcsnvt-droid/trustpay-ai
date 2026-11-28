import { NextResponse } from "next/server";
import {
  parseMomoIpnPayload,
  readBodyTextWithLimit,
  readMomoConfig,
  verifyMomoIpn,
} from "@/lib/payments/momo-gateway";

/**
 * IPN (Instant Payment Notification) của MoMo: MoMo gọi `POST` JSON tới `ipnUrl` khi giao dịch kết
 * thúc. Route chỉ xác minh chữ ký HMAC-SHA256 bằng cấu hình máy chủ rồi trả 204 (MoMo ngừng gửi lại).
 *
 *  - 204: chữ ký hợp lệ · 400: JSON hỏng / thiếu trường / sai kiểu / sai chữ ký
 *  - 413: thân quá lớn · 503: máy chủ chưa cấu hình MoMo
 *
 * Không lưu trữ, không ghi log (thân IPN chứa thông tin giao dịch).
 */

const MAX_IPN_BODY_BYTES = 16 * 1024;
const NO_STORE_HEADERS = { "cache-control": "no-store" };

type IpnErrorCode = "NOT_CONFIGURED" | "BODY_TOO_LARGE" | "INVALID_JSON" | "INVALID_PAYLOAD" | "INVALID_SIGNATURE";

function failure(status: 400 | 413 | 503, error: IpnErrorCode) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const config = readMomoConfig();
  if (!config) {
    return failure(503, "NOT_CONFIGURED");
  }

  const body = await readBodyTextWithLimit(request, MAX_IPN_BODY_BYTES);
  if (!body.ok) {
    return body.error === "BODY_TOO_LARGE" ? failure(413, "BODY_TOO_LARGE") : failure(400, "INVALID_JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failure(400, "INVALID_JSON");
  }

  const payload = parseMomoIpnPayload(parsed);
  if (!payload) {
    return failure(400, "INVALID_PAYLOAD");
  }
  if (!verifyMomoIpn(config, payload)) {
    return failure(400, "INVALID_SIGNATURE");
  }

  return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
}

import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { findInstitution, type PayeeInstitution } from "@/lib/payments/banks";
import {
  createMomoPayment,
  MOMO_MAX_AMOUNT,
  MOMO_MIN_AMOUNT,
  MomoGatewayError,
  readBodyTextWithLimit,
  readMomoConfig,
  sanitizeMomoOrderInfo,
  type MomoEnvironment,
} from "@/lib/payments/momo-gateway";
import {
  buildPayeeVietQr,
  isValidVietQrAmount,
  normalizeAccountNumber,
  sanitizeAccountName,
  sanitizeMemo,
  validatePayeeAccount,
  type PayeeDetails,
} from "@/lib/payments/vietqr-builder";
import { verifyEmvCrc } from "@/lib/qr/emvco";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";
import { bucketAmount } from "@/lib/security/pii-masking";

/**
 * API thanh toán phía máy chủ: MoMo Payment Gateway v2 ("captureWallet", HMAC-SHA256 thật) với
 * dự phòng VietQR EMVCo dựng cục bộ (non-custodial, NAPAS 247).
 *
 *  - GET  → `{ ok, momoConfigured, environment }` — chỉ trạng thái, không bao giờ lộ khóa.
 *  - POST → tạo giao dịch MoMo; chưa cấu hình / cổng lỗi / hết giờ / bị từ chối → VietQR, HTTP 200.
 *
 * Mọi phản hồi gắn `Cache-Control: no-store`. Log tối đa một dòng, đã ẩn danh (dải số tiền, mã
 * ngân hàng, mã đơn) — không log STK, SĐT, nội dung chuyển khoản hay khóa MoMo.
 */

/** MoMo yêu cầu timeout ≥ 30 s cho API tạo giao dịch → nới thời gian chạy tối đa của hàm (Vercel). */
export const maxDuration = 60;

const MAX_BODY_BYTES = 8 * 1024;
const NO_STORE_HEADERS = { "cache-control": "no-store" };
const DEFAULT_ORDER_INFO = "Thanh toán qua TrustPay AI";

type PaymentProvider = "AUTO" | "MOMO" | "VIETQR";
type PaymentMode = "MOMO_GATEWAY" | "LOCAL_VIETQR";
type PaymentEnvironment = MomoEnvironment | "local";
type PaymentFallbackReason = "NOT_CONFIGURED" | "GATEWAY_ERROR" | "GATEWAY_TIMEOUT" | "GATEWAY_REJECTED";
type PaymentErrorCode =
  | "INVALID_JSON"
  | "INVALID_AMOUNT"
  | "INVALID_PAYEE"
  | "PAYEE_REQUIRED"
  | "INVALID_PROVIDER"
  | "BODY_TOO_LARGE";

interface PaymentCreateSuccess {
  ok: true;
  mode: PaymentMode;
  environment: PaymentEnvironment;
  orderId: string;
  amount: number;
  memo: string;
  momo: {
    payUrl: string;
    deeplink: string | null;
    qrCodeUrl: string | null;
    resultCode: number;
    message: string;
  } | null;
  vietqr: {
    payload: string;
    bankBin: string;
    institutionCode: string;
    accountMasked: string;
    crcValid: boolean;
  } | null;
  fallbackReason: PaymentFallbackReason | null;
}

type PayeeParseResult =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "ok"; details: PayeeDetails; institution: PayeeInstitution };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(status: 400 | 413, error: PaymentErrorCode) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE_HEADERS });
}

function success(payload: PaymentCreateSuccess) {
  return NextResponse.json(payload, { status: 200, headers: NO_STORE_HEADERS });
}

function parseProvider(value: unknown): PaymentProvider | null {
  if (value === undefined || value === null) {
    return "AUTO";
  }
  return value === "AUTO" || value === "MOMO" || value === "VIETQR" ? value : null;
}

/** Người nhận: findInstitution + validatePayeeAccount + sanitizeAccountName (cùng luật với giao diện). */
function parsePayee(value: unknown): PayeeParseResult {
  if (value === undefined || value === null) {
    return { kind: "absent" };
  }
  if (!isRecord(value)) {
    return { kind: "invalid" };
  }
  const { institutionCode, accountNumber, accountName } = value;
  if (typeof institutionCode !== "string" || typeof accountNumber !== "string") {
    return { kind: "invalid" };
  }
  if (accountName !== undefined && accountName !== null && typeof accountName !== "string") {
    return { kind: "invalid" };
  }
  const institution = findInstitution(institutionCode.trim().toUpperCase());
  if (!institution || validatePayeeAccount(accountNumber, institution) !== "OK") {
    return { kind: "invalid" };
  }
  return {
    kind: "ok",
    institution,
    details: {
      institutionCode: institution.code,
      accountNumber: normalizeAccountNumber(accountNumber),
      accountName: sanitizeAccountName(typeof accountName === "string" ? accountName : ""),
    },
  };
}

/** Mã đơn duy nhất: "TP" + thời điểm (ms) + 8 ký tự hex ngẫu nhiên — hợp regex orderId của MoMo. */
function createOrderId(): string {
  return `TP${Date.now()}${randomBytes(4).toString("hex").toUpperCase()}`;
}

function classifyGatewayFailure(error: unknown): PaymentFallbackReason {
  if (error instanceof MomoGatewayError) {
    if (error.code === "TIMEOUT") {
      return "GATEWAY_TIMEOUT";
    }
    if (error.code === "REJECTED") {
      return "GATEWAY_REJECTED";
    }
  }
  return "GATEWAY_ERROR";
}

/** Mô tả lỗi cổng cho log (chỉ mã kỹ thuật, không kèm thông điệp hay dữ liệu đơn). */
function describeGatewayFailure(error: unknown): string {
  if (!(error instanceof MomoGatewayError)) {
    return "UNEXPECTED";
  }
  const parts: string[] = [error.code];
  if (error.resultCode !== null) {
    parts.push(`rc${error.resultCode}`);
  }
  if (error.httpStatus !== null) {
    parts.push(`http${error.httpStatus}`);
  }
  return parts.join("/");
}

function logOutcome(entry: {
  mode: PaymentMode;
  environment: PaymentEnvironment;
  fallbackReason: PaymentFallbackReason | null;
  gatewayNote: string;
  amount: number;
  institutionCode: string | null;
  orderId: string;
}): void {
  const gateway = entry.gatewayNote ? ` gateway=${entry.gatewayNote}` : "";
  console.info(
    `[payment/create] mode=${entry.mode} env=${entry.environment} fallback=${entry.fallbackReason ?? "none"}${gateway} amount=${bucketAmount(entry.amount)} bank=${entry.institutionCode ?? "none"} order=${entry.orderId}`,
  );
}

export async function GET(request: Request) {
  // Cache Components (Next 16): GET không chạm dữ liệu request có thể bị prerender lúc build →
  // trạng thái cấu hình bị "đóng băng" theo env lúc build. Truy cập `request.headers` là tín hiệu
  // Request-time (docs Route Handlers) nên env luôn được đọc lúc request. Route cũng export POST
  // nên Next 16.4 vốn không prerender route này — đây là lớp bảo đảm thứ hai.
  void request.headers;
  const config = readMomoConfig();
  return NextResponse.json(
    {
      ok: true,
      momoConfigured: config !== null,
      environment: config ? config.environment : "local",
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const body = await readBodyTextWithLimit(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.error === "BODY_TOO_LARGE" ? failure(413, "BODY_TOO_LARGE") : failure(400, "INVALID_JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failure(400, "INVALID_JSON");
  }
  if (!isRecord(parsed)) {
    return failure(400, "INVALID_JSON");
  }

  const provider = parseProvider(parsed.provider);
  if (!provider) {
    return failure(400, "INVALID_PROVIDER");
  }

  const amount = parsed.amount;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) {
    return failure(400, "INVALID_AMOUNT");
  }
  const momoAmountOk = amount >= MOMO_MIN_AMOUNT && amount <= MOMO_MAX_AMOUNT;
  // VietQR: 0 = mã tĩnh (người trả tự nhập số tiền).
  const vietQrAmountOk = amount === 0 || isValidVietQrAmount(amount);
  if (provider === "MOMO" ? !momoAmountOk : !vietQrAmountOk) {
    return failure(400, "INVALID_AMOUNT");
  }

  if (parsed.memo !== undefined && parsed.memo !== null && typeof parsed.memo !== "string") {
    return failure(400, "INVALID_JSON");
  }
  const rawMemo = typeof parsed.memo === "string" ? parsed.memo : "";

  const payee = parsePayee(parsed.payee);
  if (payee.kind === "invalid") {
    return failure(400, "INVALID_PAYEE");
  }

  const config = readMomoConfig();
  const orderId = createOrderId();
  // AUTO chỉ dùng MoMo khi số tiền nằm trong hạn mức MoMo; ngoài hạn mức (vd 0 = QR tĩnh) đi thẳng VietQR.
  const wantsMomo = provider === "MOMO" || (provider === "AUTO" && momoAmountOk);
  let fallbackReason: PaymentFallbackReason | null = null;
  let gatewayNote = "";

  if (wantsMomo && config) {
    const origin = new URL(request.url).origin;
    const orderInfo = sanitizeMomoOrderInfo(rawMemo) || sanitizeMomoOrderInfo(DEFAULT_ORDER_INFO);
    try {
      const momo = await createMomoPayment(config, {
        amount,
        orderInfo,
        orderId,
        requestId: randomUUID(),
        redirectUrl: config.redirectUrl ?? `${origin}/?momo=return`,
        ipnUrl: config.ipnUrl ?? `${origin}/api/payment/momo-ipn`,
      });
      logOutcome({
        mode: "MOMO_GATEWAY",
        environment: config.environment,
        fallbackReason: null,
        gatewayNote: "",
        amount,
        institutionCode: null,
        orderId,
      });
      return success({
        ok: true,
        mode: "MOMO_GATEWAY",
        environment: config.environment,
        orderId,
        amount,
        memo: orderInfo,
        momo: {
          payUrl: momo.payUrl,
          deeplink: momo.deeplink,
          qrCodeUrl: momo.qrCodeUrl,
          resultCode: momo.resultCode,
          message: momo.message,
        },
        vietqr: null,
        fallbackReason: null,
      });
    } catch (error) {
      fallbackReason = classifyGatewayFailure(error);
      gatewayNote = describeGatewayFailure(error);
    }
  } else if (wantsMomo) {
    fallbackReason = "NOT_CONFIGURED";
  }

  // Nhánh VietQR (chọn trực tiếp hoặc dự phòng) bắt buộc có người nhận hợp lệ.
  if (payee.kind !== "ok") {
    return failure(400, "PAYEE_REQUIRED");
  }

  const memo = sanitizeMemo(rawMemo);
  let payload: string;
  try {
    payload = buildPayeeVietQr(payee.details, amount > 0 ? amount : null, memo);
  } catch {
    return failure(400, "INVALID_PAYEE");
  }

  logOutcome({
    mode: "LOCAL_VIETQR",
    environment: "local",
    fallbackReason,
    gatewayNote,
    amount,
    institutionCode: payee.institution.code,
    orderId,
  });
  return success({
    ok: true,
    mode: "LOCAL_VIETQR",
    environment: "local",
    orderId,
    amount,
    memo,
    momo: null,
    vietqr: {
      payload,
      bankBin: payee.institution.bin,
      institutionCode: payee.institution.code,
      accountMasked: maskRecipientForDisplay(payee.details.accountNumber),
      crcValid: verifyEmvCrc(payload).valid,
    },
    fallbackReason,
  });
}

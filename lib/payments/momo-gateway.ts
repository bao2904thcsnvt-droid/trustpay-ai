import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cổng MoMo Payment Gateway v2 — luồng One-Time "captureWallet" (CHỈ chạy trên máy chủ).
 *
 * Đặc tả đối chiếu với tài liệu chính thức developers.momo.vn (v3 › Payment › Wallet ›
 * One-Time Payments; Result Handling › Payment Notification):
 *  - `POST /v2/gateway/api/create`, MoMo khuyến nghị timeout tối thiểu 30 giây.
 *  - amount Long 1.000–50.000.000 VND · orderId String(200) theo regex MoMo · requestId String(50)
 *    · orderInfo String(255) · extraData String(1000) base64 · lang "vi" | "en".
 *  - Chữ ký HMAC-SHA256 (hex) trên chuỗi `key=value` nối bằng `&`, khóa xếp a→z, giá trị THÔ
 *    (không mã hóa URL). Phản hồi trả `payUrl`, `deeplink`, `qrCodeUrl` (dữ liệu QR, KHÔNG phải
 *    URL ảnh), `resultCode` (0 = thành công), `message`.
 *  - IPN: MoMo gọi `POST ipnUrl` (application/json); đối tác trả HTTP 204.
 *
 * Bảo mật: khóa chỉ đọc từ `process.env` (không hardcode). `MomoConfig` chứa `secretKey` nên
 * TUYỆT ĐỐI không trả về client hay ghi log. Không import file này vào Client Component.
 */

export type MomoEnvironment = "sandbox" | "production";

export const MOMO_SANDBOX_ENDPOINT = "https://test-payment.momo.vn/v2/gateway/api/create";
export const MOMO_PRODUCTION_ENDPOINT = "https://payment.momo.vn/v2/gateway/api/create";
export const MOMO_REQUEST_TYPE = "captureWallet";
/** Ngôn ngữ thông điệp MoMo trả về ("vi" | "en"). */
export const MOMO_LANG = "vi";
export const MOMO_MIN_AMOUNT = 1_000;
export const MOMO_MAX_AMOUNT = 50_000_000;
export const MOMO_ORDER_ID_MAX = 200;
export const MOMO_REQUEST_ID_MAX = 50;
export const MOMO_ORDER_INFO_MAX = 255;
export const MOMO_EXTRA_DATA_MAX = 1_000;
/** Tài liệu MoMo: timeout tối thiểu 30 giây khi gọi API tạo giao dịch. */
export const MOMO_DEFAULT_TIMEOUT_MS = 30_000;

const MOMO_PARTNER_CODE_MAX = 50;
const MOMO_STORE_ID_MAX = 50;
const MOMO_STORE_NAME_MAX = 255;
const MOMO_IPN_TEXT_MAX = 1_000;
const MOMO_IPN_TOKEN_MAX = 50;
const MOMO_MESSAGE_MAX = 500;
const MOMO_LINK_MAX = 2_048;
const MOMO_QR_DATA_MAX = 1_024;
const MAX_TIMEOUT_MS = 120_000;
const MAX_RESPONSE_CHARS = 64 * 1024;

/** ASCII in được, không khoảng trắng, không "&" — giá trị nằm trong chuỗi ký nên không được chứa dấu phân tách. */
const SIGNED_TOKEN = /^[\x21-\x25\x27-\x7E]+$/;
/** ASCII in được, không khoảng trắng (khóa bí mật / storeId). */
const PRINTABLE_TOKEN = /^[\x21-\x7E]+$/;
const BASE64_TEXT = /^[A-Za-z0-9+/]*={0,2}$/;
const REQUEST_ID_TEXT = /^[0-9A-Za-z_.:-]+$/;
const HEX_SIGNATURE = /^[0-9a-fA-F]{64}$/;
const DIGITS = /^\d{1,19}$/;

export interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  /** Khóa HMAC — chỉ dùng để ký/xác minh trên máy chủ. */
  secretKey: string;
  environment: MomoEnvironment;
  endpoint: string;
  /** `null` → route tự dựng từ origin của request. */
  redirectUrl: string | null;
  ipnUrl: string | null;
  /** Gửi sang MoMo dưới trường `storeName` (tài liệu captureWallet v3 không có `partnerName`). */
  partnerName: string | null;
  storeId: string | null;
}

export type MomoGatewayErrorCode = "TIMEOUT" | "HTTP" | "REJECTED" | "BAD_RESPONSE";

/** Lỗi có kiểu của cổng MoMo — route chuyển thành `fallbackReason` để dự phòng VietQR. */
export class MomoGatewayError extends Error {
  readonly code: MomoGatewayErrorCode;
  readonly httpStatus: number | null;
  readonly resultCode: number | null;

  constructor(
    code: MomoGatewayErrorCode,
    message: string,
    details: { httpStatus?: number | null; resultCode?: number | null } = {},
  ) {
    super(message);
    this.name = "MomoGatewayError";
    this.code = code;
    this.httpStatus = details.httpStatus ?? null;
    this.resultCode = details.resultCode ?? null;
  }
}

export interface MomoCreateSignatureFields {
  accessKey: string;
  amount: number | string;
  extraData: string;
  ipnUrl: string;
  orderId: string;
  orderInfo: string;
  partnerCode: string;
  redirectUrl: string;
  requestId: string;
  requestType: string;
}

export interface MomoCreatePaymentInput {
  /** VND, số nguyên 1.000–50.000.000. */
  amount: number;
  /** Đã qua `sanitizeMomoOrderInfo` (khác rỗng, ≤ 255, không ký tự điều khiển / "&"). */
  orderInfo: string;
  orderId: string;
  requestId: string;
  redirectUrl: string;
  ipnUrl: string;
  /** Base64 của JSON, ≤ 1000 ký tự; mặc định "". */
  extraData?: string;
}

export interface MomoCreatePaymentOptions {
  /** Mặc định 30 000 ms theo khuyến nghị MoMo; tối đa 120 000 ms. */
  timeoutMs?: number;
  /** Thay `fetch` (kiểm thử). Mặc định dùng `fetch` toàn cục. */
  fetchImpl?: typeof fetch;
}

export interface MomoCreatePaymentResult {
  /** HTTPS thuộc momo.vn (đã kiểm tra). */
  payUrl: string;
  /** `momo://…` hoặc HTTPS momo.vn; Production cần MoMo cấp quyền mới có. */
  deeplink: string | null;
  /** Chuỗi dữ liệu QR (EMVCo) để tự vẽ mã — KHÔNG phải URL ảnh. */
  qrCodeUrl: string | null;
  resultCode: number;
  message: string;
  orderId: string;
  requestId: string;
  amount: number;
  responseTime: number | null;
}

/** Thân IPN MoMo gửi tới `ipnUrl` (đã kiểm tra kiểu). Số giữ nguyên dạng gửi đến để ký lại chính xác. */
export interface MomoIpnPayload {
  partnerCode: string;
  orderId: string;
  requestId: string;
  amount: number | string;
  orderInfo: string;
  orderType: string;
  transId: number | string;
  resultCode: number | string;
  message: string;
  payType: string;
  responseTime: number | string;
  extraData: string;
  signature: string;
}

export interface MomoIpnSignatureFields extends Omit<MomoIpnPayload, "signature"> {
  accessKey: string;
}

export type BodyTextResult =
  | { ok: true; text: string }
  | { ok: false; error: "BODY_TOO_LARGE" | "UNREADABLE_BODY" };

function readEnvValue(env: Readonly<Record<string, string | undefined>>, name: string): string | null {
  const value = env[name];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isMomoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "momo.vn" || host.endsWith(".momo.vn");
}

/** HTTPS, tên miền thuộc momo.vn, không user:pass, không cổng lạ. */
function isMomoHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && url.port === "" && isMomoHost(url.hostname);
}

function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && url.hostname !== "";
}

/** Ký tự điều khiển (C0/C1), ký tự định dạng ẩn / đảo chiều bidi, và surrogate lẻ. */
function isStrippedCodePoint(cp: number): boolean {
  return (
    cp <= 0x1f ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0xad ||
    cp === 0x61c ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0xfeff ||
    (cp >= 0xd800 && cp <= 0xdfff)
  );
}

function hasStrippedCodePoint(value: string): boolean {
  for (const ch of value) {
    if (isStrippedCodePoint(ch.codePointAt(0) ?? 0)) {
      return true;
    }
  }
  return false;
}

/** Cắt theo số đơn vị UTF-16 (cách MoMo đếm độ dài chuỗi) mà không tách đôi cặp surrogate. */
function truncateUtf16(text: string, maxUnits: number): string {
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > maxUnits) {
      break;
    }
    out += ch;
  }
  return out;
}

function cleanText(raw: string, maxUnits: number, dropAmpersand: boolean): string {
  let replaced = "";
  for (const ch of raw.normalize("NFC")) {
    const stripped = isStrippedCodePoint(ch.codePointAt(0) ?? 0) || (dropAmpersand && ch === "&");
    replaced += stripped ? " " : ch;
  }
  return truncateUtf16(replaced.replace(/\s+/g, " ").trim(), maxUnits).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Đọc cấu hình MoMo từ biến môi trường. Thiếu khóa bắt buộc hoặc cấu hình sai (MOMO_ENV lạ,
 * MOMO_ENDPOINT không phải HTTPS momo.vn, URL lỗi…) → `null` (coi như chưa cấu hình → VietQR).
 */
export function readMomoConfig(env: Readonly<Record<string, string | undefined>> = process.env): MomoConfig | null {
  const partnerCode = readEnvValue(env, "MOMO_PARTNER_CODE");
  const accessKey = readEnvValue(env, "MOMO_ACCESS_KEY");
  const secretKey = readEnvValue(env, "MOMO_SECRET_KEY");
  if (!partnerCode || !accessKey || !secretKey) {
    return null;
  }
  if (
    partnerCode.length > MOMO_PARTNER_CODE_MAX ||
    !SIGNED_TOKEN.test(partnerCode) ||
    accessKey.length > 128 ||
    !SIGNED_TOKEN.test(accessKey) ||
    secretKey.length > 256 ||
    !PRINTABLE_TOKEN.test(secretKey)
  ) {
    return null;
  }

  const environmentRaw = (readEnvValue(env, "MOMO_ENV") ?? "sandbox").toLowerCase();
  const environment: MomoEnvironment | null =
    environmentRaw === "sandbox" ? "sandbox" : environmentRaw === "production" ? "production" : null;
  if (!environment) {
    return null;
  }

  const customEndpoint = readEnvValue(env, "MOMO_ENDPOINT");
  if (customEndpoint && !isMomoHttpsUrl(customEndpoint)) {
    return null;
  }
  const endpoint = customEndpoint ?? (environment === "production" ? MOMO_PRODUCTION_ENDPOINT : MOMO_SANDBOX_ENDPOINT);

  const redirectUrl = readEnvValue(env, "MOMO_REDIRECT_URL");
  const ipnUrl = readEnvValue(env, "MOMO_IPN_URL");
  if ((redirectUrl && !isHttpUrl(redirectUrl)) || (ipnUrl && !isHttpUrl(ipnUrl))) {
    return null;
  }

  const storeId = readEnvValue(env, "MOMO_STORE_ID");
  if (storeId && (storeId.length > MOMO_STORE_ID_MAX || !PRINTABLE_TOKEN.test(storeId))) {
    return null;
  }
  const partnerNameRaw = readEnvValue(env, "MOMO_PARTNER_NAME");
  const partnerName = partnerNameRaw ? cleanText(partnerNameRaw, MOMO_STORE_NAME_MAX, false) || null : null;

  return { partnerCode, accessKey, secretKey, environment, endpoint, redirectUrl, ipnUrl, partnerName, storeId };
}

/** HMAC-SHA256 (hex thường) của chuỗi ký với secretKey. */
export function signMomo(rawSignature: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(rawSignature, "utf8").digest("hex");
}

/** So khớp chữ ký thời gian hằng (timingSafeEqual); độ dài khác → false. Chấp nhận hex in hoa. */
export function verifyMomoSignature(rawSignature: string, signature: string, secretKey: string): boolean {
  if (typeof signature !== "string") {
    return false;
  }
  const expected = Buffer.from(signMomo(rawSignature, secretKey), "utf8");
  const provided = Buffer.from(signature.toLowerCase(), "utf8");
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

/** Chuỗi ký yêu cầu tạo giao dịch (khóa xếp a→z, giá trị thô). */
export function buildMomoCreateRawSignature(fields: MomoCreateSignatureFields): string {
  return [
    `accessKey=${fields.accessKey}`,
    `amount=${fields.amount}`,
    `extraData=${fields.extraData}`,
    `ipnUrl=${fields.ipnUrl}`,
    `orderId=${fields.orderId}`,
    `orderInfo=${fields.orderInfo}`,
    `partnerCode=${fields.partnerCode}`,
    `redirectUrl=${fields.redirectUrl}`,
    `requestId=${fields.requestId}`,
    `requestType=${fields.requestType}`,
  ].join("&");
}

/** Chuỗi ký của IPN (accessKey lấy từ cấu hình, không có trong thân IPN). */
export function buildMomoIpnRawSignature(fields: MomoIpnSignatureFields): string {
  return [
    `accessKey=${fields.accessKey}`,
    `amount=${fields.amount}`,
    `extraData=${fields.extraData}`,
    `message=${fields.message}`,
    `orderId=${fields.orderId}`,
    `orderInfo=${fields.orderInfo}`,
    `orderType=${fields.orderType}`,
    `partnerCode=${fields.partnerCode}`,
    `payType=${fields.payType}`,
    `requestId=${fields.requestId}`,
    `responseTime=${fields.responseTime}`,
    `resultCode=${fields.resultCode}`,
    `transId=${fields.transId}`,
  ].join("&");
}

/**
 * orderId theo regex MoMo `^[0-9a-zA-Z]([-_.]*[0-9a-zA-Z]+)*$`, ≤ 200 ký tự. Kiểm tra bằng 3 biểu
 * thức tuyến tính tương đương (regex gốc lồng lượng từ → nguy cơ ReDoS với đầu vào IPN).
 */
export function isValidMomoOrderId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MOMO_ORDER_ID_MAX &&
    /^[0-9A-Za-z_.-]+$/.test(value) &&
    /^[0-9A-Za-z]/.test(value) &&
    /[0-9A-Za-z]$/.test(value)
  );
}

/**
 * Nội dung đơn hàng MoMo: chuẩn hóa NFC, bỏ ký tự điều khiển / định dạng ẩn, thay "&" (dấu
 * phân tách của chuỗi ký) bằng khoảng trắng, gộp khoảng trắng, ≤ 255 đơn vị UTF-16. Giữ dấu tiếng Việt.
 */
export function sanitizeMomoOrderInfo(raw: string): string {
  return cleanText(raw, MOMO_ORDER_INFO_MAX, true);
}

function assertCreateInput(input: MomoCreatePaymentInput, extraData: string): void {
  if (!Number.isSafeInteger(input.amount) || input.amount < MOMO_MIN_AMOUNT || input.amount > MOMO_MAX_AMOUNT) {
    throw new RangeError(`Số tiền MoMo phải là số nguyên từ ${MOMO_MIN_AMOUNT} đến ${MOMO_MAX_AMOUNT} VND`);
  }
  if (!isValidMomoOrderId(input.orderId)) {
    throw new RangeError("orderId không đúng định dạng MoMo");
  }
  if (
    typeof input.requestId !== "string" ||
    input.requestId.length > MOMO_REQUEST_ID_MAX ||
    !REQUEST_ID_TEXT.test(input.requestId)
  ) {
    throw new RangeError("requestId không hợp lệ (≤ 50 ký tự)");
  }
  if (typeof input.orderInfo !== "string" || !input.orderInfo || sanitizeMomoOrderInfo(input.orderInfo) !== input.orderInfo) {
    throw new RangeError("orderInfo phải qua sanitizeMomoOrderInfo và khác rỗng");
  }
  if (!isHttpUrl(input.redirectUrl) || !isHttpUrl(input.ipnUrl)) {
    throw new RangeError("redirectUrl / ipnUrl phải là URL http(s) hợp lệ");
  }
  if (extraData.length > MOMO_EXTRA_DATA_MAX || !BASE64_TEXT.test(extraData)) {
    throw new RangeError("extraData phải là chuỗi base64 ≤ 1000 ký tự");
  }
}

function resolveTimeout(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return MOMO_DEFAULT_TIMEOUT_MS;
  }
  return Math.max(1, Math.min(Math.floor(value), MAX_TIMEOUT_MS));
}

interface HttpExchange {
  status: number;
  ok: boolean;
  text: string;
}

/** Gửi yêu cầu + đọc thân phản hồi trong cùng một ngân sách thời gian (AbortController). */
async function exchangeWithTimeout(
  endpoint: string,
  body: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<HttpExchange> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new MomoGatewayError("TIMEOUT", `Cổng MoMo không phản hồi trong ${timeoutMs} ms`));
    }, timeoutMs);
  });
  const work = (async (): Promise<HttpExchange> => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
      signal: controller.signal,
      // Không theo chuyển hướng: thân đã ký chỉ được gửi tới đúng endpoint momo.vn.
      redirect: "error",
    });
    const text = await response.text();
    return { status: response.status, ok: response.ok, text };
  })();

  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (error instanceof MomoGatewayError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new MomoGatewayError("TIMEOUT", `Cổng MoMo không phản hồi trong ${timeoutMs} ms`);
    }
    throw new MomoGatewayError("HTTP", "Không kết nối được tới cổng MoMo");
  } finally {
    clearTimeout(timer);
  }
}

function pickDeeplink(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > MOMO_LINK_MAX || /\s/.test(value) || hasStrippedCodePoint(value)) {
    return null;
  }
  return value.startsWith("momo://") || isMomoHttpsUrl(value) ? value : null;
}

function pickQrData(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > MOMO_QR_DATA_MAX || hasStrippedCodePoint(value)) {
    return null;
  }
  return value;
}

function interpretCreateResponse(
  exchange: HttpExchange,
  config: MomoConfig,
  input: MomoCreatePaymentInput,
): MomoCreatePaymentResult {
  const httpStatus = exchange.status;
  if (exchange.text.length > MAX_RESPONSE_CHARS) {
    throw new MomoGatewayError("BAD_RESPONSE", "Phản hồi MoMo vượt kích thước cho phép", { httpStatus });
  }
  const data = parseJsonObject(exchange.text);
  const resultCode =
    data && typeof data.resultCode === "number" && Number.isInteger(data.resultCode) ? data.resultCode : null;
  const message = data && typeof data.message === "string" ? cleanText(data.message, MOMO_MESSAGE_MAX, false) : "";

  if (!exchange.ok) {
    if (resultCode !== null && resultCode !== 0) {
      throw new MomoGatewayError("REJECTED", message || `MoMo từ chối giao dịch (resultCode ${resultCode})`, {
        httpStatus,
        resultCode,
      });
    }
    throw new MomoGatewayError("HTTP", `Cổng MoMo trả về HTTP ${httpStatus}`, { httpStatus });
  }
  if (!data || resultCode === null) {
    throw new MomoGatewayError("BAD_RESPONSE", "Phản hồi MoMo thiếu resultCode dạng số", { httpStatus });
  }
  if (resultCode !== 0) {
    throw new MomoGatewayError("REJECTED", message || `MoMo từ chối giao dịch (resultCode ${resultCode})`, {
      httpStatus,
      resultCode,
    });
  }

  // Phản hồi phải khớp đúng đơn hàng vừa ký (chống nhầm lẫn / phát lại phản hồi khác).
  const mismatched =
    (data.orderId !== undefined && data.orderId !== input.orderId) ||
    (data.requestId !== undefined && data.requestId !== input.requestId) ||
    (data.partnerCode !== undefined && data.partnerCode !== config.partnerCode) ||
    (data.amount !== undefined && Number(data.amount) !== input.amount);
  if (mismatched) {
    throw new MomoGatewayError("BAD_RESPONSE", "Phản hồi MoMo không khớp đơn hàng đã gửi", { httpStatus, resultCode });
  }

  const payUrl =
    typeof data.payUrl === "string" && data.payUrl.length <= MOMO_LINK_MAX && isMomoHttpsUrl(data.payUrl)
      ? data.payUrl
      : null;
  if (!payUrl) {
    throw new MomoGatewayError("BAD_RESPONSE", "payUrl không phải HTTPS thuộc momo.vn", { httpStatus, resultCode });
  }

  return {
    payUrl,
    deeplink: pickDeeplink(data.deeplink),
    qrCodeUrl: pickQrData(data.qrCodeUrl),
    resultCode,
    message,
    orderId: input.orderId,
    requestId: input.requestId,
    amount: input.amount,
    responseTime:
      typeof data.responseTime === "number" && Number.isSafeInteger(data.responseTime) ? data.responseTime : null,
  };
}

/**
 * Tạo giao dịch MoMo "captureWallet". Đầu vào sai → `RangeError`; lỗi cổng →
 * `MomoGatewayError` (TIMEOUT | HTTP | REJECTED | BAD_RESPONSE). Không ghi log, không trả secret.
 */
export async function createMomoPayment(
  config: MomoConfig,
  input: MomoCreatePaymentInput,
  opts: MomoCreatePaymentOptions = {},
): Promise<MomoCreatePaymentResult> {
  const extraData = input.extraData ?? "";
  assertCreateInput(input, extraData);

  const rawSignature = buildMomoCreateRawSignature({
    accessKey: config.accessKey,
    amount: input.amount,
    extraData,
    ipnUrl: input.ipnUrl,
    orderId: input.orderId,
    orderInfo: input.orderInfo,
    partnerCode: config.partnerCode,
    redirectUrl: input.redirectUrl,
    requestId: input.requestId,
    requestType: MOMO_REQUEST_TYPE,
  });

  // Theo bảng tham số v3: không gửi accessKey/secretKey trong thân (accessKey chỉ nằm trong chuỗi ký).
  const requestBody: Record<string, string | number> = {
    partnerCode: config.partnerCode,
    ...(config.partnerName ? { storeName: config.partnerName } : {}),
    ...(config.storeId ? { storeId: config.storeId } : {}),
    requestId: input.requestId,
    amount: input.amount,
    orderId: input.orderId,
    orderInfo: input.orderInfo,
    redirectUrl: input.redirectUrl,
    ipnUrl: input.ipnUrl,
    requestType: MOMO_REQUEST_TYPE,
    extraData,
    lang: MOMO_LANG,
    signature: signMomo(rawSignature, config.secretKey),
  };

  const exchange = await exchangeWithTimeout(
    config.endpoint,
    JSON.stringify(requestBody),
    resolveTimeout(opts.timeoutMs),
    opts.fetchImpl ?? fetch,
  );
  return interpretCreateResponse(exchange, config, input);
}

function pickToken(value: unknown, maxLength: number, allowEmpty: boolean): string | null {
  if (typeof value !== "string" || value.length > maxLength) {
    return null;
  }
  if (value === "") {
    return allowEmpty ? value : null;
  }
  return SIGNED_TOKEN.test(value) ? value : null;
}

function pickInteger(value: unknown): number | string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return typeof value === "string" && DIGITS.test(value) ? value : null;
}

/**
 * Kiểm tra kiểu thân IPN (đủ 13 trường ký + signature). Ngoài `message`, các chuỗi không được
 * chứa "&" và các số phải là số nguyên → không thể dời ranh giới trường trong chuỗi ký.
 * Thiếu / sai kiểu → `null`.
 */
export function parseMomoIpnPayload(body: unknown): MomoIpnPayload | null {
  if (!isRecord(body)) {
    return null;
  }
  const partnerCode = pickToken(body.partnerCode, MOMO_PARTNER_CODE_MAX, false);
  const orderId = typeof body.orderId === "string" && isValidMomoOrderId(body.orderId) ? body.orderId : null;
  const requestId = pickToken(body.requestId, MOMO_REQUEST_ID_MAX, false);
  const orderType = pickToken(body.orderType, MOMO_IPN_TOKEN_MAX, true);
  const payType = pickToken(body.payType, MOMO_IPN_TOKEN_MAX, true);
  const orderInfo =
    typeof body.orderInfo === "string" && body.orderInfo.length <= MOMO_IPN_TEXT_MAX && !body.orderInfo.includes("&")
      ? body.orderInfo
      : null;
  const message = typeof body.message === "string" && body.message.length <= MOMO_IPN_TEXT_MAX ? body.message : null;
  const extraData =
    typeof body.extraData === "string" && body.extraData.length <= MOMO_EXTRA_DATA_MAX && BASE64_TEXT.test(body.extraData)
      ? body.extraData
      : null;
  const amount = pickInteger(body.amount);
  const transId = pickInteger(body.transId);
  const resultCode = pickInteger(body.resultCode);
  const responseTime = pickInteger(body.responseTime);
  const signature = typeof body.signature === "string" && HEX_SIGNATURE.test(body.signature) ? body.signature : null;

  if (
    partnerCode === null ||
    orderId === null ||
    requestId === null ||
    orderType === null ||
    payType === null ||
    orderInfo === null ||
    message === null ||
    extraData === null ||
    amount === null ||
    transId === null ||
    resultCode === null ||
    responseTime === null ||
    signature === null
  ) {
    return null;
  }
  return {
    partnerCode,
    orderId,
    requestId,
    amount,
    orderInfo,
    orderType,
    transId,
    resultCode,
    message,
    payType,
    responseTime,
    extraData,
    signature,
  };
}

/** IPN hợp lệ khi đúng partnerCode của cấu hình và chữ ký HMAC khớp. */
export function verifyMomoIpn(
  config: Pick<MomoConfig, "partnerCode" | "accessKey" | "secretKey">,
  payload: MomoIpnPayload,
): boolean {
  if (payload.partnerCode !== config.partnerCode) {
    return false;
  }
  const rawSignature = buildMomoIpnRawSignature({
    accessKey: config.accessKey,
    amount: payload.amount,
    extraData: payload.extraData,
    message: payload.message,
    orderId: payload.orderId,
    orderInfo: payload.orderInfo,
    orderType: payload.orderType,
    partnerCode: payload.partnerCode,
    payType: payload.payType,
    requestId: payload.requestId,
    responseTime: payload.responseTime,
    resultCode: payload.resultCode,
    transId: payload.transId,
  });
  return verifyMomoSignature(rawSignature, payload.signature, config.secretKey);
}

/**
 * Đọc thân request dạng UTF-8 với trần số byte (kiểm tra cả `content-length` lẫn luồng thực tế,
 * dừng đọc ngay khi vượt trần). UTF-8 lỗi / luồng lỗi → `UNREADABLE_BODY`.
 */
export async function readBodyTextWithLimit(request: Request, maxBytes: number): Promise<BodyTextResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared.trim()) > maxBytes) {
    return { ok: false, error: "BODY_TOO_LARGE" };
  }
  const stream = request.body;
  if (!stream) {
    return { ok: true, text: "" };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "BODY_TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "UNREADABLE_BODY" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: "UNREADABLE_BODY" };
  }
}

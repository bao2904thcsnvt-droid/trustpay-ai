import { findInstitution, findInstitutionByBin, type PayeeInstitutionCode } from "@/lib/payments/banks";
import {
  normalizeAccountNumber,
  sanitizeAccountName,
  sanitizeMemo,
  validatePayeeAccount,
} from "@/lib/payments/vietqr-builder";
import type { DecisionToken } from "@/lib/sdk/decision-token";

/**
 * Cầu nối Host App ↔ TrustPay AI SDK qua `window.postMessage`.
 *
 *  - SDK → Host: Decision Token (`TRUSTPAY_SDK_DECISION`). Chỉ gửi tới origin Host
 *    đã khai báo (`?hostOrigin=` hoặc `document.referrer`), KHÔNG BAO GIỜ dùng "*".
 *  - Host → SDK: yêu cầu kiểm duyệt trước bước xác nhận (`TRUSTPAY_HOST_TRANSFER_REQUEST`).
 *    Dữ liệu từ Host là KHÔNG tin cậy → kiểm tra kiểu, giới hạn độ dài, chuẩn hóa.
 */

export const HOST_REQUEST_TYPE = "TRUSTPAY_HOST_TRANSFER_REQUEST";
export const SDK_DOM_EVENT = "trustpay:sdk-decision";
export const HOST_MAX_AMOUNT = 500_000_000;

export type PostResult = "POSTED" | "NOT_EMBEDDED" | "NO_TRUSTED_ORIGIN" | "ERROR";

/** Chỉ chấp nhận origin https, hoặc http trên localhost / 127.0.0.1 (môi trường phát triển). */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && isLocal)) {
      return url.origin;
    }
  } catch {
    // URL không hợp lệ → bỏ qua.
  }
  return null;
}

/**
 * Danh sách origin Host được phép (Production): biến môi trường
 * `NEXT_PUBLIC_TRUSTPAY_HOST_ORIGINS` (phân tách bằng dấu phẩy), ví dụ
 * `https://momo.vn,https://partner-bank.vn`. Để trống = chế độ Demo (chấp nhận
 * `?hostOrigin=` hoặc referrer hợp lệ).
 */
const HOST_ORIGIN_ALLOWLIST_RAW = process.env.NEXT_PUBLIC_TRUSTPAY_HOST_ORIGINS ?? "";

export function configuredHostAllowlist(): string[] {
  return HOST_ORIGIN_ALLOWLIST_RAW.split(",")
    .map((item) => normalizeOrigin(item.trim()))
    .filter((item): item is string => item !== null);
}

/** Origin của Host App: ưu tiên `?hostOrigin=`, sau đó `document.referrer`; phải thuộc allowlist nếu có cấu hình. */
export function resolveHostOrigin(
  search: string,
  referrer: string,
  allowlist: readonly string[] = configuredHostAllowlist(),
): string | null {
  const params = new URLSearchParams(search);
  const candidate = normalizeOrigin(params.get("hostOrigin")) ?? normalizeOrigin(referrer);
  if (!candidate) {
    return null;
  }
  return allowlist.length > 0 && !allowlist.includes(candidate) ? null : candidate;
}

/** `?embed=momo` → bật giao diện nhúng tinh gọn. */
export function isEmbedRequested(search: string): boolean {
  const value = new URLSearchParams(search).get("embed");
  return value !== null && value.trim().toLowerCase() === "momo";
}

export interface HostTransferRequest {
  requestId: string;
  amount: number;
  institutionCode: PayeeInstitutionCode;
  accountNumber: string;
  accountName: string;
  memo: string;
}

/** Kiểm tra & chuẩn hóa yêu cầu từ Host; sai bất kỳ trường bắt buộc nào → null. */
export function parseHostTransferRequest(data: unknown): HostTransferRequest | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (record.type !== HOST_REQUEST_TYPE) {
    return null;
  }
  const requestId =
    typeof record.requestId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(record.requestId) ? record.requestId : null;
  const transfer =
    typeof record.transfer === "object" && record.transfer !== null ? (record.transfer as Record<string, unknown>) : null;
  if (!requestId || !transfer) {
    return null;
  }

  const amount =
    typeof transfer.amount === "number" &&
    Number.isInteger(transfer.amount) &&
    transfer.amount > 0 &&
    transfer.amount <= HOST_MAX_AMOUNT
      ? transfer.amount
      : null;

  const institution =
    typeof transfer.bankBin === "string"
      ? findInstitutionByBin(transfer.bankBin.trim())
      : typeof transfer.bankCode === "string"
        ? findInstitution(transfer.bankCode.trim().toUpperCase())
        : undefined;

  const accountNumber =
    typeof transfer.accountNumber === "string" ? normalizeAccountNumber(transfer.accountNumber.slice(0, 32)) : "";

  if (amount === null || !institution || validatePayeeAccount(accountNumber, institution) !== "OK") {
    return null;
  }

  return {
    requestId,
    amount,
    institutionCode: institution.code,
    accountNumber,
    accountName: typeof transfer.accountName === "string" ? sanitizeAccountName(transfer.accountName.slice(0, 120)) : "",
    memo: typeof transfer.memo === "string" ? sanitizeMemo(transfer.memo.slice(0, 120)) : "",
  };
}

function formatVndDots(amount: number): string {
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Câu lệnh tiếng Việt chuẩn cho Lá chắn AI từ yêu cầu của Host (STK được nối thêm khi phân tích). */
export function buildHostCommandText(request: HostTransferRequest): string {
  const memo = request.memo ? ` ${request.memo}` : "";
  const name = request.accountName ? ` cho ${request.accountName}` : "";
  return `Chuyển ${formatVndDots(request.amount)}đ${memo}${name}`.trim();
}

/** Gửi Decision Token cho Host App thật (iframe/webview) + phát DOM event cho Host mô phỏng trong trang. */
export function deliverDecisionToken(token: DecisionToken, hostOrigin: string | null): PostResult {
  if (typeof window === "undefined") {
    return "NOT_EMBEDDED";
  }
  try {
    window.dispatchEvent(new CustomEvent<DecisionToken>(SDK_DOM_EVENT, { detail: token }));
  } catch {
    // Trình duyệt cũ không hỗ trợ CustomEvent → bỏ qua, không chặn luồng chính.
  }
  if (window.parent === window) {
    return "NOT_EMBEDDED";
  }
  if (!hostOrigin) {
    return "NO_TRUSTED_ORIGIN";
  }
  try {
    window.parent.postMessage(token, hostOrigin);
    return "POSTED";
  } catch {
    return "ERROR";
  }
}

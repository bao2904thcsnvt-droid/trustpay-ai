import { buildEmvPayload, tlv } from "@/lib/qr/emvco";
import { NAPAS_GUID } from "@/lib/qr/vietqr-inspector";
import { findInstitution, type PayeeInstitution, type PayeeInstitutionCode } from "@/lib/payments/banks";

/**
 * Dựng mã VietQR chuẩn EMVCo (NAPAS 247) để chuyển tiền THẬT qua app Ngân hàng /
 * MoMo sau khi Lá chắn AI đánh giá AN TOÀN hoặc Người giám hộ đã cho phép.
 *
 * TrustPay AI KHÔNG giữ tiền (non-custodial): chuỗi QR chỉ chứa thông tin người
 * nhận + số tiền + nội dung; tiền đi thẳng từ app của người trả qua NAPAS 247.
 * CRC-16/CCITT-FALSE (0x1021, khởi tạo 0xFFFF) do `buildEmvPayload` tính trên máy.
 */

export interface PayeeDetails {
  institutionCode: PayeeInstitutionCode;
  /** STK ngân hàng (6–19 ký tự) hoặc số điện thoại ví MoMo (10 số). */
  accountNumber: string;
  /** Tên chủ tài khoản không dấu (tùy chọn, chỉ để hiển thị). */
  accountName: string;
}

export type VietQrService = "QRIBFTTA" | "QRIBFTTC";

export interface VietQrTransferInput {
  bankBin: string;
  accountNumber: string;
  /** Số tiền VND (số nguyên dương). Bỏ trống → mã tĩnh, người trả tự nhập. */
  amount?: number | null;
  /** Nội dung chuyển khoản (Tag 62.08), không dấu, tối đa 25 ký tự. */
  memo?: string | null;
  /** QRIBFTTA = chuyển tới tài khoản, QRIBFTTC = chuyển tới thẻ. */
  service?: VietQrService;
}

export const VIETQR_MEMO_MAX = 25;
export const VIETQR_NAME_MAX = 50;
export const VIETQR_IMAGE_TEMPLATE = "compact2";
export const VIETQR_DEEPLINK_BASE = "https://dl.vietqr.io/pay";
export const VIETQR_IMAGE_BASE = "https://img.vietqr.io/image";

/** Bỏ dấu tiếng Việt (NFD + loại dấu kết hợp, đ → d). */
export function removeDiacritics(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Nội dung chuyển khoản an toàn cho mọi app ngân hàng: chữ/số/khoảng trắng, không dấu, ≤ 25 ký tự. */
export function sanitizeMemo(raw: string, max = VIETQR_MEMO_MAX): string {
  return removeDiacritics(raw)
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Tên chủ tài khoản: in hoa, không dấu, ≤ 50 ký tự. */
export function sanitizeAccountName(raw: string, max = VIETQR_NAME_MAX): string {
  return removeDiacritics(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Chuẩn hóa STK người dùng nhập (bỏ khoảng trắng, dấu chấm, gạch nối; in hoa). */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[\s.\-_]/g, "").toUpperCase();
}

export type AccountValidation = "OK" | "EMPTY" | "INVALID_BANK_ACCOUNT" | "INVALID_WALLET_PHONE";

export function validatePayeeAccount(accountNumber: string, institution: PayeeInstitution | undefined): AccountValidation {
  const value = normalizeAccountNumber(accountNumber);
  if (!value) {
    return "EMPTY";
  }
  if (institution?.kind === "EWALLET") {
    return /^0\d{9}$/.test(value) ? "OK" : "INVALID_WALLET_PHONE";
  }
  return /^[0-9A-Z]{6,19}$/.test(value) ? "OK" : "INVALID_BANK_ACCOUNT";
}

export function isValidVietQrAmount(amount: number | null | undefined): amount is number {
  return typeof amount === "number" && Number.isInteger(amount) && amount > 0 && amount <= 9_999_999_999_999;
}

/**
 * Chuỗi VietQR (EMVCo TLV) — cùng cấu trúc với mã do app ngân hàng sinh ra:
 * 00 phiên bản · 01 tĩnh/động · 38 tài khoản NAPAS (GUID + BIN + STK + dịch vụ)
 * · 53 VND · 54 số tiền · 58 VN · 62.08 nội dung · 63 CRC-16.
 */
export function buildVietQrPayload(input: VietQrTransferInput): string {
  const bankBin = input.bankBin.trim();
  const accountNumber = normalizeAccountNumber(input.accountNumber);
  if (!/^\d{6}$/.test(bankBin)) {
    throw new RangeError("BIN ngân hàng phải gồm 6 chữ số");
  }
  if (!/^[0-9A-Z]{6,19}$/.test(accountNumber)) {
    throw new RangeError("Số tài khoản không hợp lệ");
  }
  const amount = isValidVietQrAmount(input.amount) ? input.amount : null;
  const memo = input.memo ? sanitizeMemo(input.memo) : "";

  const beneficiary = `${tlv("00", bankBin)}${tlv("01", accountNumber)}`;
  const merchantAccount = `${tlv("00", NAPAS_GUID)}${tlv("01", beneficiary)}${tlv("02", input.service ?? "QRIBFTTA")}`;

  const fields = [
    tlv("00", "01"),
    tlv("01", amount !== null ? "12" : "11"),
    tlv("38", merchantAccount),
    tlv("53", "704"),
    ...(amount !== null ? [tlv("54", String(amount))] : []),
    tlv("58", "VN"),
    ...(memo ? [tlv("62", tlv("08", memo))] : []),
  ];
  return buildEmvPayload(fields);
}

/** Chuỗi VietQR cho người nhận đã được Lá chắn AI phân tích. */
export function buildPayeeVietQr(payee: PayeeDetails, amount: number | null, memo: string): string {
  const institution = findInstitution(payee.institutionCode);
  if (!institution) {
    throw new RangeError("Ngân hàng / ví nhận không hợp lệ");
  }
  return buildVietQrPayload({ bankBin: institution.bin, accountNumber: payee.accountNumber, amount, memo });
}

/** Ảnh VietQR quét được thật từ dịch vụ công khai `img.vietqr.io` (mẫu compact2). */
export function buildVietQrImageUrl(params: {
  institution: PayeeInstitution;
  accountNumber: string;
  amount: number | null;
  memo: string;
  accountName: string;
}): string {
  const query: string[] = [];
  if (isValidVietQrAmount(params.amount)) {
    query.push(`amount=${params.amount}`);
  }
  const memo = sanitizeMemo(params.memo);
  if (memo) {
    query.push(`addInfo=${encodeURIComponent(memo)}`);
  }
  const name = sanitizeAccountName(params.accountName);
  if (name) {
    query.push(`accountName=${encodeURIComponent(name)}`);
  }
  const account = encodeURIComponent(normalizeAccountNumber(params.accountNumber));
  const path = `${VIETQR_IMAGE_BASE}/${encodeURIComponent(params.institution.code)}-${account}-${VIETQR_IMAGE_TEMPLATE}.png`;
  return query.length > 0 ? `${path}?${query.join("&")}` : path;
}

/** Liên kết mở app ngân hàng của NGƯỜI TRẢ qua VietQR DeepLink. */
export function buildBankDeeplink(slug: string): string {
  return `${VIETQR_DEEPLINK_BASE}?app=${encodeURIComponent(slug)}`;
}

/**
 * Câu lệnh gửi Lá chắn AI: nối STK người nhận đã chọn vào lệnh tự nhiên để bộ
 * luật + Bedrock đối chiếu Blacklist trên ĐÚNG tài khoản sẽ nhận tiền thật.
 * Hợp đồng `/api/analyze` không đổi (vẫn chỉ là `commandText`).
 */
export function buildAnalysisCommand(commandText: string, payee: PayeeDetails | null): string {
  const base = commandText.trim();
  if (!payee) {
    return base;
  }
  const accountNumber = normalizeAccountNumber(payee.accountNumber);
  if (!accountNumber || base.includes(accountNumber)) {
    return base;
  }
  const institution = findInstitution(payee.institutionCode);
  const trimmed = base.replace(/[\s.!]+$/, "");
  const name = sanitizeAccountName(payee.accountName);
  const recipientPart = !/\bcho\b/i.test(trimmed) && name ? ` cho ${name}` : "";
  const bankPart = institution ? ` (${institution.shortName})` : "";
  return `${trimmed}${recipientPart} STK ${accountNumber}${bankPart}`.trim();
}

/**
 * Các STK (6–19 chữ số) xuất hiện trong lệnh — để cảnh báo khi khác STK đã chọn.
 * Bỏ qua số tiền viết liền có đơn vị (vd "1000000đ", "500000 vnd").
 */
export function accountNumbersInText(text: string): string[] {
  const results: string[] = [];
  const pattern = /\d{6,19}/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    const end = match.index + match[0].length;
    const after = text.slice(end, end + 8);
    if (!/^\s*(?:đ|₫|vnđ|vnd|đồng|dong|k\b|nghìn|ngàn|tr\b|triệu)/i.test(after)) {
      results.push(match[0]);
    }
    match = pattern.exec(text);
  }
  return Array.from(new Set(results));
}

/**
 * Nội dung chuyển khoản mặc định lấy từ lệnh tự nhiên, vd
 * "Chuyển 250.000đ tiền ăn trưa cho Nguyễn Minh" → "tien an trua".
 */
export function derivePaymentMemo(commandText: string, fallback = "TrustPay chuyen tien"): string {
  const match = commandText.match(
    /\d[\d.,]*\s*(?:k|nghìn|ngàn|tr|triệu|củ|đ|vnđ|vnd)?\s+(.+?)\s+(?:cho|tới|đến)\s+/i,
  );
  const candidate = match ? sanitizeMemo(match[1]) : "";
  return candidate.length >= 3 ? candidate : sanitizeMemo(fallback);
}

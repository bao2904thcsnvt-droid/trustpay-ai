import { QR_DATA_TEXT } from "@/lib/qr/vietqr-inspector";
import { CALL_DATA_TEXT } from "@/lib/call-shield/call-shield";

/**
 * Bản dịch tiếng Anh cho các chuỗi DỮ LIỆU tiếng Việt do VietQR Inspector và
 * Active Call Shield sinh ra (lưu trong lịch sử ví, ticket Ops, redFlags…).
 * Được trộn vào bảng `EXACT_EN` của `lib/i18n/server-text.ts`.
 */
export const EXACT_EN_EXT: Record<string, string> = {
  [QR_DATA_TEXT.paidNote]: "Paid via a VietQR code inspected as safe (EMVCo/NAPAS)",
  [QR_DATA_TEXT.ticketHeadline]: "VietQR Inspector: suspected overlaid QR code at the point of sale",
  [QR_DATA_TEXT.recommendedAction]:
    "Block the payment, blacklist the beneficiary account and ask the merchant to check for an overlaid QR sticker.",
  [QR_DATA_TEXT.signals.FORMAT_INVALID]: "The QR string is not a valid EMVCo TLV structure",
  [QR_DATA_TEXT.signals.CRC_MISSING]: "The QR code is missing its CRC-16 check field",
  [QR_DATA_TEXT.signals.CRC_INVALID]: "Invalid CRC-16 checksum — the QR data was modified",
  [QR_DATA_TEXT.signals.NOT_VIETQR]: "The QR code does not follow the VietQR/NAPAS standard",
  [QR_DATA_TEXT.signals.UNKNOWN_BANK]: "The bank BIN is not in the NAPAS directory",
  [QR_DATA_TEXT.signals.CURRENCY_NOT_VND]: "The currency code is not VND (704)",
  [QR_DATA_TEXT.signals.NAME_MISMATCH]:
    "The merchant name on the QR code does not match the beneficiary account holder",
  [QR_DATA_TEXT.signals.FOREIGN_URL]: "The QR code contains a foreign link to an outside site",
  [QR_DATA_TEXT.signals.LURE_KEYWORDS]: "The QR content contains bait keywords (OTP / refund)",
  [QR_DATA_TEXT.signals.BLACKLISTED]: "The beneficiary account matches the Fintech Ops live Blacklist",
  [QR_DATA_TEXT.signals.MERCHANT_VERIFIED]: "The merchant name matches the registered account holder",
  [CALL_DATA_TEXT.scamType]: "Suspected live phone scam (vishing) in progress",
  [CALL_DATA_TEXT.redFlag]:
    "The transfer was created during a call from an unknown number — Amazon Transcribe detected pressure-to-transfer keywords",
  [CALL_DATA_TEXT.explanation]:
    "You are on a call with an unknown number showing pressure tactics. TrustPay AI holds the transfer for 15 seconds and needs your guardian to confirm before money leaves the wallet.",
  [CALL_DATA_TEXT.ticketSegment]:
    "Active Call Shield: the transaction happened while the customer was on a call with an unknown number",
  [CALL_DATA_TEXT.recommendedAction]:
    "Hold the transaction, require guardian confirmation and biometrics, and call the customer back on their registered number.",
};

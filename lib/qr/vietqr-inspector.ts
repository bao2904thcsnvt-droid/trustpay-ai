import type { CategoryName, FintechOpsTicket, RiskLevel } from "@/types/trustpay";
import {
  buildEmvPayload,
  findField,
  parseEmvPayload,
  tlv,
  verifyEmvCrc,
  type CrcCheck,
  type TlvField,
  type TlvParseResult,
} from "@/lib/qr/emvco";
import { findBlacklistMatches, mergeBlacklist } from "@/lib/wallet/blacklist-patterns";
import { ANOMALY_CLUSTER_PATTERN, ANOMALY_HUB_ACCOUNT } from "@/lib/ops/anomaly-cluster";

/**
 * VietQR Inspector — "soi" mã QR chuyển khoản/thanh toán trước khi trả tiền.
 *
 * Luồng: (ảnh → Amazon Rekognition/BarcodeDetector đọc chuỗi QR) → EMVCo TLV
 * Parser (module này, chạy trên trình duyệt) → đối chiếu Blacklist sống + ngữ
 * cảnh Amazon Bedrock qua `/api/analyze`. Mọi kết luận ở đây là XÁC ĐỊNH (cùng
 * chuỗi QR + cùng Blacklist → cùng điểm rủi ro).
 */

export const NAPAS_GUID = "A000000727";

/** Danh bạ BIN ngân hàng phổ biến trong mạng NAPAS (rút gọn cho demo). */
export const VIETQR_BANKS: Readonly<Record<string, string>> = {
  "970436": "Vietcombank",
  "970415": "VietinBank",
  "970418": "BIDV",
  "970405": "Agribank",
  "970422": "MB Bank",
  "970407": "Techcombank",
  "970416": "ACB",
  "970432": "VPBank",
  "970423": "TPBank",
  "970403": "Sacombank",
  "970437": "HDBank",
  "970441": "VIB",
  "970443": "SHB",
  // Vòng 3 — khớp danh bạ "Real Payment Handoff" (lib/payments/banks.ts)
  "970412": "PVcomBank",
  "971025": "Ví MoMo",
};

/**
 * Mô phỏng dịch vụ tra cứu tên chủ tài khoản của NAPAS (Production: gọi API
 * ngân hàng/NAPAS phía máy chủ). Khóa = `BIN:STK`.
 */
const DEMO_ACCOUNT_REGISTRY: Readonly<Record<string, string>> = {
  "970436:0071001234567": "CONG TY TNHH CA PHE MOC MIEN",
  [`970407:${ANOMALY_HUB_ACCOUNT}`]: "TRAN VAN B",
};

export type QrSignalCode =
  | "FORMAT_INVALID"
  | "CRC_MISSING"
  | "CRC_INVALID"
  | "NOT_VIETQR"
  | "UNKNOWN_BANK"
  | "CURRENCY_NOT_VND"
  | "NAME_MISMATCH"
  | "FOREIGN_URL"
  | "LURE_KEYWORDS"
  | "BLACKLISTED"
  | "MERCHANT_VERIFIED";

export interface QrSignal {
  code: QrSignalCode;
  weight: number;
  detail?: string;
}

export type QrVerdict = "SAFE" | "WARNING" | "DANGER";

export type QrInitiation = "STATIC" | "DYNAMIC";

export interface VietQrDecoded {
  payloadFormat: string | null;
  initiation: QrInitiation | null;
  guid: string | null;
  bankBin: string | null;
  bankName: string | null;
  accountNumber: string | null;
  serviceCode: string | null;
  merchantCategoryCode: string | null;
  currency: string | null;
  amount: number | null;
  countryCode: string | null;
  merchantName: string | null;
  merchantCity: string | null;
  billNumber: string | null;
  referenceLabel: string | null;
  terminalLabel: string | null;
  purpose: string | null;
  crc: CrcCheck;
}

export interface QrInspectionReport {
  payload: string;
  parse: TlvParseResult;
  decoded: VietQrDecoded | null;
  /** Tên chủ tài khoản theo tra cứu NAPAS (mô phỏng); null nếu không tra được. */
  registeredName: string | null;
  urls: string[];
  lureKeywords: string[];
  blacklistMatches: string[];
  signals: QrSignal[];
  riskScore: number;
  riskLevel: RiskLevel;
  verdict: QrVerdict;
  /** Chỉ cho thanh toán khi không ở mức NGUY HIỂM và có STK thụ hưởng. */
  canPay: boolean;
  suggestedCategory: CategoryName;
}

// ------------------------------------------------------------------ helpers

/** Bỏ dấu tiếng Việt, in hoa, gộp khoảng trắng (so khớp tên/khóa không phân biệt dấu). */
export function normalizeLatin(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const BUSINESS_PREFIXES = [
  "CONG TY",
  "CTY",
  "TNHH",
  "MTV",
  "CO PHAN",
  "CP",
  "HO KINH DOANH",
  "HKD",
  "CUA HANG",
  "DNTN",
];

function stripBusinessPrefixes(name: string): string {
  let result = ` ${normalizeLatin(name)} `;
  for (const prefix of BUSINESS_PREFIXES) {
    result = result.split(` ${prefix} `).join(" ");
  }
  return result.replace(/\s+/g, " ").trim();
}

/** Tên ĐVCNTT (tag 59) có khớp tên chủ tài khoản thụ hưởng hay không. */
export function namesMatch(merchantName: string, registeredName: string): boolean {
  const a = stripBusinessPrefixes(merchantName);
  const b = stripBusinessPrefixes(registeredName);
  if (!a || !b) {
    return false;
  }
  if (a.includes(b) || b.includes(a)) {
    return true;
  }
  const tokensA = new Set(a.split(" "));
  const tokensB = new Set(b.split(" "));
  const shared = [...tokensA].filter((token) => tokensB.has(token)).length;
  return shared / Math.max(tokensA.size, tokensB.size) >= 0.6;
}

const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s|]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:xyz|top|click|link|info|online|site|vip|live|icu|buzz|cc|tk|ml|ga|cf|gq|win|bid|loan|work|app|io|me|ly|com|net|org|vn)(?:\/[^\s|]*)?/gi;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_PATTERN) ?? [];
  return Array.from(new Set(found.map((url) => url.replace(/[),.;]+$/, ""))));
}

const LURE_PATTERNS: readonly [string, RegExp][] = [
  ["OTP", /\bOTP\b/],
  ["HOAN TIEN", /HOAN ?TIEN\b/],
  ["XAC MINH", /\bXAC ?MINH\b/],
  ["NHAN THUONG", /\b(?:NHAN|TRUNG) ?THUONG\b/],
  ["PHONG TOA", /\bPHONG ?TOA\b|\bKHOA ?TAI ?KHOAN\b/],
  ["CONG AN", /\bCONG ?AN\b/],
  ["MA XAC THUC", /\bMA ?XAC ?THUC\b/],
];

export function findLureKeywords(text: string): string[] {
  const normalized = normalizeLatin(text);
  return LURE_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label);
}

function valueOf(fields: readonly TlvField[] | undefined, tag: string): string | null {
  const field = findField(fields, tag);
  return field ? field.value : null;
}

/** Tìm template tài khoản VietQR (GUID NAPAS) trong các tag 26–51; ưu tiên tag 38. */
function findVietQrTemplate(fields: readonly TlvField[]): TlvField | undefined {
  const candidates = fields.filter((field) => {
    const n = Number(field.tag);
    return n >= 26 && n <= 51 && field.children !== undefined;
  });
  return (
    candidates.find((field) => field.tag === "38" && valueOf(field.children, "00") === NAPAS_GUID) ??
    candidates.find((field) => valueOf(field.children, "00") === NAPAS_GUID)
  );
}

function categoryFromContext(mcc: string | null, text: string): CategoryName {
  if (mcc && ["5812", "5813", "5814"].includes(mcc)) {
    return "Ăn uống";
  }
  if (mcc && ["5311", "5331", "5399", "5411", "5651", "5691", "5699", "5732", "5945", "5999"].includes(mcc)) {
    return "Mua sắm";
  }
  if (mcc && ["4814", "4899", "4900"].includes(mcc)) {
    return "Hóa đơn";
  }
  const normalized = normalizeLatin(text);
  if (/CA PHE|CAFE|COFFEE|TRA SUA|NHA HANG|QUAN AN|\bCOM\b|\bPHO\b|\bBUN\b/.test(normalized)) {
    return "Ăn uống";
  }
  if (/SHOP|SIEU THI|MART|THOI TRANG/.test(normalized)) {
    return "Mua sắm";
  }
  return "Khác";
}

// ------------------------------------------------------------------- decode

export function decodeVietQr(rawPayload: string): { parse: TlvParseResult; decoded: VietQrDecoded | null } {
  const payload = rawPayload.trim();
  const parse = parseEmvPayload(payload);
  if (!parse.ok) {
    return { parse, decoded: null };
  }

  const fields = parse.fields;
  const template = findVietQrTemplate(fields);
  const beneficiary = template ? findField(template.children, "01") : undefined;
  const additional = findField(fields, "62");
  const amountText = valueOf(fields, "54");
  const amountNumber = amountText !== null ? Number(amountText) : Number.NaN;
  const initiationCode = valueOf(fields, "01");
  const bankBin = valueOf(beneficiary?.children, "00");

  return {
    parse,
    decoded: {
      payloadFormat: valueOf(fields, "00"),
      initiation: initiationCode === "11" ? "STATIC" : initiationCode === "12" ? "DYNAMIC" : null,
      guid: template ? valueOf(template.children, "00") : null,
      bankBin,
      bankName: bankBin ? (VIETQR_BANKS[bankBin] ?? null) : null,
      accountNumber: valueOf(beneficiary?.children, "01"),
      serviceCode: template ? valueOf(template.children, "02") : null,
      merchantCategoryCode: valueOf(fields, "52"),
      currency: valueOf(fields, "53"),
      amount: Number.isFinite(amountNumber) && amountNumber > 0 ? Math.round(amountNumber) : null,
      countryCode: valueOf(fields, "58"),
      merchantName: valueOf(fields, "59"),
      merchantCity: valueOf(fields, "60"),
      billNumber: valueOf(additional?.children, "01"),
      referenceLabel: valueOf(additional?.children, "05"),
      terminalLabel: valueOf(additional?.children, "07"),
      purpose: valueOf(additional?.children, "08"),
      crc: verifyEmvCrc(payload),
    },
  };
}

/** Tra cứu tên chủ tài khoản (mô phỏng NAPAS). */
export function lookupRegisteredName(bankBin: string | null, accountNumber: string | null): string | null {
  if (!bankBin || !accountNumber) {
    return null;
  }
  return DEMO_ACCOUNT_REGISTRY[`${bankBin}:${accountNumber}`] ?? null;
}

// ------------------------------------------------------------------ inspect

function levelFromScore(score: number): RiskLevel {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * Soi một chuỗi QR. Blacklist hiệu lực = Blacklist sống của Ví + cụm `1903xxxx`
 * mà Fintech Ops đang theo dõi trên banner bất thường.
 */
export function inspectVietQr(rawPayload: string, options: { blacklist: string[] }): QrInspectionReport {
  const payload = rawPayload.trim();
  const { parse, decoded } = decodeVietQr(payload);
  const signals: QrSignal[] = [];
  const effectiveBlacklist = mergeBlacklist(options.blacklist, [ANOMALY_CLUSTER_PATTERN]);

  if (!decoded) {
    signals.push({ code: "FORMAT_INVALID", weight: 50, detail: parse.error });
    const urls = extractUrls(payload);
    const blacklistMatches = findBlacklistMatches(effectiveBlacklist, payload);
    if (urls.length > 0) signals.push({ code: "FOREIGN_URL", weight: 35, detail: urls[0] });
    if (blacklistMatches.length > 0) signals.push({ code: "BLACKLISTED", weight: 60, detail: blacklistMatches.join(", ") });
    const riskScore = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
    return {
      payload,
      parse,
      decoded: null,
      registeredName: null,
      urls,
      lureKeywords: findLureKeywords(payload),
      blacklistMatches,
      signals,
      riskScore,
      riskLevel: levelFromScore(riskScore),
      verdict: "DANGER",
      canPay: false,
      suggestedCategory: "Khác",
    };
  }

  if (!decoded.crc.present) {
    signals.push({ code: "CRC_MISSING", weight: 30 });
  } else if (!decoded.crc.valid) {
    signals.push({ code: "CRC_INVALID", weight: 45, detail: `${decoded.crc.actual} ≠ ${decoded.crc.expected}` });
  }

  if (decoded.guid !== NAPAS_GUID || !decoded.bankBin || !decoded.accountNumber) {
    signals.push({ code: "NOT_VIETQR", weight: 25 });
  } else if (!decoded.bankName) {
    signals.push({ code: "UNKNOWN_BANK", weight: 10, detail: decoded.bankBin });
  }

  if (decoded.currency !== null && decoded.currency !== "704") {
    signals.push({ code: "CURRENCY_NOT_VND", weight: 15, detail: decoded.currency });
  }

  const registeredName = lookupRegisteredName(decoded.bankBin, decoded.accountNumber);
  if (registeredName && decoded.merchantName) {
    if (namesMatch(decoded.merchantName, registeredName)) {
      signals.push({ code: "MERCHANT_VERIFIED", weight: -10, detail: registeredName });
    } else {
      signals.push({ code: "NAME_MISMATCH", weight: 35, detail: `${decoded.merchantName} ≠ ${registeredName}` });
    }
  }

  const textFields = [
    decoded.merchantName,
    decoded.merchantCity,
    decoded.billNumber,
    decoded.referenceLabel,
    decoded.terminalLabel,
    decoded.purpose,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");

  const urls = extractUrls(textFields);
  if (urls.length > 0) {
    signals.push({ code: "FOREIGN_URL", weight: 35, detail: urls[0] });
  }

  const lureKeywords = findLureKeywords(textFields);
  if (lureKeywords.length > 0) {
    signals.push({ code: "LURE_KEYWORDS", weight: 20, detail: lureKeywords.join(", ") });
  }

  const matchTarget = [decoded.accountNumber, decoded.merchantName, ...urls].filter(Boolean).join(" ");
  const blacklistMatches = findBlacklistMatches(effectiveBlacklist, matchTarget);
  if (blacklistMatches.length > 0) {
    signals.push({ code: "BLACKLISTED", weight: 60, detail: blacklistMatches.join(", ") });
  }

  const rawScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const riskScore = Math.max(0, Math.min(100, rawScore));
  const riskLevel = levelFromScore(riskScore);
  const hardStop = signals.some(
    (signal) => signal.code === "BLACKLISTED" || signal.code === "CRC_INVALID",
  );
  const verdict: QrVerdict =
    hardStop || riskLevel === "HIGH"
      ? "DANGER"
      : riskLevel === "MEDIUM" || signals.some((signal) => signal.weight > 0)
        ? "WARNING"
        : "SAFE";

  return {
    payload,
    parse,
    decoded,
    registeredName,
    urls,
    lureKeywords,
    blacklistMatches,
    signals,
    riskScore,
    riskLevel,
    verdict,
    canPay: verdict !== "DANGER" && Boolean(decoded.accountNumber),
    suggestedCategory: categoryFromContext(decoded.merchantCategoryCode, textFields),
  };
}

// ---------------------------------------------------- data strings (VI gốc)

/** Chuỗi dữ liệu lưu bằng tiếng Việt (lớp hiển thị dịch qua `translateDataText`). */
export const QR_DATA_TEXT = {
  paidNote: "Thanh toán qua mã VietQR đã soi an toàn (EMVCo/NAPAS)",
  ticketHeadline: "Soi mã VietQR: phát hiện mã nghi bị dán đè tại điểm thanh toán",
  recommendedAction: "Chặn thanh toán, đưa STK thụ hưởng vào Blacklist và báo điểm bán kiểm tra mã QR bị dán đè.",
  signals: {
    FORMAT_INVALID: "Chuỗi QR sai cấu trúc EMVCo TLV",
    CRC_MISSING: "Mã QR thiếu trường kiểm tra CRC-16",
    CRC_INVALID: "Mã kiểm tra CRC-16 không hợp lệ — dữ liệu mã QR đã bị chỉnh sửa",
    NOT_VIETQR: "Mã QR không theo chuẩn VietQR/NAPAS",
    UNKNOWN_BANK: "Mã BIN ngân hàng không có trong danh bạ NAPAS",
    CURRENCY_NOT_VND: "Mã tiền tệ không phải VND (704)",
    NAME_MISMATCH: "Tên đơn vị trên mã QR không khớp tên chủ tài khoản thụ hưởng",
    FOREIGN_URL: "Mã QR chứa liên kết lạ dẫn tới trang ngoài",
    LURE_KEYWORDS: "Nội dung mã QR chứa từ khóa dụ nhập OTP / hoàn tiền",
    BLACKLISTED: "STK thụ hưởng khớp Blacklist sống của Fintech Ops",
    MERCHANT_VERIFIED: "Tên đơn vị khớp chủ tài khoản đã đăng ký",
  } satisfies Record<QrSignalCode, string>,
} as const;

/** Chuỗi người nhận lưu trong lịch sử/ticket: "TÊN ĐVCNTT (STK)". */
export function qrRecipientLabel(report: QrInspectionReport): string {
  const name = report.decoded?.merchantName ?? "VietQR";
  const account = report.decoded?.accountNumber;
  return account ? `${name} (${account})` : name;
}

/** Câu lệnh ngữ cảnh gửi `/api/analyze` (máy chủ che PII trước khi tới Bedrock). */
export function buildQrContextCommand(report: QrInspectionReport, amount: number): string {
  const decoded = report.decoded;
  const parts = [
    `Thanh toán ${amount > 0 ? `${amount.toLocaleString("de-DE")}đ` : ""} qua mã VietQR cho ${decoded?.merchantName ?? "đơn vị chưa rõ"}`,
    decoded?.accountNumber ? `STK ${decoded.accountNumber}` : "",
    decoded?.bankName ? `(${decoded.bankName})` : "",
    decoded?.purpose ? `Nội dung: ${decoded.purpose}.` : "",
    report.urls.length > 0 ? `Liên kết trong mã: ${report.urls.join(" ")}` : "",
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Ticket Fintech Ops cho mã QR nguy hiểm (tóm tắt ghép bằng " | " để dịch từng đoạn). */
export function buildQrOpsTicket(
  report: QrInspectionReport,
  input: { ticketId: string; timestamp: string; amount: number; riskScore: number },
): FintechOpsTicket {
  const segments: string[] = [QR_DATA_TEXT.ticketHeadline];
  for (const signal of report.signals) {
    if (signal.weight > 0) {
      segments.push(QR_DATA_TEXT.signals[signal.code]);
    }
  }
  return {
    ticketId: input.ticketId,
    timestamp: input.timestamp,
    recipient: qrRecipientLabel(report),
    amount: input.amount,
    riskLevel: levelFromScore(input.riskScore),
    riskScore: input.riskScore,
    summary: segments.join(" | "),
    recommendedAction: QR_DATA_TEXT.recommendedAction,
    status: "PENDING",
  };
}

// ------------------------------------------------------------------ samples

export type QrSampleId = "cafe-valid" | "overlay-scam";

export interface QrSample {
  id: QrSampleId;
  payload: string;
}

/** Mã hợp lệ: quán cà phê, STK sạch, tên khớp chủ tài khoản. CRC tự tính khi dựng. */
const CAFE_VALID_PAYLOAD = buildEmvPayload([
  tlv("00", "01"),
  tlv("01", "12"),
  tlv("38", `${tlv("00", NAPAS_GUID)}${tlv("01", `${tlv("00", "970436")}${tlv("01", "0071001234567")}`)}${tlv("02", "QRIBFTTA")}`),
  tlv("52", "5814"),
  tlv("53", "704"),
  tlv("54", "45000"),
  tlv("58", "VN"),
  tlv("59", "CA PHE MOC MIEN"),
  tlv("60", "HA NOI"),
  tlv("62", `${tlv("01", "HD0458")}${tlv("08", "Thanh toan 2 ca phe sua da")}`),
]);

/**
 * Mã dán đè: giữ nguyên tên quán để đánh lừa nhưng STK thuộc đường dây 1903xxxx,
 * kèm liên kết "hoàn tiền" dụ nhập OTP. CRC vẫn hợp lệ (kẻ gian tự sinh mã mới).
 */
const OVERLAY_SCAM_PAYLOAD = buildEmvPayload([
  tlv("00", "01"),
  tlv("01", "12"),
  tlv("38", `${tlv("00", NAPAS_GUID)}${tlv("01", `${tlv("00", "970407")}${tlv("01", ANOMALY_HUB_ACCOUNT)}`)}${tlv("02", "QRIBFTTA")}`),
  tlv("53", "704"),
  tlv("54", "45000"),
  tlv("58", "VN"),
  tlv("59", "CA PHE MOC MIEN"),
  tlv("60", "HA NOI"),
  tlv("62", `${tlv("05", "https://momo-hoantien.xyz/otp")}${tlv("08", "Xac minh hoan tien don hang")}`),
]);

export const QR_SAMPLES: readonly QrSample[] = [
  { id: "cafe-valid", payload: CAFE_VALID_PAYLOAD },
  { id: "overlay-scam", payload: OVERLAY_SCAM_PAYLOAD },
];

/**
 * Bộ giải mã VietQR đầy đủ — EMVCo Merchant Presented Mode theo chuẩn NAPAS 247 — và là "cửa ngõ"
 * re-export các hàm dựng VietQR / Deep Link / danh bạ ngân hàng.
 *
 * `parseVietQr` KHÔNG BAO GIỜ ném ngoại lệ: chuỗi QR (camera, dán, ảnh) luôn bị coi là KHÔNG tin
 * cậy; mọi sai lệch được trả về dưới dạng danh sách lỗi có mã. Dùng lại bộ TLV + CRC-16/CCITT-FALSE
 * của `lib/qr/emvco.ts` (không có bản CRC thứ hai) và danh bạ `lib/vietnam-banks.ts`.
 *
 * Bảng tag:
 *   00 phiên bản (01) · 01 QR tĩnh 11 / động 12 · 26–51 thông tin tài khoản — 38 là NAPAS (GUID
 *   A000000727): 00 GUID, 01 { 00 BIN, 01 STK hoặc số thẻ }, 02 QRIBFTTA = tài khoản / QRIBFTTC =
 *   thẻ · 52 MCC · 53 tiền tệ (704) · 54 số tiền · 58 quốc gia · 59 tên người nhận / cửa hàng ·
 *   60 thành phố · 61 mã bưu chính · 62 dữ liệu bổ sung (01 hóa đơn, 02 SĐT, 03 cửa hàng,
 *   05 mã tham chiếu, 07 thiết bị, 08 nội dung) · 63 CRC.
 *
 * Thông điệp lỗi là chuỗi cố định, không chứa dữ liệu người dùng → an toàn để ghi log. KHÔNG ghi
 * log `payload` / `fields` / `napas.accountNumber` (chứa STK thô).
 */
import {
  EMV_MAX_PAYLOAD_LENGTH,
  findField,
  parseEmvPayload,
  verifyEmvCrc,
  type CrcCheck,
  type TlvField,
} from "@/lib/qr/emvco";
import { NAPAS_GUID } from "@/lib/qr/vietqr-inspector";
import { normalizeAccountNumber, sanitizeMemo, type VietQrService } from "@/lib/payments/vietqr-builder";
import {
  findVietnamBankByBin,
  isValidAccountNumberFor,
  normalizeNapasAccountName,
  type VietnamBank,
  type VietnamBankCode,
} from "@/lib/vietnam-banks";

export { buildPayeeVietQr, buildVietQrPayload, sanitizeAccountName, sanitizeMemo } from "@/lib/payments/vietqr-builder";
export type { PayeeDetails, VietQrService, VietQrTransferInput } from "@/lib/payments/vietqr-builder";
export { buildBankTransferDeepLink, buildMomoAppLink, MOMO_APP_SCHEME } from "@/lib/payments/bank-deeplinks";
export type { BankTransferDeepLinkInput } from "@/lib/payments/bank-deeplinks";
export { crc16Ccitt, verifyEmvCrc } from "@/lib/qr/emvco";
export type { CrcCheck, TlvField } from "@/lib/qr/emvco";
export * from "@/lib/vietnam-banks";

// ------------------------------------------------------------------- kiểu

export type VietQrInitiation = "STATIC" | "DYNAMIC";

/** QRIBFTTA → chuyển tới tài khoản, QRIBFTTC → chuyển tới thẻ. */
export type VietQrTransferType = "ACCOUNT" | "CARD";

export type VietQrErrorCode =
  | "EMPTY"
  | "TOO_LONG"
  | "INVALID_HEADER"
  | "TRUNCATED_VALUE"
  | "DUPLICATE_TAG"
  | "INVALID_PAYLOAD_FORMAT"
  | "INVALID_INITIATION"
  | "MISSING_NAPAS_TEMPLATE"
  | "DUPLICATE_NAPAS_TEMPLATE"
  | "INVALID_NAPAS_TEMPLATE"
  | "INVALID_BIN"
  | "MISSING_ACCOUNT"
  | "INVALID_ACCOUNT"
  | "INVALID_SERVICE_CODE"
  | "CURRENCY_NOT_VND"
  | "INVALID_AMOUNT"
  | "INVALID_ADDITIONAL_DATA"
  | "CRC_MISSING"
  | "CRC_INVALID";

export interface VietQrError {
  code: VietQrErrorCode;
  /** Tag EMVCo liên quan (vd "54", "38.01.00"); null khi lỗi thuộc cả chuỗi. */
  tag: string | null;
  /** Mô tả cố định (không chứa dữ liệu người dùng). */
  message: string;
}

/** Template tài khoản NAPAS (thường ở tag 38). */
export interface VietQrNapasAccount {
  tag: string;
  /** Sub-tag 00 — luôn là GUID NAPAS "A000000727". */
  guid: string;
  /** 01.00 — BIN 6 chữ số; null nếu thiếu / sai định dạng. */
  bin: string | null;
  /** 01.01 — STK (QRIBFTTA) hoặc số thẻ (QRIBFTTC), nguyên văn trong mã. */
  accountNumber: string | null;
  /** 02 — mã dịch vụ nguyên văn (QRIBFTTA, QRIBFTTC, QRPUSH, QRCASH). */
  serviceCode: string | null;
  transferType: VietQrTransferType | null;
  /** Ngân hàng / ví trong danh bạ `lib/vietnam-banks.ts` theo BIN; null nếu BIN lạ. */
  bank: VietnamBank | null;
}

/** Template tài khoản khác trong khoảng 26–51 (ví điện tử, cổng thanh toán…). */
export interface VietQrOtherAccountTemplate {
  tag: string;
  /** Sub-tag 00 (GUID / Application ID) nếu template là TLV hợp lệ. */
  guid: string | null;
  value: string;
}

export interface VietQrAdditionalData {
  /** 62.01 số hóa đơn. */
  billNumber: string | null;
  /** 62.02 số điện thoại. */
  mobileNumber: string | null;
  /** 62.03 mã cửa hàng. */
  storeLabel: string | null;
  /** 62.05 mã tham chiếu. */
  referenceLabel: string | null;
  /** 62.07 mã thiết bị / quầy. */
  terminalLabel: string | null;
  /** 62.08 nội dung chuyển khoản. */
  purpose: string | null;
}

export interface VietQrParseResult {
  /** true khi không có lỗi nào (gồm cả CRC hợp lệ). */
  ok: boolean;
  /** Chuỗi đã bỏ khoảng trắng / xuống dòng / zero-width ở hai đầu ("" khi rỗng hoặc quá dài). */
  payload: string;
  /** TLV cấp 1 (kèm `children` của template) từ `parseEmvPayload`. */
  fields: readonly TlvField[];
  /** 00 — phiên bản payload ("01"). */
  payloadFormat: string | null;
  /** 01 — 11 → STATIC, 12 → DYNAMIC. */
  initiation: VietQrInitiation | null;
  napas: VietQrNapasAccount | null;
  otherAccountTemplates: readonly VietQrOtherAccountTemplate[];
  /** 52 */
  merchantCategoryCode: string | null;
  /** 53 */
  currency: string | null;
  /** 54 — số nguyên VND dương; null nếu không có hoặc sai định dạng. */
  amount: number | null;
  /** 58 */
  countryCode: string | null;
  /** 59 */
  merchantName: string | null;
  /** 60 */
  merchantCity: string | null;
  /** 61 */
  postalCode: string | null;
  /** 62 */
  additionalData: VietQrAdditionalData;
  /** 63 */
  crc: CrcCheck;
  errors: readonly VietQrError[];
}

/** Bản nháp người nhận để điền sẵn biểu mẫu chuyển tiền (vẫn phải qua Lá chắn AI). */
export interface VietQrPayeeDraft {
  institutionCode: VietnamBankCode;
  accountNumber: string;
  accountName: string;
  amount: number | null;
  memo: string;
  serviceCode: VietQrService;
}

// --------------------------------------------------------------- hằng số

export const VIETQR_MAX_PAYLOAD_LENGTH = EMV_MAX_PAYLOAD_LENGTH;

export const VIETQR_ERROR_MESSAGES = {
  EMPTY: "Chuỗi QR rỗng",
  TOO_LONG: "Chuỗi QR dài quá 512 ký tự",
  INVALID_HEADER: "Sai cấu trúc TLV: tag / độ dài không phải 2 chữ số",
  TRUNCATED_VALUE: "Giá trị TLV bị cắt cụt hoặc có độ dài 0",
  DUPLICATE_TAG: "Một tag xuất hiện nhiều lần trong cùng một cấp",
  INVALID_PAYLOAD_FORMAT: "Tag 00 phải đứng đầu với giá trị 01",
  INVALID_INITIATION: "Tag 01 phải là 11 (QR tĩnh) hoặc 12 (QR động)",
  MISSING_NAPAS_TEMPLATE: "Không có template tài khoản NAPAS (GUID A000000727)",
  DUPLICATE_NAPAS_TEMPLATE: "Có nhiều template tài khoản NAPAS trong cùng một mã",
  INVALID_NAPAS_TEMPLATE: "Template tài khoản NAPAS sai cấu trúc",
  INVALID_BIN: "BIN ngân hàng phải gồm 6 chữ số",
  MISSING_ACCOUNT: "Thiếu STK / số thẻ thụ hưởng",
  INVALID_ACCOUNT: "STK / số thẻ thụ hưởng sai định dạng",
  INVALID_SERVICE_CODE: "Mã dịch vụ NAPAS không hợp lệ",
  CURRENCY_NOT_VND: "Mã tiền tệ không phải VND (704)",
  INVALID_AMOUNT: "Số tiền không phải số nguyên VND dương hợp lệ",
  INVALID_ADDITIONAL_DATA: "Dữ liệu bổ sung (tag 62) sai cấu trúc TLV",
  CRC_MISSING: "Thiếu mã kiểm tra CRC-16 (6304) ở cuối chuỗi",
  CRC_INVALID: "CRC-16 không khớp — dữ liệu mã QR đã bị chỉnh sửa",
} as const satisfies Record<VietQrErrorCode, string>;

const NAPAS_SERVICE_CODES: ReadonlySet<string> = new Set(["QRIBFTTA", "QRIBFTTC", "QRPUSH", "QRCASH"]);
const BIN_PATTERN = /^\d{6}$/;
/** STK / mã định danh NAPAS: chữ + số, tối đa 19 ký tự. */
const NAPAS_ACCOUNT_PATTERN = /^[0-9A-Za-z]{1,19}$/;
/** Số thẻ (QRIBFTTC): 12–19 chữ số. */
const CARD_NUMBER_PATTERN = /^\d{12,19}$/;
/** Số tiền VND: số nguyên dương, tối đa 13 chữ số, không số 0 đứng đầu, không dấu thập phân. */
const VND_AMOUNT_PATTERN = /^[1-9]\d{0,12}$/;
/** Ký tự "rác" được phép bao quanh chuỗi: khoảng trắng, xuống dòng, zero-width, BOM. */
const EDGE_JUNK_CHAR = /[\s\u180E\u200B-\u200D\u2060\uFEFF]/;

const NO_CRC: CrcCheck = { present: false, valid: false, expected: null, actual: null };

// -------------------------------------------------------------- tiện ích

/**
 * Bỏ ký tự rác ở hai đầu bằng vòng lặp (thời gian tuyến tính) — tránh regex dạng `^[\s…]+|[\s…]+$`
 * vốn bị backtracking bậc hai với chuỗi rất nhiều khoảng trắng.
 */
function trimQrInput(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && EDGE_JUNK_CHAR.test(raw[start])) {
    start += 1;
  }
  while (end > start && EDGE_JUNK_CHAR.test(raw[end - 1])) {
    end -= 1;
  }
  return raw.slice(start, end);
}

function valueOf(fields: readonly TlvField[] | undefined, tag: string): string | null {
  const field = findField(fields, tag);
  return field ? field.value : null;
}

function duplicateTagIn(fields: readonly TlvField[] | undefined): string | null {
  const seen = new Set<string>();
  for (const field of fields ?? []) {
    if (seen.has(field.tag)) {
      return field.tag;
    }
    seen.add(field.tag);
  }
  return null;
}

function isAccountTemplateTag(tag: string): boolean {
  const n = Number(tag);
  return n >= 26 && n <= 51;
}

function emptyAdditionalData(): VietQrAdditionalData {
  return { billNumber: null, mobileNumber: null, storeLabel: null, referenceLabel: null, terminalLabel: null, purpose: null };
}

function failureResult(payload: string, crc: CrcCheck, errors: VietQrError[], fields: readonly TlvField[]): VietQrParseResult {
  return {
    ok: false,
    payload,
    fields,
    payloadFormat: null,
    initiation: null,
    napas: null,
    otherAccountTemplates: [],
    merchantCategoryCode: null,
    currency: null,
    amount: null,
    countryCode: null,
    merchantName: null,
    merchantCity: null,
    postalCode: null,
    additionalData: emptyAdditionalData(),
    crc,
    errors,
  };
}

type PushError = (code: VietQrErrorCode, tag?: string | null) => void;

function decodeNapasTemplate(template: TlvField, push: PushError): VietQrNapasAccount {
  const children = template.children ?? [];
  const duplicated = duplicateTagIn(children);
  if (duplicated) {
    push("DUPLICATE_TAG", `${template.tag}.${duplicated}`);
  }

  let bin: string | null = null;
  let accountNumber: string | null = null;
  const beneficiary = findField(children, "01");
  if (!beneficiary || !beneficiary.children) {
    push("INVALID_NAPAS_TEMPLATE", `${template.tag}.01`);
  } else {
    const duplicatedInner = duplicateTagIn(beneficiary.children);
    if (duplicatedInner) {
      push("DUPLICATE_TAG", `${template.tag}.01.${duplicatedInner}`);
    }
    const binValue = valueOf(beneficiary.children, "00");
    if (binValue !== null && BIN_PATTERN.test(binValue)) {
      bin = binValue;
    } else {
      push("INVALID_BIN", `${template.tag}.01.00`);
    }
    accountNumber = valueOf(beneficiary.children, "01");
    if (accountNumber === null) {
      push("MISSING_ACCOUNT", `${template.tag}.01.01`);
    }
  }

  const serviceCode = valueOf(children, "02");
  if (serviceCode !== null && !NAPAS_SERVICE_CODES.has(serviceCode)) {
    push("INVALID_SERVICE_CODE", `${template.tag}.02`);
  }
  const transferType: VietQrTransferType | null =
    serviceCode === "QRIBFTTA" ? "ACCOUNT" : serviceCode === "QRIBFTTC" ? "CARD" : null;

  if (accountNumber !== null) {
    const pattern = transferType === "CARD" ? CARD_NUMBER_PATTERN : NAPAS_ACCOUNT_PATTERN;
    if (!pattern.test(accountNumber)) {
      push("INVALID_ACCOUNT", `${template.tag}.01.01`);
    }
  }

  return {
    tag: template.tag,
    guid: NAPAS_GUID,
    bin,
    accountNumber,
    serviceCode,
    transferType,
    bank: bin ? (findVietnamBankByBin(bin) ?? null) : null,
  };
}

// ------------------------------------------------------------------ parse

/** Giải mã chuỗi VietQR. Không bao giờ ném ngoại lệ; `ok` chỉ true khi `errors` rỗng. */
export function parseVietQr(raw: string): VietQrParseResult {
  const errors: VietQrError[] = [];
  const push: PushError = (code, tag = null) => {
    errors.push({ code, tag, message: VIETQR_ERROR_MESSAGES[code] });
  };

  try {
    const payload = typeof raw === "string" ? trimQrInput(raw) : "";
    if (!payload) {
      push("EMPTY");
      return failureResult("", NO_CRC, errors, []);
    }
    if (payload.length > VIETQR_MAX_PAYLOAD_LENGTH) {
      push("TOO_LONG");
      return failureResult("", NO_CRC, errors, []);
    }

    const crc = verifyEmvCrc(payload);
    const pushCrcErrors = () => {
      if (!crc.present) {
        push("CRC_MISSING", "63");
      } else if (!crc.valid) {
        push("CRC_INVALID", "63");
      }
    };

    const parsed = parseEmvPayload(payload);
    if (!parsed.ok) {
      push(parsed.error ?? "INVALID_HEADER");
      pushCrcErrors();
      return failureResult(payload, crc, errors, parsed.fields);
    }

    const fields = parsed.fields;
    const duplicated = duplicateTagIn(fields);
    if (duplicated) {
      push("DUPLICATE_TAG", duplicated);
    }

    const payloadFormat = valueOf(fields, "00");
    if (fields[0]?.tag !== "00" || payloadFormat !== "01") {
      push("INVALID_PAYLOAD_FORMAT", "00");
    }

    const initiationCode = valueOf(fields, "01");
    const initiation: VietQrInitiation | null =
      initiationCode === "11" ? "STATIC" : initiationCode === "12" ? "DYNAMIC" : null;
    if (initiationCode !== null && initiation === null) {
      push("INVALID_INITIATION", "01");
    }

    // Template NAPAS: ưu tiên tag 38; nhiều template NAPAS cùng lúc là dấu hiệu "lệch bộ đọc"
    // (app A đọc template này, app B đọc template kia) → báo lỗi.
    const accountTemplates = fields.filter((field) => isAccountTemplateTag(field.tag));
    const napasTemplates = accountTemplates.filter((field) => valueOf(field.children, "00") === NAPAS_GUID);
    const napasTemplate = napasTemplates.find((field) => field.tag === "38") ?? napasTemplates[0];
    let napas: VietQrNapasAccount | null = null;
    if (!napasTemplate) {
      const tag38 = findField(fields, "38");
      push(tag38 && !tag38.children ? "INVALID_NAPAS_TEMPLATE" : "MISSING_NAPAS_TEMPLATE", "38");
    } else {
      if (napasTemplates.length > 1) {
        const extra = napasTemplates.find((field) => field !== napasTemplate);
        push("DUPLICATE_NAPAS_TEMPLATE", extra ? extra.tag : null);
      }
      napas = decodeNapasTemplate(napasTemplate, push);
    }
    const otherAccountTemplates = accountTemplates
      .filter((field) => field !== napasTemplate)
      .map((field) => ({ tag: field.tag, guid: valueOf(field.children, "00"), value: field.value }));

    const currency = valueOf(fields, "53");
    if (currency !== null && currency !== "704") {
      push("CURRENCY_NOT_VND", "53");
    }

    const amountText = valueOf(fields, "54");
    let amount: number | null = null;
    if (amountText !== null) {
      if (VND_AMOUNT_PATTERN.test(amountText)) {
        amount = Number(amountText);
      } else {
        push("INVALID_AMOUNT", "54");
      }
    }

    let additionalData = emptyAdditionalData();
    const additional = findField(fields, "62");
    if (additional) {
      if (!additional.children) {
        push("INVALID_ADDITIONAL_DATA", "62");
      } else {
        const duplicatedAdditional = duplicateTagIn(additional.children);
        if (duplicatedAdditional) {
          push("DUPLICATE_TAG", `62.${duplicatedAdditional}`);
        }
        const children = additional.children;
        additionalData = {
          billNumber: valueOf(children, "01"),
          mobileNumber: valueOf(children, "02"),
          storeLabel: valueOf(children, "03"),
          referenceLabel: valueOf(children, "05"),
          terminalLabel: valueOf(children, "07"),
          purpose: valueOf(children, "08"),
        };
      }
    }

    pushCrcErrors();

    return {
      ok: errors.length === 0,
      payload,
      fields,
      payloadFormat,
      initiation,
      napas,
      otherAccountTemplates,
      merchantCategoryCode: valueOf(fields, "52"),
      currency,
      amount,
      countryCode: valueOf(fields, "58"),
      merchantName: valueOf(fields, "59"),
      merchantCity: valueOf(fields, "60"),
      postalCode: valueOf(fields, "61"),
      additionalData,
      crc,
      errors,
    };
  } catch {
    // Phòng thủ chiều sâu: bộ TLV không ném lỗi, nhưng đầu vào lạ không được làm sập luồng quét.
    errors.length = 0;
    push("INVALID_HEADER");
    return failureResult("", NO_CRC, errors, []);
  }
}

/**
 * Bản nháp người nhận từ kết quả giải mã: chỉ khi mã hợp lệ hoàn toàn (`ok`, gồm CRC), dịch vụ là
 * QRIBFTTA / QRIBFTTC, BIN có trong danh bạ và STK / số thẻ đúng luật của ngân hàng đó.
 * Tên lấy từ tag 59 (IN HOA KHÔNG DẤU); nội dung ưu tiên 62.08 rồi 62.01 (qua `sanitizeMemo`).
 */
export function toPayeeDraftFromQr(result: VietQrParseResult): VietQrPayeeDraft | null {
  if (!result || typeof result !== "object" || !result.ok || !result.napas) {
    return null;
  }
  const { bin, accountNumber, serviceCode } = result.napas;
  if (!bin || !accountNumber || (serviceCode !== "QRIBFTTA" && serviceCode !== "QRIBFTTC")) {
    return null;
  }
  const bank = findVietnamBankByBin(bin);
  if (!bank) {
    return null;
  }
  const account = normalizeAccountNumber(accountNumber);
  const accountValid =
    serviceCode === "QRIBFTTC"
      ? bank.kind === "BANK" && CARD_NUMBER_PATTERN.test(account)
      : isValidAccountNumberFor(bank.code, account);
  if (!accountValid) {
    return null;
  }
  const { purpose, billNumber } = result.additionalData;
  return {
    institutionCode: bank.code,
    accountNumber: account,
    accountName: normalizeNapasAccountName(result.merchantName ?? ""),
    amount: result.amount,
    memo: sanitizeMemo(purpose ?? "") || sanitizeMemo(billNumber ?? ""),
    serviceCode,
  };
}

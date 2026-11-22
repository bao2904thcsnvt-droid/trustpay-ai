/**
 * Bộ phân tích EMVCo Merchant-Presented QR (chuẩn nền của VietQR/NAPAS 247),
 * chạy thuần trên trình duyệt hoặc Node — không phụ thuộc thư viện ngoài.
 *
 * Cấu trúc TLV: [Tag 2 chữ số][Độ dài 2 chữ số][Giá trị]. Một số tag là
 * "template" chứa TLV lồng bên trong (26–51 thông tin tài khoản, 62 dữ liệu bổ
 * sung, 64 ngôn ngữ thay thế, 80–99 dành riêng). Tag 63 là CRC-16/CCITT-FALSE
 * (đa thức 0x1021, giá trị đầu 0xFFFF) tính trên toàn chuỗi tính tới "6304".
 *
 * Mọi chuỗi đầu vào được coi là KHÔNG tin cậy: giới hạn độ dài, không eval,
 * lỗi cấu trúc được báo về dưới dạng mã lỗi thay vì ném ngoại lệ.
 */

export const EMV_MAX_PAYLOAD_LENGTH = 512;
export const EMV_CRC_TAG = "63";

export type TlvErrorCode = "EMPTY" | "TOO_LONG" | "INVALID_HEADER" | "TRUNCATED_VALUE";

export interface TlvField {
  tag: string;
  length: number;
  value: string;
  /** Vị trí ký tự bắt đầu của trường trong chuỗi gốc. */
  offset: number;
  /** TLV con khi trường là template (26–51, 62, 64, 80–99) và phân tích được. */
  children?: TlvField[];
}

export interface TlvParseResult {
  ok: boolean;
  fields: TlvField[];
  error?: TlvErrorCode;
  errorOffset?: number;
}

export interface CrcCheck {
  present: boolean;
  valid: boolean;
  /** CRC tính lại từ nội dung. */
  expected: string | null;
  /** CRC ghi trong mã (tag 63). */
  actual: string | null;
}

export function isTemplateTag(tag: string): boolean {
  const n = Number(tag);
  return (n >= 26 && n <= 51) || n === 62 || n === 64 || (n >= 80 && n <= 99);
}

/** Phân tích một chuỗi TLV phẳng (không đệ quy). */
export function parseTlvLevel(payload: string, offsetBase = 0): TlvParseResult {
  const fields: TlvField[] = [];
  if (!payload) {
    return { ok: false, fields, error: "EMPTY", errorOffset: offsetBase };
  }

  let index = 0;
  while (index < payload.length) {
    const tag = payload.slice(index, index + 2);
    const lengthText = payload.slice(index + 2, index + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      return { ok: false, fields, error: "INVALID_HEADER", errorOffset: offsetBase + index };
    }
    const length = Number(lengthText);
    const start = index + 4;
    const end = start + length;
    if (length === 0 || end > payload.length) {
      return { ok: false, fields, error: "TRUNCATED_VALUE", errorOffset: offsetBase + index };
    }
    fields.push({ tag, length, value: payload.slice(start, end), offset: offsetBase + index });
    index = end;
  }
  return { ok: true, fields };
}

/** Phân tích toàn bộ payload EMVCo, tự đi sâu vào các template lồng nhau (1 cấp + 1 cấp con). */
export function parseEmvPayload(rawPayload: string): TlvParseResult {
  const payload = rawPayload.trim();
  if (!payload) {
    return { ok: false, fields: [], error: "EMPTY", errorOffset: 0 };
  }
  if (payload.length > EMV_MAX_PAYLOAD_LENGTH) {
    return { ok: false, fields: [], error: "TOO_LONG", errorOffset: EMV_MAX_PAYLOAD_LENGTH };
  }

  const top = parseTlvLevel(payload);
  const expandNested = (field: TlvField): TlvField => {
    const nested = parseTlvLevel(field.value, field.offset + 4);
    return nested.ok ? { ...field, children: nested.fields } : field;
  };

  const fields = top.fields.map((field) => {
    if (!isTemplateTag(field.tag)) {
      return field;
    }
    const nested = parseTlvLevel(field.value, field.offset + 4);
    if (!nested.ok) {
      return field;
    }
    const tagNumber = Number(field.tag);
    const isAccountTemplate = tagNumber >= 26 && tagNumber <= 51;
    // VietQR: trong template tài khoản, sub-tag 01 (đơn vị thụ hưởng) lại là TLV gồm BIN + STK.
    const children = nested.fields.map((child) =>
      isAccountTemplate && child.tag === "01" ? expandNested(child) : child,
    );
    return { ...field, children };
  });

  return { ...top, fields };
}

function utf8Bytes(text: string): number[] {
  if (typeof TextEncoder !== "undefined") {
    return Array.from(new TextEncoder().encode(text));
  }
  return Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), trả về 4 ký tự hex in hoa. */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of utf8Bytes(input)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Kiểm tra CRC: tag 63 (độ dài 04) phải là trường cuối cùng của payload. */
export function verifyEmvCrc(rawPayload: string): CrcCheck {
  const payload = rawPayload.trim();
  if (payload.length < 8 || payload.slice(-8, -4) !== `${EMV_CRC_TAG}04`) {
    return { present: false, valid: false, expected: null, actual: null };
  }
  const actual = payload.slice(-4).toUpperCase();
  const expected = crc16Ccitt(payload.slice(0, -4));
  return { present: true, valid: actual === expected, expected, actual };
}

/** Ghép một trường TLV (dùng để dựng mã mẫu). Độ dài phải trong 1–99 ký tự. */
export function tlv(tag: string, value: string): string {
  if (!/^\d{2}$/.test(tag) || value.length === 0 || value.length > 99) {
    throw new Error(`TLV không hợp lệ cho tag ${tag}`);
  }
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

/** Dựng payload EMVCo hoàn chỉnh, tự nối tag 63 + CRC hợp lệ ở cuối. */
export function buildEmvPayload(fields: readonly string[]): string {
  const body = `${fields.join("")}${EMV_CRC_TAG}04`;
  return `${body}${crc16Ccitt(body)}`;
}

/** Tìm trường theo tag trong một cấp TLV. */
export function findField(fields: readonly TlvField[] | undefined, tag: string): TlvField | undefined {
  return fields?.find((field) => field.tag === tag);
}

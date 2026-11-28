/**
 * Danh bạ Ngân hàng / Ví điện tử Việt Nam chuẩn NAPAS — NGUỒN DỮ LIỆU DUY NHẤT cho:
 *   - `bin`    : BIN NAPAS 6 chữ số trong template 38 của VietQR (EMVCo).
 *   - `code`   : mã ngắn (trùng mã ngân hàng của VietQR, dùng cho ảnh `img.vietqr.io` và tham số
 *                `ba=<STK>@<mã>` của `dl.vietqr.io`). Giữ nguyên các mã đã lưu trong
 *                localStorage/tests (VCB, MB, TCB, BIDV, ACB, ICB, TPB, PVCB, VBA, MOMO), thêm VPB.
 *   - `appId`  : mã ứng dụng ngân hàng của NGƯỜI TRẢ cho `https://dl.vietqr.io/pay?app={appId}`.
 *
 * Đối chiếu với dữ liệu công khai của VietQR (Casso) — chỉ đọc dữ kiện:
 *   - https://api.vietqr.io/v2/banks: đủ 10 BIN ngân hàng bên dưới; Ví MoMo CÓ trong danh sách
 *     chính thức với BIN 971025, mã "momo" (CTCP Dịch Vụ Di Động Trực Tuyến).
 *   - https://api.vietqr.io/v2/android-app-deeplinks (35 ứng dụng) + /v2/ios-app-deeplinks (33)
 *     — API trực tiếp trả HTTP 522, đọc bản lưu Web Archive 25/10/2026: appId của PVcomBank là
 *     `pvcb` (ứng dụng PVConnect), không phải `pvcombank`; 9 appId còn lại trùng mã ngân hàng viết
 *     thường. Trong 10 ngân hàng ở đây chỉ icb/bidv/acb/mb có `autofill = 1` (tự điền lệnh chuyển);
 *     vcb/tcb/vpb/vba/tpb/pvcb chỉ mở ứng dụng. MoMo không có trong danh sách deeplink ngân hàng →
 *     mở bằng scheme `momo://`.
 *
 * Module thuần dữ liệu, KHÔNG import module nào khác để tránh vòng phụ thuộc
 * (`banks.ts`, `vietqr-builder.ts`, `bank-deeplinks.ts` đều đọc từ đây).
 */

export type VietnamBankCode =
  | "VCB"
  | "MB"
  | "TCB"
  | "BIDV"
  | "ACB"
  | "ICB"
  | "TPB"
  | "PVCB"
  | "VBA"
  | "VPB"
  | "MOMO";

export type VietnamInstitutionKind = "BANK" | "EWALLET";

/**
 * Định dạng STK sau chuẩn hóa (bỏ khoảng trắng, dấu chấm, gạch nối, gạch dưới; in hoa):
 * - `ALPHANUMERIC`: chữ số + chữ in hoa (gồm tài khoản định danh / tài khoản ảo của VietQR).
 * - `DIGITS`: chỉ chữ số.
 * - `VN_MOBILE`: số điện thoại di động Việt Nam, bắt đầu bằng 0.
 */
export type AccountNumberFormat = "ALPHANUMERIC" | "DIGITS" | "VN_MOBILE";

export interface AccountNumberRule {
  format: AccountNumberFormat;
  minLength: number;
  /** Trần NAPAS/EMVCo cho tag 38.01.01 là 19 ký tự. */
  maxLength: number;
}

export interface VietnamBank {
  readonly code: VietnamBankCode;
  readonly bin: string;
  readonly appId: string;
  readonly shortName: string;
  readonly fullName: string;
  readonly kind: VietnamInstitutionKind;
  /** Scheme mở thẳng ứng dụng (MoMo `momo://`); ngân hàng mở qua `dl.vietqr.io` → null. */
  readonly appScheme: string | null;
  /** Có dùng ảnh VietQR từ `img.vietqr.io` hay không (MoMo: vẽ QR trên máy). */
  readonly remoteImage: boolean;
  readonly accountRule: Readonly<AccountNumberRule>;
}

/** Độ dài tối đa tên chủ tài khoản liên ngân hàng (IN HOA KHÔNG DẤU). */
export const NAPAS_ACCOUNT_NAME_MAX = 50;

/**
 * Luật STK ngân hàng: 6–19 ký tự chữ số/chữ in hoa — trùng luật `validatePayeeAccount` hiện có.
 * Không ép độ dài riêng từng ngân hàng vì tài khoản số đẹp, tài khoản số điện thoại và tài khoản
 * định danh (vd `VQR…`) có độ dài khác chuẩn; ngân hàng nhận vẫn tự kiểm tra STK khi chuyển.
 */
const BANK_ACCOUNT_RULE: Readonly<AccountNumberRule> = Object.freeze({
  format: "ALPHANUMERIC",
  minLength: 6,
  maxLength: 19,
});

/** Ví MoMo nhận theo số điện thoại 10 số (trùng luật `validatePayeeAccount` cho EWALLET). */
const WALLET_PHONE_RULE: Readonly<AccountNumberRule> = Object.freeze({
  format: "VN_MOBILE",
  minLength: 10,
  maxLength: 10,
});

function bankEntry(entry: Pick<VietnamBank, "code" | "bin" | "appId" | "shortName" | "fullName">): VietnamBank {
  return Object.freeze({
    ...entry,
    kind: "BANK",
    appScheme: null,
    remoteImage: true,
    accountRule: BANK_ACCOUNT_RULE,
  });
}

/** Thứ tự giữ như danh bạ cũ (VCB đứng đầu là ứng dụng mặc định của người trả), VPBank thêm trước MoMo. */
export const VIETNAM_BANKS: readonly VietnamBank[] = Object.freeze([
  bankEntry({ code: "VCB", bin: "970436", appId: "vcb", shortName: "Vietcombank", fullName: "Ngân hàng TMCP Ngoại thương Việt Nam" }),
  bankEntry({ code: "MB", bin: "970422", appId: "mb", shortName: "MBBank", fullName: "Ngân hàng TMCP Quân đội" }),
  bankEntry({ code: "TCB", bin: "970407", appId: "tcb", shortName: "Techcombank", fullName: "Ngân hàng TMCP Kỹ thương Việt Nam" }),
  bankEntry({ code: "BIDV", bin: "970418", appId: "bidv", shortName: "BIDV", fullName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam" }),
  bankEntry({ code: "ACB", bin: "970416", appId: "acb", shortName: "ACB", fullName: "Ngân hàng TMCP Á Châu" }),
  bankEntry({ code: "ICB", bin: "970415", appId: "icb", shortName: "VietinBank", fullName: "Ngân hàng TMCP Công Thương Việt Nam" }),
  bankEntry({ code: "TPB", bin: "970423", appId: "tpb", shortName: "TPBank", fullName: "Ngân hàng TMCP Tiên Phong" }),
  bankEntry({ code: "PVCB", bin: "970412", appId: "pvcb", shortName: "PVcomBank", fullName: "Ngân hàng TMCP Đại Chúng Việt Nam" }),
  bankEntry({ code: "VBA", bin: "970405", appId: "vba", shortName: "Agribank", fullName: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam" }),
  bankEntry({ code: "VPB", bin: "970432", appId: "vpb", shortName: "VPBank", fullName: "Ngân hàng TMCP Việt Nam Thịnh Vượng" }),
  Object.freeze({
    code: "MOMO",
    bin: "971025",
    appId: "momo",
    shortName: "Ví MoMo",
    fullName: "Ví điện tử MoMo (M_Service)",
    kind: "EWALLET",
    appScheme: "momo://",
    remoteImage: false,
    accountRule: WALLET_PHONE_RULE,
  } satisfies VietnamBank),
]);

export function findVietnamBank(code: string | null | undefined): VietnamBank | undefined {
  if (typeof code !== "string" || !code) {
    return undefined;
  }
  return VIETNAM_BANKS.find((bank) => bank.code === code);
}

export function findVietnamBankByBin(bin: string | null | undefined): VietnamBank | undefined {
  if (typeof bin !== "string") {
    return undefined;
  }
  const value = bin.trim();
  if (!/^\d{6}$/.test(value)) {
    return undefined;
  }
  return VIETNAM_BANKS.find((bank) => bank.bin === value);
}

const GATEWAY_ALIASES: readonly (readonly [VietnamBankCode, RegExp])[] = [
  ["ICB", /\b(?:vietin\s?bank|viettinbank|icb|ctg|970415)\b/i],
  ["VCB", /\b(?:vietcom\s?bank|vcb|970436)\b/i],
  ["MB", /\b(?:mb\s?bank|mbbank|mb|970422)\b/i],
  ["TCB", /\b(?:techcom\s?bank|tcb|970407)\b/i],
  ["BIDV", /\b(?:bidv|970418)\b/i],
  ["ACB", /\b(?:acb|970416)\b/i],
  ["TPB", /\b(?:tp\s?bank|tpbank|tpb|970423)\b/i],
  ["PVCB", /\b(?:pvcom\s?bank|pvcombank|pvcb|970412)\b/i],
  ["VBA", /\b(?:agri\s?bank|agribank|vba|970405)\b/i],
  ["VPB", /\b(?:vp\s?bank|vpbank|vpb|970432)\b/i],
  ["MOMO", /\b(?:momo|971025)\b/i],
];

/** Đối chiếu tên cổng ngân hàng từ Webhook SePay / Casso (vd "VietinBank", "MBBank") về mã ngân hàng chuẩn. */
export function findVietnamBankByGateway(gateway: string | null | undefined): VietnamBank | undefined {
  if (typeof gateway !== "string" || !gateway.trim()) {
    return undefined;
  }
  const raw = gateway.trim();
  const byCode = findVietnamBank(raw.toUpperCase());
  if (byCode) return byCode;
  const byBin = findVietnamBankByBin(raw);
  if (byBin) return byBin;
  for (const [code, pattern] of GATEWAY_ALIASES) {
    if (pattern.test(raw)) {
      return findVietnamBank(code);
    }
  }
  return undefined;
}

/**
 * Tên chủ tài khoản chuẩn liên ngân hàng: IN HOA KHÔNG DẤU (đ/Đ → D), chỉ A–Z, 0–9 và khoảng
 * trắng, gộp khoảng trắng, cắt hai đầu, tối đa 50 ký tự. Vd "  Nguyễn Văn  Đức " → "NGUYEN VAN DUC".
 */
export function normalizeNapasAccountName(raw: string, maxLength: number = NAPAS_ACCOUNT_NAME_MAX): string {
  if (typeof raw !== "string") {
    return "";
  }
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

/** Chuẩn hóa STK người dùng nhập — cùng quy tắc với `normalizeAccountNumber` (vietqr-builder). */
function normalizeAccountInput(raw: string): string {
  return raw.replace(/[\s.\-_]/g, "").toUpperCase();
}

/** STK / SĐT ví có hợp lệ với luật của ngân hàng / ví `code` hay không (mã lạ → false). */
export function isValidAccountNumberFor(code: string, raw: string): boolean {
  const bank = findVietnamBank(code);
  if (!bank || typeof raw !== "string") {
    return false;
  }
  const value = normalizeAccountInput(raw);
  const { format, minLength, maxLength } = bank.accountRule;
  if (value.length < minLength || value.length > maxLength) {
    return false;
  }
  if (format === "VN_MOBILE") {
    return /^0\d+$/.test(value);
  }
  if (format === "DIGITS") {
    return /^\d+$/.test(value);
  }
  return /^[0-9A-Z]+$/.test(value);
}

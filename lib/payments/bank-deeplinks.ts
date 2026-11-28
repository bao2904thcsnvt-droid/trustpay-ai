/**
 * App-to-App Banking Deep Link — mở thẳng ứng dụng ngân hàng / ví của NGƯỜI TRẢ với lệnh chuyển
 * khoản Napas 247 đã điền sẵn (TrustPay không giữ tiền: người dùng tự xác nhận bằng Smart OTP /
 * sinh trắc học của chính ngân hàng).
 *
 *   https://dl.vietqr.io/pay?app=<appId>&ba=<STK>@<mã ngân hàng>&am=<số tiền>&tn=<nội dung>&bn=<tên người nhận>
 *
 * `appId` là mã ứng dụng của ngân hàng NGƯỜI TRẢ (vd `vcb`, `mb`); `ba` trỏ tới tài khoản NHẬN.
 * Theo tài liệu VietQR (https://www.vietqr.io/danh-sach-api/deeplink-app-ngan-hang/), `ba` có dạng
 * SO_TAI_KHOAN@MA_NGAN_HANG (ví dụ `113366668888@vcb`): đuôi là MÃ ngân hàng viết thường, không
 * phải BIN. Hàm vẫn nhận BIN NAPAS 6 số (giữ nguyên chữ ký) và tra mã trong `lib/vietnam-banks.ts`;
 * BIN ngoài danh bạ → `null` thay vì đoán.
 * Mọi giá trị đều được chuẩn hóa / mã hóa URL tại đây — không bao giờ ghép chuỗi thô từ người dùng.
 */
import {
  isValidVietQrAmount,
  normalizeAccountNumber,
  sanitizeAccountName,
  sanitizeMemo,
  VIETQR_DEEPLINK_BASE,
} from "@/lib/payments/vietqr-builder";
import { findVietnamBankByBin } from "@/lib/vietnam-banks";

export interface BankTransferDeepLinkInput {
  /** Mã ứng dụng của ngân hàng NGƯỜI TRẢ (vd `vcb`, `mb`, `tcb`). */
  appId: string;
  /** BIN NAPAS 6 chữ số của ngân hàng NHẬN. */
  bankBin: string;
  /** Số tài khoản / số thẻ NHẬN. */
  accountNumber: string;
  /** Số tiền VND (bỏ trống → người trả tự nhập trong app ngân hàng). */
  amount?: number | null;
  /** Nội dung chuyển khoản (tự bỏ dấu, tối đa 25 ký tự theo VietQR). */
  memo?: string;
  /** Tên người nhận (tự chuyển IN HOA KHÔNG DẤU). */
  accountName?: string;
}

/** appId chính thức gồm chữ thường/chữ số, có thể có gạch nối ở giữa (vd `vib-2`, `acb-biz`). */
const APP_ID_PATTERN = /^(?=.{2,24}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BIN_PATTERN = /^\d{6}$/;
const ACCOUNT_PATTERN = /^[0-9A-Z]{6,19}$/;

/** Scheme mở ứng dụng Ví MoMo trên điện thoại. */
export const MOMO_APP_SCHEME = "momo://";

/**
 * Deep Link chuyển khoản liên ngân hàng điền sẵn STK + số tiền + nội dung + tên người nhận.
 * Trả về `null` nếu dữ liệu không hợp lệ (không bao giờ dựng link sai lệch tới tài khoản lạ).
 */
export function buildBankTransferDeepLink(input: BankTransferDeepLinkInput): string | null {
  const appId = input.appId.trim().toLowerCase();
  const bankBin = input.bankBin.trim();
  const account = normalizeAccountNumber(input.accountNumber).toUpperCase();
  if (!APP_ID_PATTERN.test(appId) || !BIN_PATTERN.test(bankBin) || !ACCOUNT_PATTERN.test(account)) {
    return null;
  }
  const receivingBank = findVietnamBankByBin(bankBin);
  if (!receivingBank) {
    return null;
  }

  // Mã ngân hàng viết thường như ví dụ chính thức (`@vcb`); MoMo trong danh sách VietQR là "momo".
  const params = [`app=${encodeURIComponent(appId)}`, `ba=${account}@${receivingBank.code.toLowerCase()}`];
  if (isValidVietQrAmount(input.amount ?? null)) {
    params.push(`am=${input.amount}`);
  }
  const memo = input.memo ? sanitizeMemo(input.memo) : "";
  if (memo) {
    params.push(`tn=${encodeURIComponent(memo)}`);
  }
  const name = input.accountName ? sanitizeAccountName(input.accountName) : "";
  if (name) {
    params.push(`bn=${encodeURIComponent(name)}`);
  }
  return `${VIETQR_DEEPLINK_BASE}?${params.join("&")}`;
}

/** Link mở ứng dụng Ví MoMo (người dùng quét / chọn ảnh mã VietQR đã lưu trong app MoMo). */
export function buildMomoAppLink(): string {
  return MOMO_APP_SCHEME;
}

/**
 * Danh bạ Ngân hàng / Ví nhận tiền thật cho luồng "Real Payment Handoff".
 *
 * Dữ liệu SUY RA từ nguồn duy nhất `lib/vietnam-banks.ts` (đã đối chiếu danh sách VietQR/NAPAS):
 * - `bin`: mã BIN NAPAS 6 chữ số, dùng trong template 38 của VietQR (EMVCo).
 * - `code`: mã ngắn theo danh sách VietQR (dùng trong ảnh `img.vietqr.io`).
 * - `slug`: mã ứng dụng (`appId`) cho liên kết `https://dl.vietqr.io/pay?app={slug}`.
 *
 * Ví MoMo: BIN 971025 có trong danh sách ngân hàng chính thức của VietQR (mã "momo"), nhưng ảnh
 * VietQR từ xa vẫn tắt cho MoMo và mã QR được vẽ ngay trên máy.
 */
import { VIETNAM_BANKS, type VietnamBankCode, type VietnamInstitutionKind } from "@/lib/vietnam-banks";

export type PayeeInstitutionCode = VietnamBankCode;

export type PayeeInstitutionKind = VietnamInstitutionKind;

export interface PayeeInstitution {
  code: PayeeInstitutionCode;
  bin: string;
  slug: string;
  shortName: string;
  fullName: string;
  kind: PayeeInstitutionKind;
  /** Có dùng ảnh VietQR từ `img.vietqr.io` hay không (MoMo: vẽ QR trên máy). */
  remoteImage: boolean;
}

export const PAYEE_INSTITUTIONS: readonly PayeeInstitution[] = Object.freeze(
  VIETNAM_BANKS.map((bank) => ({
    code: bank.code,
    bin: bank.bin,
    slug: bank.appId,
    shortName: bank.shortName,
    fullName: bank.fullName,
    kind: bank.kind,
    remoteImage: bank.remoteImage,
  })),
);

/** Ứng dụng ngân hàng của NGƯỜI TRẢ có thể mở bằng VietQR DeepLink (không gồm ví MoMo). */
export const PAYER_BANK_APPS: readonly PayeeInstitution[] = PAYEE_INSTITUTIONS.filter((item) => item.kind === "BANK");

export function findInstitution(code: string | null | undefined): PayeeInstitution | undefined {
  if (!code) {
    return undefined;
  }
  return PAYEE_INSTITUTIONS.find((item) => item.code === code);
}

export function findInstitutionByBin(bin: string | null | undefined): PayeeInstitution | undefined {
  if (!bin) {
    return undefined;
  }
  return PAYEE_INSTITUTIONS.find((item) => item.bin === bin);
}

export function isPayeeInstitutionCode(value: unknown): value is PayeeInstitutionCode {
  return typeof value === "string" && PAYEE_INSTITUTIONS.some((item) => item.code === value);
}

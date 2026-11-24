/**
 * Danh bạ Ngân hàng / Ví nhận tiền thật cho luồng "Real Payment Handoff".
 *
 * - `bin`: mã BIN NAPAS 6 chữ số, dùng trong template 38 của VietQR (EMVCo).
 * - `code`: mã ngắn theo danh sách VietQR (dùng trong ảnh `img.vietqr.io`).
 * - `slug`: mã ứng dụng cho liên kết `https://dl.vietqr.io/pay?app={slug}`.
 *
 * Lưu ý: `MOMO` dùng mã trung gian thanh toán 971025 — CHƯA được kiểm chứng với
 * danh sách VietQR/NAPAS mới nhất trong môi trường không có Internet, nên ảnh
 * VietQR từ xa bị tắt cho MoMo và mã QR được vẽ ngay trên máy.
 */

export type PayeeInstitutionCode = "VCB" | "MB" | "TCB" | "BIDV" | "ACB" | "ICB" | "TPB" | "PVCB" | "VBA" | "MOMO";

export type PayeeInstitutionKind = "BANK" | "EWALLET";

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

export const PAYEE_INSTITUTIONS: readonly PayeeInstitution[] = [
  { code: "VCB", bin: "970436", slug: "vcb", shortName: "Vietcombank", fullName: "Ngân hàng TMCP Ngoại thương Việt Nam", kind: "BANK", remoteImage: true },
  { code: "MB", bin: "970422", slug: "mb", shortName: "MBBank", fullName: "Ngân hàng TMCP Quân đội", kind: "BANK", remoteImage: true },
  { code: "TCB", bin: "970407", slug: "tcb", shortName: "Techcombank", fullName: "Ngân hàng TMCP Kỹ thương Việt Nam", kind: "BANK", remoteImage: true },
  { code: "BIDV", bin: "970418", slug: "bidv", shortName: "BIDV", fullName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam", kind: "BANK", remoteImage: true },
  { code: "ACB", bin: "970416", slug: "acb", shortName: "ACB", fullName: "Ngân hàng TMCP Á Châu", kind: "BANK", remoteImage: true },
  { code: "ICB", bin: "970415", slug: "icb", shortName: "VietinBank", fullName: "Ngân hàng TMCP Công thương Việt Nam", kind: "BANK", remoteImage: true },
  { code: "TPB", bin: "970423", slug: "tpb", shortName: "TPBank", fullName: "Ngân hàng TMCP Tiên Phong", kind: "BANK", remoteImage: true },
  { code: "PVCB", bin: "970412", slug: "pvcb", shortName: "PVcomBank", fullName: "Ngân hàng TMCP Đại Chúng Việt Nam", kind: "BANK", remoteImage: true },
  // Vòng 6: Agribank (BIN 970405 đã có trong danh bạ VietQR Inspector). Mã `VBA` / slug `vba` theo danh sách VietQR — chưa kiểm chứng trực tuyến.
  { code: "VBA", bin: "970405", slug: "vba", shortName: "Agribank", fullName: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam", kind: "BANK", remoteImage: true },
  { code: "MOMO", bin: "971025", slug: "momo", shortName: "Ví MoMo", fullName: "Ví điện tử MoMo (M_Service)", kind: "EWALLET", remoteImage: false },
];

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

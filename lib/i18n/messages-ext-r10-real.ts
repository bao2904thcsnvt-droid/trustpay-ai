/**
 * Từ điển VI/EN vòng 10 — Quét QR ngoài đời → chuyển tiền thật qua app ngân hàng (non-custodial).
 * Trộn vào `Messages` trong `lib/i18n/messages.ts`.
 */

export const viExtR10Real = {
  qrReal: {
    openBank: "Mở App Ngân hàng thanh toán ngay",
    hint: "Điền sẵn người nhận từ mã QR vào màn hình chuyển tiền thật. Lá chắn AI kiểm tra lại, sau đó bạn xác nhận trong app ngân hàng / MoMo của mình.",
    walletPay: (amount: string) => `Ghi nhận vào ví TrustPay (${amount})`,
    noPayee: "Mã QR này không chứa tài khoản NAPAS hợp lệ (hoặc CRC-16 sai) — không thể mở app ngân hàng.",
    crcBroken: "CRC-16 không khớp: mã QR có thể đã bị chỉnh sửa. Không chuyển tiền theo mã này.",
    toastTitle: (bank: string) => `Đã điền sẵn người nhận ${bank} từ mã QR`,
    toastDesc: "Lá chắn AI đang kiểm tra. Khi an toàn, bấm “Mở App Ngân hàng” để chuyển tiền thật.",
    fallbackPurpose: "thanh toán theo mã QR",
  },
  vaultAudit: {
    linked: "Đã ghi liên kết tài khoản vào chuỗi Audit SHA-256",
  },
};

export type ExtR10RealMessages = typeof viExtR10Real;

export const enExtR10Real: ExtR10RealMessages = {
  qrReal: {
    openBank: "Open banking app to pay now",
    hint: "Pre-fills the payee from this QR into the real transfer screen. The AI Shield re-checks it, then you confirm inside your own banking / MoMo app.",
    walletPay: (amount: string) => `Record in TrustPay wallet (${amount})`,
    noPayee: "This QR has no valid NAPAS account (or its CRC-16 is wrong) — cannot open a banking app.",
    crcBroken: "CRC-16 mismatch: this QR may have been tampered with. Do not transfer using it.",
    toastTitle: (bank: string) => `Payee at ${bank} pre-filled from QR`,
    toastDesc: "The AI Shield is checking it. When safe, tap “Open banking app” to send real money.",
    fallbackPurpose: "QR payment",
  },
  vaultAudit: {
    linked: "Account link recorded in the SHA-256 audit chain",
  },
};

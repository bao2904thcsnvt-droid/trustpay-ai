/**
 * Che giấu PII để HIỂN THỊ trên trình duyệt (Ví, khung Người giám hộ, Ops, biên
 * bản .txt) theo Nghị định 13/2023/NĐ-CP.
 *
 * Cùng quy tắc với `lib/security/pii-masking.ts` (CCCD 12 số giữ 3 đầu + 3 cuối,
 * SĐT 10 số, STK 6–19 số giữ 2 đầu + 3 cuối) nhưng KHÔNG phụ thuộc `node:crypto`
 * nên an toàn để import vào Client Component. Module máy chủ vẫn là nguồn sự
 * thật cho log/Audit; file này chỉ phục vụ lớp hiển thị.
 */

function maskAccountRun(run: string): string {
  const hidden = "*".repeat(Math.max(1, run.length - 5));
  return `${run.slice(0, 2)}${hidden}${run.slice(run.length - 3)}`;
}

/** Lượt 1 (giống `maskPiiInText`): che CCCD 12 số và SĐT 10 số bắt đầu bằng 0. */
function maskCccdOrPhoneRun(run: string): string {
  if (run.length === 12) {
    return `${run.slice(0, 3)}${"*".repeat(6)}${run.slice(9)}`;
  }
  if (run.length === 10 && run.startsWith("0")) {
    return `${run.slice(0, 3)}${"*".repeat(3)}${run.slice(7)}`;
  }
  return run;
}

/**
 * Che CCCD/SĐT/STK xuất hiện trong chuỗi người nhận hoặc văn bản tự do, giữ lại
 * phần tên để người xem vẫn nhận biết đối tượng. Hai lượt thay thế giống hệt
 * `maskRecipientForOps` (lượt 2 che các dãy STK 6–19 chữ số còn lại).
 */
export function maskRecipientForDisplay(text: string): string {
  if (!text) {
    return text;
  }
  const pre = text.replace(/\d{6,}/g, (run) => maskCccdOrPhoneRun(run));
  return pre.replace(/\d{6,19}/g, (run) => maskAccountRun(run));
}

/**
 * Che số điện thoại người giám hộ dạng `0909***888` (giữ 4 số đầu, 3 số cuối).
 * Nếu chuỗi đã được che sẵn (chứa `*`) thì giữ nguyên.
 */
export function maskPhoneForDisplay(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed || trimmed.includes("*")) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9) {
    return trimmed;
  }
  return `${digits.slice(0, 4)}***${digits.slice(digits.length - 3)}`;
}

/** Kiểm tra định dạng số điện thoại người dùng nhập (9–11 chữ số, cho phép dạng đã che). */
export function isPlausiblePhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (/^\+?[\d\s.*-]{9,16}$/.test(trimmed) === false) {
    return false;
  }
  const digitsAndMasks = trimmed.replace(/[^\d*]/g, "");
  return digitsAndMasks.length >= 9 && digitsAndMasks.length <= 12;
}

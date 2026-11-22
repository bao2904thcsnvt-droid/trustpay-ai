import { createHash } from "node:crypto";

/**
 * Tiện ích che giấu dữ liệu cá nhân (PII) cho TrustPay AI.
 *
 * Căn cứ Nghị định 13/2023/NĐ-CP: số CCCD/định danh cá nhân là dữ liệu cá nhân
 * cơ bản; dữ liệu tài khoản/giao dịch và sinh trắc học là dữ liệu nhạy cảm.
 * Mọi dữ liệu rời khỏi biên tin cậy (log, Audit Trail, giao diện Ops, prompt gửi
 * LLM) đều phải đi qua các hàm che giấu dưới đây.
 *
 * Module thuần TypeScript, không phụ thuộc thư viện ngoài, chỉ dùng cho tầng
 * máy chủ / kiểm thử (Node). Không import vào Client Component.
 *
 * Lưu ý: tránh dùng lookbehind trong regex để tương thích target ES2017.
 */

/** Che số CCCD 12 chữ số: giữ 3 số đầu và 3 số cuối. */
export function maskCccd(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 12) {
    return value;
  }
  return `${digits.slice(0, 3)}${"*".repeat(6)}${digits.slice(9)}`;
}

/** Che số điện thoại 10 chữ số (bắt đầu bằng 0): giữ 3 số đầu và 4 số cuối. */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10 || !digits.startsWith("0")) {
    return value;
  }
  return `${digits.slice(0, 3)}${"*".repeat(3)}${digits.slice(7)}`;
}

/** Che số tài khoản (6–19 chữ số): giữ 2 số đầu và 3 số cuối. */
export function maskAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 19) {
    return value;
  }
  const masked = "*".repeat(Math.max(1, digits.length - 5));
  return `${digits.slice(0, 2)}${masked}${digits.slice(digits.length - 3)}`;
}

/** True nếu văn bản chứa một dãy đúng 12 chữ số (nghi là CCCD chưa che). */
export function containsRawCccd(text: string): boolean {
  if (!text) {
    return false;
  }
  const runs = text.match(/\d{6,}/g);
  return runs !== null && runs.some((run) => run.length === 12);
}

/**
 * Che toàn bộ CCCD (12 số) và số điện thoại (10 số bắt đầu bằng 0) xuất hiện
 * trong văn bản tự do. Dùng trước khi ghi log/Audit hoặc đưa vào prompt LLM.
 */
export function maskPiiInText(text: string): string {
  if (!text) {
    return text;
  }
  return text.replace(/\d{6,}/g, (run) => {
    if (run.length === 12) {
      return `${run.slice(0, 3)}${"*".repeat(6)}${run.slice(9)}`;
    }
    if (run.length === 10 && run.startsWith("0")) {
      return `${run.slice(0, 3)}${"*".repeat(3)}${run.slice(7)}`;
    }
    return run;
  });
}

/**
 * Che chuỗi người nhận hiển thị cho Ops: che CCCD/SĐT và che phần số tài khoản
 * dài, giữ lại tên để chuyên viên vẫn nhận biết đối tượng.
 */
export function maskRecipientForOps(recipient: string): string {
  if (!recipient) {
    return recipient;
  }
  const pre = maskPiiInText(recipient);
  return pre.replace(/\d{6,19}/g, (run) => maskAccountNumber(run));
}

/** Băm SHA-256 (hex) văn bản lệnh để lưu đối chiếu thay vì lưu bản thô. */
export function hashCommandText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface MaskedAuditView {
  recipientMasked: string;
  commandHash: string;
  amountBucket: string;
}

/** Chuẩn hóa một payload để đưa vào log/Audit: che PII và băm văn bản gốc. */
export function toMaskedAuditView(params: {
  recipient: string;
  commandText: string;
  amount: number;
}): MaskedAuditView {
  return {
    recipientMasked: maskRecipientForOps(params.recipient),
    commandHash: hashCommandText(params.commandText),
    amountBucket: bucketAmount(params.amount),
  };
}

/** Gom số tiền thành dải để giảm độ nhận dạng trong nhật ký phân tích. */
export function bucketAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "0";
  }
  if (amount < 1_000_000) {
    return "<1tr";
  }
  if (amount <= 10_000_000) {
    return "1tr-10tr";
  }
  if (amount <= 20_000_000) {
    return "10tr-20tr";
  }
  return ">20tr";
}

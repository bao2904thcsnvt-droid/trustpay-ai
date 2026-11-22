import type { RiskLevel } from "@/types/trustpay";

/**
 * Chính sách xác thực sinh trắc học (step-up) tập trung cho TrustPay AI.
 *
 * Căn cứ:
 *  - Quyết định 2345/QĐ-NHNN: xác thực sinh trắc học với giao dịch trực tuyến
 *    trên 10.000.000 VNĐ/lần hoặc tổng trên 20.000.000 VNĐ/ngày.
 *  - Thông tư 50/2024/TT-NHNN: mở rộng xác thực mạnh cho dịch vụ trung gian
 *    thanh toán (ví điện tử), ràng buộc thiết bị tin cậy.
 *
 * Ngưỡng đọc qua biến môi trường để cập nhật mà không phát hành lại mã nguồn.
 */

function readVndThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw.replace(/[_,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Ngưỡng giá trị một lần giao dịch bắt buộc sinh trắc học (mặc định 10 triệu VNĐ). */
export const BIOMETRIC_SINGLE_TXN_THRESHOLD_VND = readVndThreshold(
  "BIOMETRIC_SINGLE_TXN_THRESHOLD_VND",
  10_000_000,
);

/** Ngưỡng lũy kế trong ngày bắt buộc sinh trắc học (mặc định 20 triệu VNĐ). */
export const BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND = readVndThreshold(
  "BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND",
  20_000_000,
);

export interface BiometricDecisionInput {
  /** Số tiền giao dịch hiện tại (VNĐ). */
  parsedAmount: number;
  /** Mức rủi ro do Lá Chắn AI chấm. */
  riskLevel: RiskLevel;
  /** Tổng đã chuyển trong ngày trước giao dịch này (VNĐ). Mặc định 0. */
  dailyCumulativeBefore?: number;
  /** Giao dịch thực hiện trên thiết bị mới/chưa tin cậy. */
  isNewDevice?: boolean;
}

export interface BiometricDecision {
  requireBiometric: boolean;
  reasons: string[];
  legalBasis: string[];
}

/**
 * Quyết định có bắt buộc xác thực sinh trắc học hay không.
 * Nguyên tắc "sàn an toàn": bất kỳ điều kiện nào đúng đều kích hoạt step-up.
 */
export function decideBiometric(input: BiometricDecisionInput): BiometricDecision {
  const reasons: string[] = [];
  const legalBasis: string[] = [];

  const amount = Number.isFinite(input.parsedAmount) ? input.parsedAmount : 0;
  const dailyBefore = Number.isFinite(input.dailyCumulativeBefore ?? 0)
    ? input.dailyCumulativeBefore ?? 0
    : 0;

  if (input.riskLevel === "HIGH") {
    reasons.push("Lá Chắn AI xếp giao dịch ở mức rủi ro CAO");
    legalBasis.push("TT 50/2024/TT-NHNN — cảnh báo giao dịch bất thường");
  }

  if (amount > BIOMETRIC_SINGLE_TXN_THRESHOLD_VND) {
    reasons.push(
      `Giá trị giao dịch ${amount.toLocaleString("vi-VN")} VNĐ vượt ngưỡng ${BIOMETRIC_SINGLE_TXN_THRESHOLD_VND.toLocaleString("vi-VN")} VNĐ/lần`,
    );
    legalBasis.push("QĐ 2345/QĐ-NHNN — ngưỡng trên 10 triệu VNĐ/lần");
  }

  if (dailyBefore + amount > BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND) {
    reasons.push(
      `Tổng giao dịch trong ngày ${(dailyBefore + amount).toLocaleString("vi-VN")} VNĐ vượt ngưỡng ${BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND.toLocaleString("vi-VN")} VNĐ/ngày`,
    );
    legalBasis.push("QĐ 2345/QĐ-NHNN — ngưỡng lũy kế trên 20 triệu VNĐ/ngày");
  }

  if (input.isNewDevice === true) {
    reasons.push("Giao dịch trên thiết bị mới/chưa tin cậy");
    legalBasis.push("TT 50/2024/TT-NHNN — ràng buộc thiết bị tin cậy");
  }

  return {
    requireBiometric: reasons.length > 0,
    reasons,
    legalBasis: Array.from(new Set(legalBasis)),
  };
}

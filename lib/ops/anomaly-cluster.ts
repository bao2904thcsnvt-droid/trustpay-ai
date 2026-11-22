import type { FintechOpsTicket } from "@/types/trustpay";

/**
 * Kịch bản cảnh báo bất thường toàn cục trên màn hình Ops: nhiều tài khoản khác
 * nhau cùng đổ tiền vào một STK trung chuyển (mule account) trong cửa sổ ngắn —
 * dấu hiệu đường dây lừa đảo. Dữ liệu tĩnh mô phỏng luồng sự kiện realtime.
 */

export const ANOMALY_CLUSTER_PATTERN = "1903xxxx";
export const ANOMALY_HUB_ACCOUNT = "1903888999";
export const ANOMALY_WINDOW_MINUTES = 5;

export interface InboundTransferEvent {
  senderAccount: string;
  senderBank: string;
  amount: number;
  timeLabel: string;
}

/** 5 tài khoản khác nhau cùng chuyển vào STK 1903xxxx trong vòng 5 phút. */
export const ANOMALY_INBOUND_TRANSFERS: readonly InboundTransferEvent[] = [
  { senderAccount: "0071003456789", senderBank: "Vietcombank", amount: 4_800_000, timeLabel: "14:31:05" },
  { senderAccount: "1909441286701", senderBank: "Techcombank", amount: 9_500_000, timeLabel: "14:32:12" },
  { senderAccount: "0451000273391", senderBank: "VietinBank", amount: 2_000_000, timeLabel: "14:33:40" },
  { senderAccount: "21510000418827", senderBank: "BIDV", amount: 15_000_000, timeLabel: "14:34:18" },
  { senderAccount: "0938117264", senderBank: "Ví điện tử", amount: 6_200_000, timeLabel: "14:35:02" },
];

/** Cụm STK trung chuyển cùng tiền tố 1903 được truy vết ra từ đường dây. */
export const ANOMALY_LINKED_MULE_ACCOUNTS: readonly string[] = [
  ANOMALY_HUB_ACCOUNT,
  "1903456721",
  "1903772018",
  "1903660594",
];

export function totalInboundAmount(): number {
  return ANOMALY_INBOUND_TRANSFERS.reduce((sum, event) => sum + event.amount, 0);
}

/**
 * Kế hoạch "Truy vết & Phong tỏa cụm STK": mục cụm `1903xxxx` + các STK cụ thể
 * vào Blacklist sống, kèm ticket BLOCKED để lưu vết cho Ops/Audit.
 */
export function buildClusterLockPlan(input: { ticketId: string; lockedAt: string }): {
  entries: string[];
  ticket: FintechOpsTicket;
} {
  const total = totalInboundAmount();
  return {
    entries: [ANOMALY_CLUSTER_PATTERN, ...ANOMALY_LINKED_MULE_ACCOUNTS],
    ticket: {
      ticketId: input.ticketId,
      timestamp: input.lockedAt,
      recipient: `Cụm STK ${ANOMALY_CLUSTER_PATTERN}`,
      amount: total,
      riskLevel: "HIGH",
      riskScore: 97,
      summary: `Truy vết đường dây: ${ANOMALY_INBOUND_TRANSFERS.length} tài khoản khác nhau cùng chuyển tiền vào STK ${ANOMALY_CLUSTER_PATTERN} trong ${ANOMALY_WINDOW_MINUTES} phút. Đã phong tỏa cụm ${ANOMALY_LINKED_MULE_ACCOUNTS.length} STK liên quan và đồng bộ Blacklist sống sang Ví.`,
      recommendedAction:
        "Phối hợp ngân hàng thụ hưởng tạm khóa cụm STK, lập hồ sơ gửi cơ quan công an và cảnh báo các khách hàng đã chuyển tiền.",
      status: "BLOCKED",
    },
  };
}

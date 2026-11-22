import type {
  BudgetCategory,
  CategoryName,
  FintechOpsTicket,
  RecurringSubscription,
  TrustedGuardian,
  TrustPayWalletState,
} from "@/types/trustpay";
import { DEFAULT_BLACKLIST } from "@/lib/mock-scenarios";

/**
 * Dữ liệu gốc của Ví TrustPay (dùng khi mở lần đầu và khi bấm "Đặt lại dữ liệu
 * gốc / Reset Demo"). Mọi giá trị là hằng số tĩnh — không gọi thời gian thực
 * hay số ngẫu nhiên — để an toàn khi prerender với Cache Components.
 *
 * Lưu ý: `DEFAULT_BUDGETS` trong `lib/mock-scenarios.ts` (có `Di chuyển`) được
 * giữ nguyên cho bộ test và API; Ví dùng bộ 4 danh mục riêng dưới đây.
 */

export const DEFAULT_WALLET_BALANCE = 15_000_000;

/** Thứ tự hiển thị 4 danh mục ngân sách của Ví. */
export const WALLET_CATEGORIES: readonly CategoryName[] = ["Ăn uống", "Mua sắm", "Hóa đơn", "Khác"];

export function createDefaultWalletBudgets(): BudgetCategory[] {
  return [
    { id: "b1", name: "Ăn uống", limit: 3_000_000, spent: 1_200_000 },
    { id: "b2", name: "Mua sắm", limit: 4_000_000, spent: 2_500_000 },
    { id: "b3", name: "Hóa đơn", limit: 2_500_000, spent: 1_150_000 },
    { id: "b4", name: "Khác", limit: 2_000_000, spent: 500_000 },
  ];
}

export const DEFAULT_GUARDIAN: TrustedGuardian = {
  name: "Nguyễn Văn A",
  phone: "0909***888",
};

export function createDefaultSubscriptions(): RecurringSubscription[] {
  return [
    {
      id: "sub-evn",
      name: "Tiền điện EVN HCMC",
      monthlyAmount: 850_000,
      category: "Hóa đơn",
      billingDay: 5,
      usageLevel: "HIGH",
      isTrial: false,
      status: "ACTIVE",
    },
    {
      id: "sub-sawaco",
      name: "Tiền nước Sawaco",
      monthlyAmount: 180_000,
      category: "Hóa đơn",
      billingDay: 8,
      usageLevel: "HIGH",
      isTrial: false,
      status: "ACTIVE",
    },
    {
      id: "sub-4g",
      name: "Gói 4G Viettel ST120K",
      monthlyAmount: 120_000,
      category: "Hóa đơn",
      billingDay: 12,
      usageLevel: "HIGH",
      isTrial: false,
      status: "ACTIVE",
    },
    {
      id: "sub-netflix",
      name: "Netflix Premium",
      monthlyAmount: 260_000,
      category: "Hóa đơn",
      billingDay: 18,
      usageLevel: "LOW",
      isTrial: false,
      status: "ACTIVE",
    },
    {
      id: "sub-spotify",
      name: "Spotify Premium",
      monthlyAmount: 59_000,
      category: "Hóa đơn",
      billingDay: 20,
      usageLevel: "MEDIUM",
      isTrial: false,
      status: "ACTIVE",
    },
    {
      id: "sub-trial-elsa",
      name: "ELSA Speak Pro (dùng thử 7 ngày)",
      monthlyAmount: 299_000,
      category: "Hóa đơn",
      billingDay: 25,
      usageLevel: "LOW",
      isTrial: true,
      status: "ACTIVE",
    },
  ];
}

export function createDefaultOpsTickets(): FintechOpsTicket[] {
  return [
    {
      ticketId: "TCK-20261120-001",
      timestamp: "2026-11-20T14:38:00.000Z",
      recipient: "1903888999",
      amount: 5_000_000,
      riskLevel: "HIGH",
      riskScore: 95,
      summary:
        "Phát hiện giao dịch chuyển 5.000.000đ tới tài khoản Blacklist với dấu hiệu lừa đảo phí hải quan.",
      recommendedAction:
        "Tạm khóa giao dịch, yêu cầu xác thực sinh trắc học khuôn mặt và cảnh báo khách hàng.",
      status: "PENDING",
    },
  ];
}

export function createDefaultWalletState(): TrustPayWalletState {
  return {
    schemaVersion: 1,
    balance: DEFAULT_WALLET_BALANCE,
    budgets: createDefaultWalletBudgets(),
    blacklist: [...DEFAULT_BLACKLIST],
    transactions: [],
    subscriptions: createDefaultSubscriptions(),
    guardian: { ...DEFAULT_GUARDIAN },
    tickets: createDefaultOpsTickets(),
    anomalyCluster: { status: "DETECTED" },
    redactedEvidenceTicketIds: [],
  };
}

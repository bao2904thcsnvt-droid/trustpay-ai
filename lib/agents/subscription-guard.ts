import type {
  CategoryName,
  RecurringSubscription,
  SubscriptionUsageLevel,
} from "@/types/trustpay";

/**
 * Subscription Guard — phân tích các khoản trừ tiền định kỳ hằng tháng (thuần TS).
 * Gói bị gắn cờ khi ít dùng hoặc là gói dùng thử sẽ tự gia hạn thành trả phí.
 */

export interface SubscriptionSummary {
  activeCount: number;
  activeMonthly: number;
  flaggedCount: number;
  flaggedMonthly: number;
  cancelledCount: number;
  savedMonthly: number;
  savedYearly: number;
}

export function isSubscriptionFlagged(sub: RecurringSubscription): boolean {
  return sub.status === "ACTIVE" && (sub.usageLevel === "LOW" || sub.isTrial);
}

export function summarizeSubscriptions(subscriptions: RecurringSubscription[]): SubscriptionSummary {
  let activeCount = 0;
  let activeMonthly = 0;
  let flaggedCount = 0;
  let flaggedMonthly = 0;
  let cancelledCount = 0;
  let savedMonthly = 0;

  for (const sub of subscriptions) {
    if (sub.status === "ACTIVE") {
      activeCount += 1;
      activeMonthly += sub.monthlyAmount;
      if (isSubscriptionFlagged(sub)) {
        flaggedCount += 1;
        flaggedMonthly += sub.monthlyAmount;
      }
    } else {
      cancelledCount += 1;
      savedMonthly += sub.monthlyAmount;
    }
  }

  return {
    activeCount,
    activeMonthly,
    flaggedCount,
    flaggedMonthly,
    cancelledCount,
    savedMonthly,
    savedYearly: savedMonthly * 12,
  };
}

/** Sắp xếp hiển thị: gói bị gắn cờ → đang hoạt động (theo ngày trừ) → đã hủy. */
export function sortSubscriptionsForDisplay(subscriptions: RecurringSubscription[]): RecurringSubscription[] {
  const rank = (sub: RecurringSubscription): number => {
    if (isSubscriptionFlagged(sub)) {
      return 0;
    }
    return sub.status === "ACTIVE" ? 1 : 2;
  };
  return [...subscriptions].sort((a, b) => rank(a) - rank(b) || a.billingDay - b.billingDay);
}

export interface SubscriptionDraft {
  name: string;
  monthlyAmount: number;
  billingDay: number;
  category: CategoryName;
  usageLevel: SubscriptionUsageLevel;
  isTrial: boolean;
}

export type SubscriptionDraftError = "NAME" | "AMOUNT" | "DAY";

export function validateSubscriptionDraft(draft: SubscriptionDraft): SubscriptionDraftError | null {
  const name = draft.name.trim();
  if (name.length < 2 || name.length > 80) {
    return "NAME";
  }
  if (!Number.isFinite(draft.monthlyAmount) || draft.monthlyAmount < 1_000 || draft.monthlyAmount > 100_000_000) {
    return "AMOUNT";
  }
  if (!Number.isInteger(draft.billingDay) || draft.billingDay < 1 || draft.billingDay > 28) {
    return "DAY";
  }
  return null;
}

/** Tạo bản ghi gói định kỳ mới từ bản nháp đã hợp lệ (id do caller cấp). */
export function createSubscriptionFromDraft(id: string, draft: SubscriptionDraft): RecurringSubscription {
  return {
    id,
    name: draft.name.trim(),
    monthlyAmount: Math.round(draft.monthlyAmount),
    category: draft.category,
    billingDay: Math.round(draft.billingDay),
    usageLevel: draft.usageLevel,
    isTrial: draft.isTrial,
    status: "ACTIVE",
  };
}

/** Mẫu điền nhanh cho biểu mẫu thêm gói. */
export const SUBSCRIPTION_SAMPLES: readonly SubscriptionDraft[] = [
  {
    name: "iCloud+ 50GB",
    monthlyAmount: 19_000,
    billingDay: 3,
    category: "Hóa đơn",
    usageLevel: "HIGH",
    isTrial: false,
  },
  {
    name: "Apple TV+ (dùng thử 7 ngày)",
    monthlyAmount: 99_000,
    billingDay: 27,
    category: "Hóa đơn",
    usageLevel: "LOW",
    isTrial: true,
  },
];

import type {
  BudgetCategory,
  BudgetReallocationPlan,
  CategoryName,
  WalletTransaction,
} from "@/types/trustpay";
import { vnDayKey } from "@/lib/wallet/format";

/**
 * Sổ cái phía client của Ví TrustPay (thuần TS, không phụ thuộc React/DOM).
 * Cung cấp số liệu cho chính sách sinh trắc học (lũy kế ngày theo TT 50 /
 * QĐ 2345) và kế hoạch điều chuyển hạn mức giữa các danh mục.
 */

const OUTFLOW_CHANNELS: ReadonlySet<WalletTransaction["channel"]> = new Set<WalletTransaction["channel"]>([
  "TRANSFER",
  "SHOPPING",
]);

/** Tổng tiền đã chi (hoàn tất) trong ngày `dayKey` (YYYY-MM-DD, giờ Việt Nam). */
export function computeDailyOutflow(transactions: WalletTransaction[], dayKey: string): number {
  if (!dayKey) {
    return 0;
  }
  return transactions.reduce((sum, tx) => {
    if (tx.status !== "COMPLETED" || !OUTFLOW_CHANNELS.has(tx.channel)) {
      return sum;
    }
    const ts = Date.parse(tx.timestamp);
    return Number.isFinite(ts) && vnDayKey(ts) === dayKey ? sum + tx.amount : sum;
  }, 0);
}

export function findBudget(budgets: BudgetCategory[], name: CategoryName): BudgetCategory | undefined {
  return budgets.find((budget) => budget.name === name);
}

/** Hạn mức còn lại (limit − spent) của một danh mục; null nếu không tồn tại. */
export function remainingInBudget(budgets: BudgetCategory[], name: CategoryName): number | null {
  const budget = findBudget(budgets, name);
  return budget ? budget.limit - budget.spent : null;
}

/**
 * Ánh xạ danh mục trả về từ API sang danh mục thật của Ví: nếu Ví không theo dõi
 * danh mục đó (vd `Di chuyển`) thì quy về `Khác`, giống cách bộ luật tính ngân sách.
 */
export function resolveWalletCategory(category: CategoryName, budgets: BudgetCategory[]): CategoryName {
  if (findBudget(budgets, category)) {
    return category;
  }
  if (findBudget(budgets, "Khác")) {
    return "Khác";
  }
  return budgets[0]?.name ?? category;
}

/**
 * Lập kế hoạch trích hạn mức để bù phần thiếu của danh mục `target`.
 * Nguồn ưu tiên là `preferredSource` (mặc định `Khác`); nếu trùng danh mục đích
 * hoặc không tồn tại thì chọn danh mục còn dư nhiều nhất.
 */
export function planBudgetReallocation(
  budgets: BudgetCategory[],
  target: CategoryName,
  shortfall: number,
  preferredSource: CategoryName = "Khác",
): BudgetReallocationPlan | null {
  const amount = Math.ceil(shortfall);
  if (!Number.isFinite(amount) || amount <= 0 || !findBudget(budgets, target)) {
    return null;
  }

  let source: BudgetCategory | undefined =
    preferredSource !== target ? findBudget(budgets, preferredSource) : undefined;

  if (!source) {
    source = budgets
      .filter((budget) => budget.name !== target)
      .reduce<BudgetCategory | undefined>((best, budget) => {
        if (!best) {
          return budget;
        }
        return budget.limit - budget.spent > best.limit - best.spent ? budget : best;
      }, undefined);
  }

  if (!source) {
    return null;
  }

  const available = Math.max(0, source.limit - source.spent);
  return {
    from: source.name,
    to: target,
    amount,
    feasible: available >= amount,
    availableInSource: available,
  };
}

/** Áp kế hoạch điều chuyển lên danh sách ngân sách (trả về bản sao mới). */
export function applyBudgetReallocation(
  budgets: BudgetCategory[],
  plan: BudgetReallocationPlan,
): BudgetCategory[] {
  const source = findBudget(budgets, plan.from);
  if (!source || !findBudget(budgets, plan.to) || plan.amount <= 0) {
    return budgets;
  }
  if (source.limit - source.spent < plan.amount) {
    return budgets;
  }
  return budgets.map((budget) => {
    if (budget.name === plan.from) {
      return { ...budget, limit: budget.limit - plan.amount };
    }
    if (budget.name === plan.to) {
      return { ...budget, limit: budget.limit + plan.amount };
    }
    return budget;
  });
}

/**
 * Sinh mã định danh phía client. Chỉ gọi trong event handler (không gọi trong
 * render) vì dùng thời gian thực và số ngẫu nhiên.
 */
export function createClientId(prefix: string): string {
  const cryptoApi: Crypto | undefined = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  const random =
    cryptoApi && typeof cryptoApi.randomUUID === "function"
      ? cryptoApi.randomUUID().replace(/-/g, "").slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random.toUpperCase()}`;
}

/** Sinh mã ticket theo chuẩn `TCK-YYYYMMDD-NNN` (REQ-B1.2). */
export function createTicketId(epochMs: number, datePart: string): string {
  const suffix = String(100 + Math.floor(Math.random() * 900));
  return `TCK-${datePart || String(epochMs).slice(0, 8)}-${suffix}`;
}

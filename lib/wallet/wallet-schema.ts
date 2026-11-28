import type {
  AnomalyClusterState,
  BudgetCategory,
  CategoryName,
  FintechOpsTicket,
  RecurringSubscription,
  RiskLevel,
  SubscriptionUsageLevel,
  TrustedGuardian,
  TrustPayWalletState,
  WalletTransaction,
  WalletTransactionChannel,
  WalletTransactionStatus,
} from "@/types/trustpay";
import {
  createDefaultSubscriptions,
  createDefaultWalletBudgets,
  createDefaultWalletState,
  createRealWalletBudgets,
  createRealWalletState,
  DEFAULT_GUARDIAN,
} from "@/lib/wallet/defaults";

/**
 * Kiểm tra & làm sạch dữ liệu đọc từ localStorage (ranh giới tin cậy). Trường
 * hỏng/thiếu được thay bằng giá trị gốc, bản ghi lỗi bị loại bỏ, độ dài danh
 * sách bị giới hạn để tránh phình bộ nhớ.
 */

export const MAX_TRANSACTIONS = 120;
export const MAX_TICKETS = 80;
export const MAX_SUBSCRIPTIONS = 40;
export const MAX_BLACKLIST = 200;

const CATEGORY_VALUES: readonly CategoryName[] = ["Ăn uống", "Mua sắm", "Di chuyển", "Hóa đơn", "Khác"];
const RISK_VALUES: readonly RiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
const CHANNEL_VALUES: readonly WalletTransactionChannel[] = ["TRANSFER", "SHOPPING", "BUDGET_REALLOCATION"];
const TX_STATUS_VALUES: readonly WalletTransactionStatus[] = ["COMPLETED", "FROZEN", "CANCELLED", "BLOCKED"];
const USAGE_VALUES: readonly SubscriptionUsageLevel[] = ["HIGH", "MEDIUM", "LOW"];
const SUBSCRIPTION_STATUS_VALUES: readonly RecurringSubscription["status"][] = ["ACTIVE", "CANCELLED"];
const TICKET_STATUS_VALUES: readonly FintechOpsTicket["status"][] = ["PENDING", "BLOCKED", "APPROVED"];
const ANOMALY_STATUS_VALUES: readonly AnomalyClusterState["status"][] = ["DETECTED", "LOCKED"];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown, maxLength = 2000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function optionalString(value: unknown, maxLength = 2000): string | undefined {
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function sanitizeBudget(value: unknown): BudgetCategory | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, name, limit, spent } = value;
  if (!isNonEmptyString(id, 64) || !oneOf(CATEGORY_VALUES, name) || !isFiniteNumber(limit) || !isFiniteNumber(spent)) {
    return null;
  }
  return { id, name, limit: Math.max(0, Math.round(limit)), spent: Math.max(0, Math.round(spent)) };
}

function sanitizeBudgets(value: unknown): BudgetCategory[] {
  if (!Array.isArray(value)) {
    return createDefaultWalletBudgets();
  }
  const seen = new Set<CategoryName>();
  const budgets: BudgetCategory[] = [];
  for (const item of value) {
    const budget = sanitizeBudget(item);
    if (budget && !seen.has(budget.name)) {
      seen.add(budget.name);
      budgets.push(budget);
    }
  }
  return budgets.length > 0 ? budgets : createDefaultWalletBudgets();
}

function sanitizeStringList(value: unknown, max: number, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of value) {
    if (!isNonEmptyString(item, 120)) {
      continue;
    }
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      list.push(trimmed);
    }
    if (list.length >= max) {
      break;
    }
  }
  return list;
}

function sanitizeTransaction(value: unknown): WalletTransaction | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, timestamp, channel, recipient, amount, category, riskLevel, riskScore, status, ticketId, note } = value;
  if (
    !isNonEmptyString(id, 80) ||
    !isNonEmptyString(timestamp, 40) ||
    !oneOf(CHANNEL_VALUES, channel) ||
    typeof recipient !== "string" ||
    !isFiniteNumber(amount) ||
    !oneOf(CATEGORY_VALUES, category) ||
    !oneOf(RISK_VALUES, riskLevel) ||
    !isFiniteNumber(riskScore) ||
    !oneOf(TX_STATUS_VALUES, status)
  ) {
    return null;
  }
  const tx: WalletTransaction = {
    id,
    timestamp,
    channel,
    recipient: recipient.slice(0, 200),
    amount: Math.max(0, Math.round(amount)),
    category,
    riskLevel,
    riskScore: Math.min(100, Math.max(0, Math.round(riskScore))),
    status,
  };
  const safeTicket = optionalString(ticketId, 80);
  const safeNote = optionalString(note, 400);
  if (safeTicket) {
    tx.ticketId = safeTicket;
  }
  if (safeNote) {
    tx.note = safeNote;
  }
  return tx;
}

function sanitizeSubscription(value: unknown): RecurringSubscription | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, name, monthlyAmount, category, billingDay, usageLevel, isTrial, status, cancelledAt } = value;
  if (
    !isNonEmptyString(id, 80) ||
    !isNonEmptyString(name, 80) ||
    !isFiniteNumber(monthlyAmount) ||
    !oneOf(CATEGORY_VALUES, category) ||
    !isFiniteNumber(billingDay) ||
    !oneOf(USAGE_VALUES, usageLevel) ||
    typeof isTrial !== "boolean" ||
    !oneOf(SUBSCRIPTION_STATUS_VALUES, status)
  ) {
    return null;
  }
  const sub: RecurringSubscription = {
    id,
    name: name.trim(),
    monthlyAmount: Math.max(0, Math.round(monthlyAmount)),
    category,
    billingDay: Math.min(28, Math.max(1, Math.round(billingDay))),
    usageLevel,
    isTrial,
    status,
  };
  const safeCancelledAt = optionalString(cancelledAt, 40);
  if (safeCancelledAt) {
    sub.cancelledAt = safeCancelledAt;
  }
  return sub;
}

function sanitizeTicket(value: unknown): FintechOpsTicket | null {
  if (!isRecord(value)) {
    return null;
  }
  const { ticketId, timestamp, recipient, amount, riskLevel, riskScore, summary, recommendedAction, status } = value;
  if (
    !isNonEmptyString(ticketId, 80) ||
    !isNonEmptyString(timestamp, 40) ||
    typeof recipient !== "string" ||
    !isFiniteNumber(amount) ||
    !oneOf(RISK_VALUES, riskLevel) ||
    !isFiniteNumber(riskScore) ||
    typeof summary !== "string" ||
    typeof recommendedAction !== "string" ||
    !oneOf(TICKET_STATUS_VALUES, status)
  ) {
    return null;
  }
  // Không khôi phục ảnh bằng chứng từ bộ nhớ bền vững (NĐ 13/2023).
  return {
    ticketId,
    timestamp,
    recipient: recipient.slice(0, 200),
    amount: Math.max(0, Math.round(amount)),
    riskLevel,
    riskScore: Math.min(100, Math.max(0, Math.round(riskScore))),
    summary: summary.slice(0, 1200),
    recommendedAction: recommendedAction.slice(0, 600),
    status,
  };
}

function sanitizeList<T>(value: unknown, sanitizeItem: (item: unknown) => T | null, max: number): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const list: T[] = [];
  for (const item of value) {
    const clean = sanitizeItem(item);
    if (clean) {
      list.push(clean);
    }
    if (list.length >= max) {
      break;
    }
  }
  return list;
}

function sanitizeGuardian(value: unknown): TrustedGuardian {
  if (isRecord(value) && isNonEmptyString(value.name, 60) && isNonEmptyString(value.phone, 20)) {
    return { name: value.name.trim(), phone: value.phone.trim() };
  }
  return { ...DEFAULT_GUARDIAN };
}

function sanitizeAnomaly(value: unknown): AnomalyClusterState {
  if (!isRecord(value)) {
    return { status: "DETECTED" };
  }
  const status = value.status;
  if (!oneOf(ANOMALY_STATUS_VALUES, status)) {
    return { status: "DETECTED" };
  }
  const state: AnomalyClusterState = { status };
  const lockedAt = optionalString(value.lockedAt, 40);
  const ticketId = optionalString(value.ticketId, 80);
  if (lockedAt) {
    state.lockedAt = lockedAt;
  }
  if (ticketId) {
    state.ticketId = ticketId;
  }
  return state;
}

export function sanitizeWalletState(raw: unknown): TrustPayWalletState {
  const defaults = createDefaultWalletState();
  if (!isRecord(raw) || raw.schemaVersion !== 1) {
    return defaults;
  }

  return {
    schemaVersion: 1,
    balance: isFiniteNumber(raw.balance) ? Math.max(0, Math.round(raw.balance)) : defaults.balance,
    budgets: sanitizeBudgets(raw.budgets),
    blacklist: sanitizeStringList(raw.blacklist, MAX_BLACKLIST, defaults.blacklist),
    transactions: sanitizeList(raw.transactions, sanitizeTransaction, MAX_TRANSACTIONS),
    subscriptions: Array.isArray(raw.subscriptions)
      ? sanitizeList(raw.subscriptions, sanitizeSubscription, MAX_SUBSCRIPTIONS)
      : createDefaultSubscriptions(),
    guardian: sanitizeGuardian(raw.guardian),
    tickets: Array.isArray(raw.tickets) ? sanitizeList(raw.tickets, sanitizeTicket, MAX_TICKETS) : defaults.tickets,
    anomalyCluster: sanitizeAnomaly(raw.anomalyCluster),
    redactedEvidenceTicketIds: sanitizeStringList(raw.redactedEvidenceTicketIds, MAX_TICKETS, []),
  };
}

/** Làm sạch dữ liệu lưu bền vững cho chế độ Tiền Thật (mặc định sạch 0đ, không seed mẫu). */
export function sanitizeRealWalletState(raw: unknown): TrustPayWalletState {
  const defaults = createRealWalletState();
  if (!isRecord(raw) || raw.schemaVersion !== 1) {
    return defaults;
  }
  const budgets = Array.isArray(raw.budgets) ? sanitizeBudgets(raw.budgets) : createRealWalletBudgets();
  return {
    schemaVersion: 1,
    balance: isFiniteNumber(raw.balance) ? Math.max(0, Math.round(raw.balance)) : 0,
    budgets,
    blacklist: sanitizeStringList(raw.blacklist, MAX_BLACKLIST, defaults.blacklist),
    transactions: sanitizeList(raw.transactions, sanitizeTransaction, MAX_TRANSACTIONS),
    subscriptions: Array.isArray(raw.subscriptions)
      ? sanitizeList(raw.subscriptions, sanitizeSubscription, MAX_SUBSCRIPTIONS)
      : [],
    guardian: sanitizeGuardian(raw.guardian),
    tickets: Array.isArray(raw.tickets) ? sanitizeList(raw.tickets, sanitizeTicket, MAX_TICKETS) : [],
    anomalyCluster: sanitizeAnomaly(raw.anomalyCluster),
    redactedEvidenceTicketIds: sanitizeStringList(raw.redactedEvidenceTicketIds, MAX_TICKETS, []),
  };
}

/** Bản ghi lưu bền vững: loại ảnh bằng chứng base64 khỏi ticket. */
export function serializeWalletState(state: TrustPayWalletState): TrustPayWalletState {
  return {
    ...state,
    tickets: state.tickets.map((ticket) => {
      if (ticket.evidenceImageBase64 === undefined) {
        return ticket;
      }
      const { evidenceImageBase64: _omit, ...rest } = ticket;
      void _omit;
      return rest;
    }),
  };
}

import type {
  BudgetReallocationPlan,
  FintechOpsTicket,
  RecurringSubscription,
  SubscriptionUsageLevel,
  TrustedGuardian,
  TrustPayWalletState,
  WalletTransaction,
} from "@/types/trustpay";
import { applyBudgetReallocation, findBudget } from "@/lib/wallet/ledger";
import { blacklistKeysFromRecipient, mergeBlacklist } from "@/lib/wallet/blacklist-patterns";
import { MAX_BLACKLIST, MAX_SUBSCRIPTIONS, MAX_TICKETS, MAX_TRANSACTIONS } from "@/lib/wallet/wallet-schema";

/**
 * Các phép biến đổi trạng thái THUẦN của Ví + Ops (không side-effect, không đọc
 * thời gian thực). Store gọi các hàm này qua `setState(prev => reducer(prev))`.
 * Bất biến: số dư không bao giờ âm; chỉ trừ tiền khi đủ số dư.
 */

function stripEvidence(ticket: FintechOpsTicket): FintechOpsTicket {
  if (ticket.evidenceImageBase64 === undefined) {
    return ticket;
  }
  const { evidenceImageBase64: _omit, ...rest } = ticket;
  void _omit;
  return rest;
}

export function upsertTransactionInList(list: WalletTransaction[], tx: WalletTransaction): WalletTransaction[] {
  const index = list.findIndex((item) => item.id === tx.id);
  if (index >= 0) {
    const next = [...list];
    next[index] = tx;
    return next;
  }
  return [tx, ...list].slice(0, MAX_TRANSACTIONS);
}

export function upsertTransaction(state: TrustPayWalletState, tx: WalletTransaction): TrustPayWalletState {
  return { ...state, transactions: upsertTransactionInList(state.transactions, tx) };
}

export function patchTransaction(
  state: TrustPayWalletState,
  id: string | null | undefined,
  patch: Partial<Omit<WalletTransaction, "id">>,
): TrustPayWalletState {
  if (!id || !state.transactions.some((tx) => tx.id === id)) {
    return state;
  }
  return {
    ...state,
    transactions: state.transactions.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)),
  };
}

/** Trừ tiền thật (chế độ Ví Demo): giảm số dư, cộng `spent` của danh mục, ghi/cập nhật lịch sử. */
export function applyDebit(state: TrustPayWalletState, tx: WalletTransaction): TrustPayWalletState {
  if (tx.amount <= 0 || tx.amount > state.balance) {
    return state;
  }
  const hasCategory = Boolean(findBudget(state.budgets, tx.category));
  return {
    ...state,
    balance: state.balance - tx.amount,
    budgets: hasCategory
      ? state.budgets.map((budget) =>
          budget.name === tx.category ? { ...budget, spent: budget.spent + tx.amount } : budget,
        )
      : state.budgets,
    transactions: upsertTransactionInList(state.transactions, { ...tx, status: "COMPLETED" }),
  };
}

/**
 * Ghi nhận giao dịch THẬT đã hoàn tất trên App Ngân hàng (Non-Custodial):
 * không chặn theo số dư ví ảo (tiền đi trực tiếp từ ngân hàng của người dùng),
 * cộng chi tiêu vào danh mục ngân sách & lịch sử thật (tự cập nhật lũy kế ngày TT 50 NHNN).
 */
export function recordRealTransfer(state: TrustPayWalletState, tx: WalletTransaction): TrustPayWalletState {
  if (tx.amount <= 0) {
    return state;
  }
  const hasCategory = Boolean(findBudget(state.budgets, tx.category));
  return {
    ...state,
    balance: state.balance > 0 ? Math.max(0, state.balance - tx.amount) : 0,
    budgets: hasCategory
      ? state.budgets.map((budget) =>
          budget.name === tx.category ? { ...budget, spent: budget.spent + tx.amount } : budget,
        )
      : state.budgets,
    transactions: upsertTransactionInList(state.transactions, { ...tx, status: "COMPLETED" }),
  };
}

/** Điều chuyển hạn mức thật giữa 2 danh mục và ghi vết vào lịch sử. */
export function reallocateBudget(
  state: TrustPayWalletState,
  plan: BudgetReallocationPlan,
  logEntry: WalletTransaction,
): TrustPayWalletState {
  const budgets = applyBudgetReallocation(state.budgets, plan);
  if (budgets === state.budgets) {
    return state;
  }
  return {
    ...state,
    budgets,
    transactions: upsertTransactionInList(state.transactions, logEntry),
  };
}

/** Đưa ticket lên đầu hàng đợi Ops (thay thế bản trùng mã — REQ-B1.3). Không lưu ảnh. */
export function upsertTicket(state: TrustPayWalletState, ticket: FintechOpsTicket): TrustPayWalletState {
  const clean = stripEvidence(ticket);
  return {
    ...state,
    tickets: [clean, ...state.tickets.filter((item) => item.ticketId !== clean.ticketId)].slice(0, MAX_TICKETS),
  };
}

/** Cập nhật một ticket theo mã; nếu chưa tồn tại thì chèn `fallback` (nếu có). */
export function updateTicket(
  state: TrustPayWalletState,
  ticketId: string,
  updater: (ticket: FintechOpsTicket) => FintechOpsTicket,
  options: { fallback?: FintechOpsTicket; moveToTop?: boolean } = {},
): TrustPayWalletState {
  const existing = state.tickets.find((ticket) => ticket.ticketId === ticketId);
  const base = existing ?? options.fallback;
  if (!base) {
    return state;
  }
  const updated = stripEvidence(updater(base));
  if (!existing || options.moveToTop) {
    return {
      ...state,
      tickets: [updated, ...state.tickets.filter((ticket) => ticket.ticketId !== ticketId)].slice(0, MAX_TICKETS),
    };
  }
  return {
    ...state,
    tickets: state.tickets.map((ticket) => (ticket.ticketId === ticketId ? updated : ticket)),
  };
}

export function addBlacklistEntries(state: TrustPayWalletState, entries: string[]): TrustPayWalletState {
  if (entries.length === 0) {
    return state;
  }
  const blacklist = mergeBlacklist(state.blacklist, entries).slice(0, MAX_BLACKLIST);
  return { ...state, blacklist };
}

/**
 * Ops chặn ticket: chuyển `BLOCKED`, đưa khóa người nhận (ưu tiên STK) vào
 * Blacklist sống và khóa các giao dịch đang tạm giữ gắn với ticket (2 chiều).
 */
export function blockTicket(state: TrustPayWalletState, ticketId: string, note: string): TrustPayWalletState {
  const ticket = state.tickets.find((item) => item.ticketId === ticketId);
  if (!ticket) {
    return state;
  }
  const withStatus: TrustPayWalletState = {
    ...state,
    tickets: state.tickets.map((item) => (item.ticketId === ticketId ? { ...item, status: "BLOCKED" } : item)),
    transactions: state.transactions.map((tx) =>
      tx.ticketId === ticketId && tx.status === "FROZEN" ? { ...tx, status: "BLOCKED", note } : tx,
    ),
  };
  return addBlacklistEntries(withStatus, blacklistKeysFromRecipient(ticket.recipient));
}

export function approveTicket(state: TrustPayWalletState, ticketId: string): TrustPayWalletState {
  if (!state.tickets.some((item) => item.ticketId === ticketId)) {
    return state;
  }
  return {
    ...state,
    tickets: state.tickets.map((item) => (item.ticketId === ticketId ? { ...item, status: "APPROVED" } : item)),
  };
}

export function markEvidenceRedacted(state: TrustPayWalletState, ticketId: string): TrustPayWalletState {
  if (state.redactedEvidenceTicketIds.includes(ticketId)) {
    return state;
  }
  return {
    ...state,
    redactedEvidenceTicketIds: [ticketId, ...state.redactedEvidenceTicketIds].slice(0, MAX_TICKETS),
  };
}

export function updateGuardian(state: TrustPayWalletState, guardian: TrustedGuardian): TrustPayWalletState {
  return { ...state, guardian: { name: guardian.name.trim(), phone: guardian.phone.trim() } };
}

export function addSubscription(state: TrustPayWalletState, sub: RecurringSubscription): TrustPayWalletState {
  return { ...state, subscriptions: [sub, ...state.subscriptions].slice(0, MAX_SUBSCRIPTIONS) };
}

export function cancelSubscription(state: TrustPayWalletState, id: string, cancelledAt: string): TrustPayWalletState {
  if (!state.subscriptions.some((sub) => sub.id === id && sub.status === "ACTIVE")) {
    return state;
  }
  return {
    ...state,
    subscriptions: state.subscriptions.map((sub) =>
      sub.id === id ? { ...sub, status: "CANCELLED", cancelledAt } : sub,
    ),
  };
}

export function setSubscriptionUsage(
  state: TrustPayWalletState,
  id: string,
  usageLevel: SubscriptionUsageLevel,
): TrustPayWalletState {
  return {
    ...state,
    subscriptions: state.subscriptions.map((sub) => (sub.id === id ? { ...sub, usageLevel } : sub)),
  };
}

/** Phong tỏa cụm STK: nạp vào Blacklist sống, ghi ticket BLOCKED, khóa trạng thái banner. */
export function lockAnomalyCluster(
  state: TrustPayWalletState,
  input: { entries: string[]; ticket: FintechOpsTicket; lockedAt: string },
): TrustPayWalletState {
  if (state.anomalyCluster.status === "LOCKED") {
    return state;
  }
  const withBlacklist = addBlacklistEntries(state, input.entries);
  const withTicket = upsertTicket(withBlacklist, input.ticket);
  return {
    ...withTicket,
    anomalyCluster: { status: "LOCKED", lockedAt: input.lockedAt, ticketId: input.ticket.ticketId },
  };
}

/**
 * Khi mở lại trang, giao dịch còn ở trạng thái FROZEN (phiên trước bị đóng giữa
 * chừng) được hủy an toàn — tiền chưa từng bị trừ (fail-closed).
 */
export function finalizeStaleHolds(state: TrustPayWalletState, note: string): TrustPayWalletState {
  if (!state.transactions.some((tx) => tx.status === "FROZEN")) {
    return state;
  }
  return {
    ...state,
    transactions: state.transactions.map((tx) =>
      tx.status === "FROZEN" ? { ...tx, status: "CANCELLED", note } : tx,
    ),
  };
}

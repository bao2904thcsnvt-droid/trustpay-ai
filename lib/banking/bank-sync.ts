import { findVietnamBankByGateway } from "@/lib/vietnam-banks";

export type BankSyncProvider = "sepay" | "casso";

/** Biến động số dư đã chuẩn hóa từ Webhook SePay hoặc Casso. */
export interface BankSyncEvent {
  provider: BankSyncProvider;
  bankCode: string;
  accountNumber: string;
  /** Số tiền biến động có dấu (+ tiền vào, - tiền ra). */
  deltaAmount: number;
  /** Số dư sau giao dịch (null nếu payload không gửi kèm số dư lũy kế). */
  newBalance: number | null;
  description: string;
  timestamp: string;
  txId: string;
}

export interface BankSyncAccountRecord {
  accountNumber: string;
  bankCode: string;
  newBalance: number | null;
  latestEvent: BankSyncEvent;
  events: BankSyncEvent[];
  updatedAt: string;
}

export interface BankSyncGetResponse {
  ok: true;
  accountNumber: string;
  synced: boolean;
  bankCode: string | null;
  newBalance: number | null;
  latestEvent: BankSyncEvent | null;
  events: BankSyncEvent[];
  updatedAt: string | null;
}

const MAX_EVENTS_PER_ACCOUNT = 30;
const MAX_ACCOUNTS = 200;

/** Chuẩn hóa STK làm khóa tra cứu (bỏ khoảng trắng, chấm, gạch nối; in hoa). */
export function normalizeSyncAccountNumber(raw: unknown): string {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  return String(raw).replace(/[\s.\-_]/g, "").toUpperCase().slice(0, 32);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const cleaned = value.replace(/[,\s]/g, "");
    const num = Number(cleaned);
    if (Number.isFinite(num)) return Math.round(num);
  }
  return null;
}

function parseIsoTimestamp(raw: unknown, fallbackIso: string): string {
  if (typeof raw !== "string" || !raw.trim()) return fallbackIso;
  const trimmed = raw.trim();
  // SePay thường gửi "YYYY-MM-DD HH:mm:ss" theo giờ Việt Nam (+07:00).
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}+07:00`
    : trimmed;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? fallbackIso : new Date(ms).toISOString();
}

function resolveBankCode(rawGateway: unknown): string {
  if (typeof rawGateway !== "string" || !rawGateway.trim()) return "BANK";
  const matched = findVietnamBankByGateway(rawGateway);
  return matched?.code ?? rawGateway.trim().toUpperCase().slice(0, 16);
}

/**
 * Chuẩn hóa payload Webhook từ SePay hoặc Casso thành danh sách `BankSyncEvent`.
 *
 * - SePay: `{ gateway, transactionDate, accountNumber, transferType, transferAmount, accumulated, content, referenceCode }`
 * - Casso: `{ error?: 0, data: [{ tid, description, amount, cusum_balance, when, bankSubAccId }] }`
 */
export function normalizeBankWebhookPayload(payload: unknown, nowIso: string = new Date().toISOString()): BankSyncEvent[] {
  const record = asRecord(payload);
  if (!record) return [];

  // 1. Định dạng Casso (`data: [...]`)
  if (Array.isArray(record.data)) {
    const events: BankSyncEvent[] = [];
    for (let i = 0; i < record.data.length; i += 1) {
      const item = asRecord(record.data[i]);
      if (!item) continue;
      const accountNumber = normalizeSyncAccountNumber(
        item.bankSubAccId ?? item.bank_sub_acc_id ?? item.accountNumber ?? item.subAccId,
      );
      const amount = parseFiniteNumber(item.amount);
      if (!accountNumber || amount === null) continue;
      const cusum = parseFiniteNumber(item.cusum_balance ?? item.cusumBalance ?? item.balance);
      const bankCode = resolveBankCode(item.bankName ?? item.bank_name ?? item.gateway ?? record.bankName);
      const txId = String(item.tid ?? item.id ?? `CASSO-${Date.now()}-${i}`).slice(0, 80);
      const description = typeof item.description === "string" ? item.description.trim().slice(0, 300) : "";
      const timestamp = parseIsoTimestamp(item.when ?? item.transactionDate, nowIso);
      events.push({
        provider: "casso",
        bankCode,
        accountNumber,
        deltaAmount: amount,
        newBalance: cusum !== null && cusum >= 0 ? cusum : null,
        description,
        timestamp,
        txId,
      });
    }
    return events;
  }

  // 2. Định dạng SePay (object đơn)
  const accountNumber = normalizeSyncAccountNumber(record.accountNumber ?? record.subAccount);
  const rawAmount = parseFiniteNumber(record.transferAmount ?? record.amount);
  if (!accountNumber || rawAmount === null) return [];

  const transferType = typeof record.transferType === "string" ? record.transferType.trim().toLowerCase() : "in";
  const deltaAmount = transferType === "out" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const accumulated = parseFiniteNumber(record.accumulated ?? record.balance);
  const bankCode = resolveBankCode(record.gateway ?? record.bankCode);
  const description =
    typeof record.content === "string"
      ? record.content.trim().slice(0, 300)
      : typeof record.description === "string"
        ? record.description.trim().slice(0, 300)
        : "";
  const txId = String(record.referenceCode ?? record.id ?? `SEPAY-${Date.now()}`).slice(0, 80);
  const timestamp = parseIsoTimestamp(record.transactionDate, nowIso);

  return [
    {
      provider: "sepay",
      bankCode,
      accountNumber,
      deltaAmount,
      newBalance: accumulated !== null && accumulated >= 0 ? accumulated : null,
      description,
      timestamp,
      txId,
    },
  ];
}

// Bộ nhớ đệm tiến trình dùng `globalThis` để không mất dữ liệu giữa các lần hot-reload ở dev.
interface BankSyncMemoryStore {
  byAccount: Map<string, BankSyncAccountRecord>;
}

const GLOBAL_STORE_KEY = "__trustpayBankSyncStore__";

function getStore(): BankSyncMemoryStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_STORE_KEY]) {
    g[GLOBAL_STORE_KEY] = { byAccount: new Map<string, BankSyncAccountRecord>() } satisfies BankSyncMemoryStore;
  }
  return g[GLOBAL_STORE_KEY] as BankSyncMemoryStore;
}

export function recordBankSyncEvents(events: readonly BankSyncEvent[], nowIso: string = new Date().toISOString()): BankSyncAccountRecord[] {
  const store = getStore();
  const touched = new Map<string, BankSyncAccountRecord>();

  for (const event of events) {
    const key = normalizeSyncAccountNumber(event.accountNumber);
    if (!key) continue;

    const existing = store.byAccount.get(key);
    const deduped = [event, ...(existing?.events ?? []).filter((item) => item.txId !== event.txId)].slice(
      0,
      MAX_EVENTS_PER_ACCOUNT,
    );

    const computedBalance =
      event.newBalance !== null
        ? event.newBalance
        : existing && existing.newBalance !== null
          ? Math.max(0, existing.newBalance + event.deltaAmount)
          : null;

    const updated: BankSyncAccountRecord = {
      accountNumber: key,
      bankCode: event.bankCode !== "BANK" ? event.bankCode : existing?.bankCode ?? event.bankCode,
      newBalance: computedBalance,
      latestEvent: event,
      events: deduped,
      updatedAt: nowIso,
    };

    // Giữ kích thước cache gọn (LRU đơn giản theo thứ tự chèn của Map).
    if (store.byAccount.has(key)) {
      store.byAccount.delete(key);
    } else if (store.byAccount.size >= MAX_ACCOUNTS) {
      const oldestKey = store.byAccount.keys().next().value;
      if (oldestKey !== undefined) store.byAccount.delete(oldestKey);
    }
    store.byAccount.set(key, updated);
    touched.set(key, updated);
  }

  return Array.from(touched.values());
}

export function readBankSyncRecord(accountNumber: string): BankSyncAccountRecord | null {
  const key = normalizeSyncAccountNumber(accountNumber);
  if (!key) return null;
  return getStore().byAccount.get(key) ?? null;
}

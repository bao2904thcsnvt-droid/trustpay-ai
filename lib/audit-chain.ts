import { useSyncExternalStore } from "react";
import { createPersistentStore } from "@/lib/store/persistent-store";
import { sha256HexSync } from "@/lib/crypto/sha256";
import { canonicalJson } from "@/lib/sdk/decision-token";

/**
 * Chuỗi Nhật ký Kiểm toán Băm Mật mã (Tamper-Evident Hash Chain, SHA-256).
 *
 *   hashₙ = SHA-256( canonicalJSON({ index, timestamp, kind, summary, prevHash = hashₙ₋₁ }) )
 *
 * Sửa bất kỳ bản ghi nào (kể cả một chữ số) làm hash của nó và mọi bản ghi sau không còn khớp.
 * Trình duyệt dùng `crypto.subtle.digest('SHA-256')`; môi trường không có Web Crypto (Node cũ,
 * kiểm thử) dùng bản cài đặt thuần TS đã kiểm chứng FIPS (`lib/crypto/sha256.ts`) — cùng kết quả.
 *
 * Nghị định 13/2023: bản ghi KHÔNG chứa PII thô — chỉ mức rủi ro, dải số tiền, quyết định và
 * mã băm SHA-256 của câu lệnh. Lưu trong localStorage `trustpay-ai.audit.v1`, xóa khi Reset Demo.
 */

export const AUDIT_STORAGE_KEY = "trustpay-ai.audit.v1";
export const AUDIT_GENESIS_HASH = "0".repeat(64);
export const AUDIT_MAX_ENTRIES = 200;

export type AuditKind = "ANALYSIS" | "GUARDIAN" | "OPS_BLOCK" | "OPS_APPROVE" | "QR_INSPECT" | "BANK_LINK";

export type AuditValue = string | number | boolean;

export interface AuditEntry {
  index: number;
  timestamp: string;
  kind: AuditKind;
  summary: Record<string, AuditValue>;
  prevHash: string;
  hash: string;
}

export interface AuditState {
  schemaVersion: 1;
  entries: AuditEntry[];
}

const AUDIT_KINDS: readonly AuditKind[] = ["ANALYSIS", "GUARDIAN", "OPS_BLOCK", "OPS_APPROVE", "QR_INSPECT", "BANK_LINK"];

function hashInput(entry: Omit<AuditEntry, "hash">): string {
  return canonicalJson({
    index: entry.index,
    timestamp: entry.timestamp,
    kind: entry.kind,
    summary: entry.summary,
    prevHash: entry.prevHash,
  });
}

/** Hash đồng bộ (thuần TS) — dùng cho kiểm thử và môi trường không có Web Crypto. */
export function computeEntryHashSync(entry: Omit<AuditEntry, "hash">): string {
  return sha256HexSync(hashInput(entry));
}

/** Hash bằng Web Crypto `crypto.subtle.digest('SHA-256')`, dự phòng thuần TS. */
export async function computeEntryHash(entry: Omit<AuditEntry, "hash">): Promise<string> {
  const subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : undefined;
  if (subtle && typeof TextEncoder !== "undefined") {
    try {
      const digest = await subtle.digest("SHA-256", new TextEncoder().encode(hashInput(entry)));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // Ngữ cảnh không an toàn (http) → dùng bản thuần TS.
    }
  }
  return computeEntryHashSync(entry);
}

/** Dựng bản ghi kế tiếp (đồng bộ). */
export function buildNextEntrySync(
  previous: AuditEntry | null,
  kind: AuditKind,
  summary: Record<string, AuditValue>,
  timestamp: string,
): AuditEntry {
  const base = {
    index: previous ? previous.index + 1 : 0,
    timestamp,
    kind,
    summary,
    prevHash: previous ? previous.hash : AUDIT_GENESIS_HASH,
  };
  return { ...base, hash: computeEntryHashSync(base) };
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  /** Chỉ số bản ghi đầu tiên bị phá vỡ (null nếu toàn vẹn). */
  brokenAt: number | null;
  reason: "OK" | "HASH_MISMATCH" | "LINK_BROKEN" | "INDEX_GAP" | "EMPTY";
}

function verifyWith(entries: readonly AuditEntry[], hashes: readonly string[]): ChainVerification {
  if (entries.length === 0) return { ok: true, checked: 0, brokenAt: null, reason: "EMPTY" };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (hashes[i] !== entry.hash) {
      return { ok: false, checked: i + 1, brokenAt: entry.index, reason: "HASH_MISMATCH" };
    }
    if (i > 0) {
      if (entry.prevHash !== entries[i - 1].hash) {
        return { ok: false, checked: i + 1, brokenAt: entry.index, reason: "LINK_BROKEN" };
      }
      if (entry.index !== entries[i - 1].index + 1) {
        return { ok: false, checked: i + 1, brokenAt: entry.index, reason: "INDEX_GAP" };
      }
    } else if (entry.index === 0 && entry.prevHash !== AUDIT_GENESIS_HASH) {
      return { ok: false, checked: 1, brokenAt: 0, reason: "LINK_BROKEN" };
    }
  }
  return { ok: true, checked: entries.length, brokenAt: null, reason: "OK" };
}

/** Xác minh toàn vẹn chuỗi (đồng bộ). Chuỗi đã cắt bớt đầu vẫn kiểm được từ bản ghi đầu còn lại. */
export function verifyChainSync(entries: readonly AuditEntry[]): ChainVerification {
  return verifyWith(
    entries,
    entries.map((entry) => computeEntryHashSync(entry)),
  );
}

/** Xác minh toàn vẹn chuỗi bằng Web Crypto SHA-256. */
export async function verifyChain(entries: readonly AuditEntry[]): Promise<ChainVerification> {
  const hashes = await Promise.all(entries.map((entry) => computeEntryHash(entry)));
  return verifyWith(entries, hashes);
}

// ------------------------------------------------------------------ store

function sanitizeValue(value: unknown): AuditValue | null {
  if (typeof value === "string") return value.slice(0, 160);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

function sanitizeEntry(raw: unknown): AuditEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const kind = AUDIT_KINDS.find((item) => item === record.kind);
  if (
    !kind ||
    typeof record.index !== "number" ||
    !Number.isInteger(record.index) ||
    record.index < 0 ||
    typeof record.timestamp !== "string" ||
    typeof record.prevHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.prevHash) ||
    typeof record.hash !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.hash) ||
    typeof record.summary !== "object" ||
    record.summary === null
  ) {
    return null;
  }
  const summary: Record<string, AuditValue> = {};
  for (const [key, value] of Object.entries(record.summary as Record<string, unknown>).slice(0, 16)) {
    const clean = sanitizeValue(value);
    if (clean !== null && /^[A-Za-z0-9_]{1,32}$/.test(key)) summary[key] = clean;
  }
  // Giữ nguyên giá trị đã lưu (kể cả nếu bị sửa) để bước xác minh phát hiện được giả mạo.
  return {
    index: record.index,
    timestamp: record.timestamp.slice(0, 40),
    kind,
    summary,
    prevHash: record.prevHash,
    hash: record.hash,
  };
}

function sanitizeAuditState(raw: unknown): AuditState {
  if (typeof raw !== "object" || raw === null) return { schemaVersion: 1, entries: [] };
  const entries = Array.isArray((raw as Record<string, unknown>).entries)
    ? ((raw as Record<string, unknown>).entries as unknown[])
        .map(sanitizeEntry)
        .filter((entry): entry is AuditEntry => entry !== null)
        .slice(-AUDIT_MAX_ENTRIES)
    : [];
  return { schemaVersion: 1, entries };
}

export const auditStore = createPersistentStore<AuditState>({
  storageKey: AUDIT_STORAGE_KEY,
  createDefault: () => ({ schemaVersion: 1, entries: [] }),
  sanitize: sanitizeAuditState,
});

export function useAuditState(): AuditState {
  return useSyncExternalStore(auditStore.subscribe, auditStore.getSnapshot, auditStore.getServerSnapshot);
}

let appendQueue: Promise<void> = Promise.resolve();

/** Ghi một quyết định bảo mật vào chuỗi (tuần tự hóa để không bao giờ rẽ nhánh chuỗi). */
export function appendAudit(kind: AuditKind, summary: Record<string, AuditValue>, timestamp: string): Promise<void> {
  appendQueue = appendQueue
    .then(async () => {
      const entries = auditStore.getSnapshot().entries;
      const previous = entries.length > 0 ? entries[entries.length - 1] : null;
      const base = {
        index: previous ? previous.index + 1 : 0,
        timestamp,
        kind,
        summary,
        prevHash: previous ? previous.hash : AUDIT_GENESIS_HASH,
      };
      const hash = await computeEntryHash(base);
      auditStore.setState((state) => ({
        schemaVersion: 1,
        entries: [...state.entries, { ...base, hash }].slice(-AUDIT_MAX_ENTRIES),
      }));
    })
    .catch(() => undefined);
  return appendQueue;
}

/** Dải số tiền (không lưu số chính xác vào nhật ký). */
export function amountBand(amount: number): string {
  if (!(amount > 0)) return "0";
  if (amount < 1_000_000) return "<1M";
  if (amount < 10_000_000) return "1M-10M";
  if (amount <= 20_000_000) return "10M-20M";
  return ">20M";
}

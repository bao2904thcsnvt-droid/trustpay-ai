import { useSyncExternalStore } from "react";
import { createPersistentStore } from "@/lib/store/persistent-store";
import { isPayeeInstitutionCode, type PayeeInstitutionCode } from "@/lib/payments/banks";
import { normalizeAccountNumber, sanitizeAccountName } from "@/lib/payments/vietqr-builder";
import { sha256HexSync } from "@/lib/crypto/sha256";

/**
 * Trung tâm Thanh toán Hợp nhất (Unified Payment Hub) — dữ liệu vòng 4, lưu bền
 * vững trong localStorage (`trustpay-ai.hub.v1`) và được xóa sạch khi bấm Reset Demo:
 *  - Chế độ giao diện Easy / Pro, ẩn/hiện số dư.
 *  - Tài khoản & Ví liên kết (nguồn tiền mặc định → mở đúng app ngân hàng khi chuyển thật).
 *  - Danh bạ Tin cậy (chuyển 1 chạm).
 *  - Cấu hình Khóa ứng dụng (passkey WebAuthn + PIN 6 số dự phòng, chỉ lưu dạng băm).
 * Dữ liệu đọc lại luôn đi qua `sanitizeHubState` (coi như KHÔNG tin cậy).
 */

export const HUB_STORAGE_KEY = "trustpay-ai.hub.v1";
export const MAX_LINKED_ACCOUNTS = 12;
export const MAX_TRUSTED_PAYEES = 30;
export const DEFAULT_APP_PIN = "123456";
export const DEFAULT_PIN_SALT = "trustpay-ai-demo";

export type UiMode = "easy" | "pro";

export type PayeeRelation = "FAMILY" | "SHOP" | "LANDLORD" | "FRIEND" | "OTHER";

export const PAYEE_RELATIONS: readonly PayeeRelation[] = ["FAMILY", "SHOP", "LANDLORD", "FRIEND", "OTHER"];

export interface LinkedAccount {
  id: string;
  institutionCode: PayeeInstitutionCode;
  /** STK đầy đủ (cần để tạo mã VietQR thu tiền). Tài khoản mẫu ban đầu để trống. */
  accountNumber: string;
  /** 3–4 số cuối để hiển thị `•••• 4128`. */
  last4: string;
  holderName: string;
  /** Tài khoản mẫu của bản demo — chưa có STK đầy đủ. */
  demo: boolean;
}

export interface TrustedPayee {
  id: string;
  label: string;
  relation: PayeeRelation;
  institutionCode: PayeeInstitutionCode;
  accountNumber: string;
  accountName: string;
  demo: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AppLockSettings {
  enabled: boolean;
  /** rawId (base64url) của passkey nền tảng đã đăng ký qua WebAuthn. */
  passkeyId: string | null;
  pinSalt: string;
  /** SHA-256(`salt:PIN`) — không lưu PIN thô. */
  pinHash: string;
}

export interface HubState {
  schemaVersion: 1;
  uiMode: UiMode;
  balanceHidden: boolean;
  linkedAccounts: LinkedAccount[];
  defaultSourceId: string;
  trustedPayees: TrustedPayee[];
  appLock: AppLockSettings;
}

export function hashPin(pin: string, salt: string): string {
  return sha256HexSync(`${salt}:${pin}`);
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

const DEFAULT_CREATED_AT = "2026-11-20T02:00:00.000Z";

function createDefaultLinkedAccounts(): LinkedAccount[] {
  return [
    { id: "ACC-PVCB", institutionCode: "PVCB", accountNumber: "", last4: "4128", holderName: "BAN GIAM KHAO", demo: true },
    { id: "ACC-VCB", institutionCode: "VCB", accountNumber: "", last4: "9821", holderName: "BAN GIAM KHAO", demo: true },
    { id: "ACC-MB", institutionCode: "MB", accountNumber: "", last4: "5502", holderName: "BAN GIAM KHAO", demo: true },
    { id: "ACC-MOMO", institutionCode: "MOMO", accountNumber: "", last4: "888", holderName: "BAN GIAM KHAO", demo: true },
  ];
}

function createDefaultTrustedPayees(): TrustedPayee[] {
  return [
    {
      id: "PAY-ME",
      label: "Mẹ",
      relation: "FAMILY",
      institutionCode: "VCB",
      accountNumber: "0071000654321",
      accountName: "NGUYEN THI MAI",
      demo: true,
      createdAt: DEFAULT_CREATED_AT,
      lastUsedAt: null,
    },
    {
      id: "PAY-CAFE",
      label: "Quán Cà Phê Mộc Miên",
      relation: "SHOP",
      institutionCode: "VCB",
      accountNumber: "0071001234567",
      accountName: "CONG TY TNHH CA PHE MOC MIEN",
      demo: true,
      createdAt: DEFAULT_CREATED_AT,
      lastUsedAt: null,
    },
    {
      id: "PAY-LANDLORD",
      label: "Chủ trọ",
      relation: "LANDLORD",
      institutionCode: "MB",
      accountNumber: "0968123456789",
      accountName: "TRAN VAN HUNG",
      demo: true,
      createdAt: DEFAULT_CREATED_AT,
      lastUsedAt: null,
    },
  ];
}

export function createDefaultHubState(): HubState {
  return {
    schemaVersion: 1,
    uiMode: "pro",
    balanceHidden: false,
    linkedAccounts: createDefaultLinkedAccounts(),
    defaultSourceId: "ACC-PVCB",
    trustedPayees: createDefaultTrustedPayees(),
    appLock: {
      enabled: false,
      passkeyId: null,
      pinSalt: DEFAULT_PIN_SALT,
      pinHash: hashPin(DEFAULT_APP_PIN, DEFAULT_PIN_SALT),
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function safeId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

function safeIso(value: unknown): string | null {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null;
}

function sanitizeLinkedAccount(raw: unknown): LinkedAccount | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = safeId(record.id);
  if (!id || !isPayeeInstitutionCode(record.institutionCode)) return null;
  const accountNumber =
    typeof record.accountNumber === "string" ? normalizeAccountNumber(record.accountNumber).slice(0, 19) : "";
  const validAccount = /^[0-9A-Z]{6,19}$/.test(accountNumber) ? accountNumber : "";
  const last4Raw = typeof record.last4 === "string" ? record.last4.replace(/\D/g, "").slice(-4) : "";
  const last4 = validAccount ? validAccount.slice(-4) : last4Raw;
  if (!last4) return null;
  return {
    id,
    institutionCode: record.institutionCode,
    accountNumber: validAccount,
    last4,
    holderName: typeof record.holderName === "string" ? sanitizeAccountName(record.holderName) : "",
    demo: record.demo === true && !validAccount,
  };
}

function sanitizeTrustedPayee(raw: unknown): TrustedPayee | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = safeId(record.id);
  if (!id || !isPayeeInstitutionCode(record.institutionCode)) return null;
  const accountNumber = typeof record.accountNumber === "string" ? normalizeAccountNumber(record.accountNumber) : "";
  if (!/^[0-9A-Z]{6,19}$/.test(accountNumber)) return null;
  const label = typeof record.label === "string" ? record.label.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  if (!label) return null;
  const relation = PAYEE_RELATIONS.find((item) => item === record.relation) ?? "OTHER";
  return {
    id,
    label,
    relation,
    institutionCode: record.institutionCode,
    accountNumber,
    accountName: typeof record.accountName === "string" ? sanitizeAccountName(record.accountName) : "",
    demo: record.demo === true,
    createdAt: safeIso(record.createdAt) ?? DEFAULT_CREATED_AT,
    lastUsedAt: safeIso(record.lastUsedAt),
  };
}

export function sanitizeHubState(raw: unknown): HubState {
  const defaults = createDefaultHubState();
  const record = asRecord(raw);
  if (!record) return defaults;

  const linkedAccounts = Array.isArray(record.linkedAccounts)
    ? record.linkedAccounts
        .map(sanitizeLinkedAccount)
        .filter((item): item is LinkedAccount => item !== null)
        .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
        .slice(0, MAX_LINKED_ACCOUNTS)
    : defaults.linkedAccounts;
  const accounts = linkedAccounts.length > 0 ? linkedAccounts : defaults.linkedAccounts;
  const defaultSourceId =
    typeof record.defaultSourceId === "string" && accounts.some((item) => item.id === record.defaultSourceId)
      ? record.defaultSourceId
      : accounts[0].id;

  const trustedPayees = Array.isArray(record.trustedPayees)
    ? record.trustedPayees
        .map(sanitizeTrustedPayee)
        .filter((item): item is TrustedPayee => item !== null)
        .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
        .slice(0, MAX_TRUSTED_PAYEES)
    : defaults.trustedPayees;

  const lock = asRecord(record.appLock);
  const pinSalt =
    lock && typeof lock.pinSalt === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(lock.pinSalt) ? lock.pinSalt : DEFAULT_PIN_SALT;
  const pinHash =
    lock && typeof lock.pinHash === "string" && /^[0-9a-f]{64}$/.test(lock.pinHash)
      ? lock.pinHash
      : hashPin(DEFAULT_APP_PIN, pinSalt);
  const passkeyId =
    lock && typeof lock.passkeyId === "string" && /^[A-Za-z0-9_-]{8,1024}$/.test(lock.passkeyId) ? lock.passkeyId : null;

  return {
    schemaVersion: 1,
    uiMode: record.uiMode === "easy" ? "easy" : "pro",
    balanceHidden: record.balanceHidden === true,
    linkedAccounts: accounts,
    defaultSourceId,
    trustedPayees,
    appLock: { enabled: lock?.enabled === true, passkeyId, pinSalt, pinHash },
  };
}

export const hubStore = createPersistentStore<HubState>({
  storageKey: HUB_STORAGE_KEY,
  createDefault: createDefaultHubState,
  sanitize: sanitizeHubState,
});

export function useHubState(): HubState {
  return useSyncExternalStore(hubStore.subscribe, hubStore.getSnapshot, hubStore.getServerSnapshot);
}

// ------------------------------------------------------------------ actions

export function setUiMode(uiMode: UiMode): void {
  hubStore.setState((prev) => (prev.uiMode === uiMode ? prev : { ...prev, uiMode }));
}

export function setBalanceHidden(balanceHidden: boolean): void {
  hubStore.setState((prev) => (prev.balanceHidden === balanceHidden ? prev : { ...prev, balanceHidden }));
}

export function setDefaultSource(id: string): void {
  hubStore.setState((prev) =>
    prev.defaultSourceId === id || !prev.linkedAccounts.some((item) => item.id === id) ? prev : { ...prev, defaultSourceId: id },
  );
}

export function addLinkedAccount(account: LinkedAccount, makeDefault: boolean): void {
  hubStore.setState((prev) => {
    const clean = sanitizeLinkedAccount(account);
    if (!clean || prev.linkedAccounts.length >= MAX_LINKED_ACCOUNTS) return prev;
    const duplicate = prev.linkedAccounts.find(
      (item) => item.institutionCode === clean.institutionCode && item.accountNumber && item.accountNumber === clean.accountNumber,
    );
    if (duplicate) {
      return makeDefault ? { ...prev, defaultSourceId: duplicate.id } : prev;
    }
    return {
      ...prev,
      linkedAccounts: [...prev.linkedAccounts, clean],
      defaultSourceId: makeDefault ? clean.id : prev.defaultSourceId,
    };
  });
}

/** Hoàn thiện STK đầy đủ cho một tài khoản mẫu (để tạo mã VietQR thu tiền thật). */
export function completeLinkedAccount(id: string, accountNumber: string, holderName: string): void {
  hubStore.setState((prev) => ({
    ...prev,
    linkedAccounts: prev.linkedAccounts.map((item) => {
      if (item.id !== id) return item;
      const updated = sanitizeLinkedAccount({ ...item, accountNumber, holderName: holderName || item.holderName, demo: false });
      return updated ?? item;
    }),
  }));
}

export function removeLinkedAccount(id: string): void {
  hubStore.setState((prev) => {
    if (prev.linkedAccounts.length <= 1) return prev;
    const linkedAccounts = prev.linkedAccounts.filter((item) => item.id !== id);
    const defaultSourceId = linkedAccounts.some((item) => item.id === prev.defaultSourceId)
      ? prev.defaultSourceId
      : linkedAccounts[0].id;
    return { ...prev, linkedAccounts, defaultSourceId };
  });
}

export function addTrustedPayee(payee: TrustedPayee): void {
  hubStore.setState((prev) => {
    const clean = sanitizeTrustedPayee(payee);
    if (!clean) return prev;
    const existing = prev.trustedPayees.find(
      (item) => item.institutionCode === clean.institutionCode && item.accountNumber === clean.accountNumber,
    );
    if (existing) {
      return {
        ...prev,
        trustedPayees: prev.trustedPayees.map((item) =>
          item.id === existing.id ? { ...item, label: clean.label, relation: clean.relation, demo: false } : item,
        ),
      };
    }
    return { ...prev, trustedPayees: [clean, ...prev.trustedPayees].slice(0, MAX_TRUSTED_PAYEES) };
  });
}

export function removeTrustedPayee(id: string): void {
  hubStore.setState((prev) => ({ ...prev, trustedPayees: prev.trustedPayees.filter((item) => item.id !== id) }));
}

export function touchTrustedPayee(id: string, atIso: string): void {
  hubStore.setState((prev) => ({
    ...prev,
    trustedPayees: prev.trustedPayees.map((item) => (item.id === id ? { ...item, lastUsedAt: atIso } : item)),
  }));
}

export function isTrustedPayeeSaved(state: HubState, institutionCode: PayeeInstitutionCode, accountNumber: string): boolean {
  return state.trustedPayees.some(
    (item) => item.institutionCode === institutionCode && item.accountNumber === normalizeAccountNumber(accountNumber),
  );
}

export function setAppLockEnabled(enabled: boolean): void {
  hubStore.setState((prev) => (prev.appLock.enabled === enabled ? prev : { ...prev, appLock: { ...prev.appLock, enabled } }));
}

export function setPasskeyId(passkeyId: string | null): void {
  hubStore.setState((prev) => ({ ...prev, appLock: { ...prev.appLock, passkeyId } }));
}

export function setAppPin(pin: string, salt: string): boolean {
  if (!isValidPin(pin) || !/^[A-Za-z0-9_-]{4,64}$/.test(salt)) return false;
  hubStore.setState((prev) => ({ ...prev, appLock: { ...prev.appLock, pinSalt: salt, pinHash: hashPin(pin, salt) } }));
  return true;
}

export function verifyAppPin(state: HubState, pin: string): boolean {
  return isValidPin(pin) && hashPin(pin, state.appLock.pinSalt) === state.appLock.pinHash;
}

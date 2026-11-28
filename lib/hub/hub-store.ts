import { useSyncExternalStore } from "react";
import { createPersistentStore } from "@/lib/store/persistent-store";
import { findInstitution, isPayeeInstitutionCode, type PayeeInstitutionCode } from "@/lib/payments/banks";
import { normalizeAccountNumber, sanitizeAccountName } from "@/lib/payments/vietqr-builder";
import { sha256HexSync } from "@/lib/crypto/sha256";

/**
 * Trung tâm Thanh toán Hợp nhất (Unified Payment Hub) — dữ liệu vòng 4, lưu bền
 * vững trong localStorage (`trustpay-ai.hub.v1`) và được xóa sạch khi bấm Reset Demo:
 *  - Chế độ giao diện Easy / Pro, ẩn/hiện số dư.
 *  - Tài khoản & Ví liên kết (nguồn tiền mặc định → mở đúng app ngân hàng khi chuyển thật).
 *  - Danh bạ Tin cậy (chuyển 1 chạm).
 *  - Cấu hình Khóa ứng dụng (passkey WebAuthn + PIN 6 số dự phòng, chỉ lưu dạng băm).
 *  - Vòng 9 — Két tài khoản chính chủ (Bank Vault): loại tài khoản, trạng thái xác thực chính chủ
 *    (VietQR 1.000đ / passkey / PIN) và tài khoản NHẬN tiền mặc định.
 * Dữ liệu đọc lại luôn đi qua `sanitizeHubState` (coi như KHÔNG tin cậy). Dữ liệu cũ thiếu trường
 * vòng 9 được điền mặc định (CHECKING / WALLET, chưa xác thực, chưa có tài khoản nhận mặc định).
 */

export const HUB_STORAGE_KEY = "trustpay-ai.hub.v2";
export const MAX_LINKED_ACCOUNTS = 12;
export const MAX_TRUSTED_PAYEES = 30;
export const DEFAULT_APP_PIN = "123456";
export const DEFAULT_PIN_SALT = "trustpay-ai-demo";

export type UiMode = "easy" | "pro";

export type PayeeRelation = "FAMILY" | "SHOP" | "LANDLORD" | "FRIEND" | "OTHER";

export const PAYEE_RELATIONS: readonly PayeeRelation[] = ["FAMILY", "SHOP", "LANDLORD", "FRIEND", "OTHER"];

/** Vòng 9 — loại tài khoản chính chủ: Thanh toán / Tiết kiệm / Ví liên kết (ví điện tử). */
export type LinkedAccountType = "CHECKING" | "SAVINGS" | "WALLET";

export const LINKED_ACCOUNT_TYPES: readonly LinkedAccountType[] = ["CHECKING", "SAVINGS", "WALLET"];

/**
 * Cách người dùng tự xác nhận quyền sở hữu tài khoản (TrustPay không giữ tiền, không đọc sao kê):
 * chuyển thử 1.000đ qua VietQR (đối chiếu tên chủ TK do NAPAS tra cứu), passkey thiết bị, hoặc PIN.
 */
export type LinkedAccountVerifyMethod = "VIETQR_1000" | "PASSKEY" | "PIN";

export const LINKED_ACCOUNT_VERIFY_METHODS: readonly LinkedAccountVerifyMethod[] = ["VIETQR_1000", "PASSKEY", "PIN"];

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
  /**
   * Vòng 9 — loại tài khoản. Tùy chọn ở kiểu ĐẦU VÀO để nơi gọi cũ (BankLinkingPanel,
   * LinkedAccountsBar) vẫn biên dịch; dữ liệu trong store luôn có (xem `StoredLinkedAccount`).
   * Mặc định: WALLET cho ví điện tử, CHECKING cho ngân hàng.
   */
  accountType?: LinkedAccountType;
  /** Thời điểm xác thực chính chủ (ISO 8601) — `null`: chưa xác thực. */
  verifiedAt?: string | null;
  verifyMethod?: LinkedAccountVerifyMethod | null;
  /** Số dư tham chiếu do người dùng tự nhập (`null`: quản lý trực tiếp trên App Ngân hàng). */
  referenceBalance?: number | null;
}

/** Tài khoản đã qua `sanitize` trong store — luôn đủ các trường vòng 9 + số dư tham chiếu. */
export interface StoredLinkedAccount extends LinkedAccount {
  accountType: LinkedAccountType;
  verifiedAt: string | null;
  verifyMethod: LinkedAccountVerifyMethod | null;
  referenceBalance: number | null;
}

/** Tham số tùy chọn khi thêm / hoàn thiện tài khoản (nơi gọi cũ bỏ qua được). */
export interface LinkedAccountWriteOptions {
  /** Loại tài khoản; tự ép về giá trị hợp lệ theo ngân hàng / ví (`resolveAccountType`). */
  accountType?: LinkedAccountType;
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
  linkedAccounts: StoredLinkedAccount[];
  defaultSourceId: string;
  /** Vòng 9 — tài khoản NHẬN tiền mặc định; chỉ trỏ tới tài khoản có STK đầy đủ, ngược lại `null`. */
  defaultReceiveId: string | null;
  trustedPayees: TrustedPayee[];
  appLock: AppLockSettings;
}

export function hashPin(pin: string, salt: string): string {
  return sha256HexSync(`${salt}:${pin}`);
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** Loại tài khoản mặc định: ví điện tử → WALLET, ngân hàng → CHECKING. */
export function defaultAccountType(institutionCode: PayeeInstitutionCode): LinkedAccountType {
  return findInstitution(institutionCode)?.kind === "EWALLET" ? "WALLET" : "CHECKING";
}

/** Ép loại tài khoản về giá trị hợp lệ: ví điện tử luôn WALLET; ngân hàng chỉ CHECKING / SAVINGS. */
export function resolveAccountType(institutionCode: PayeeInstitutionCode, requested: unknown): LinkedAccountType {
  if (defaultAccountType(institutionCode) === "WALLET") return "WALLET";
  return requested === "SAVINGS" ? "SAVINGS" : "CHECKING";
}

/** Đã xác thực chính chủ (có STK đầy đủ + phương thức + thời điểm hợp lệ). */
export function isLinkedAccountVerified(account: Pick<LinkedAccount, "accountNumber" | "verifiedAt" | "verifyMethod">): boolean {
  return account.accountNumber !== "" && Boolean(account.verifiedAt) && Boolean(account.verifyMethod);
}

/** Điều kiện để giao diện cho đặt "Nhận tiền mặc định": STK đầy đủ + đã xác thực chính chủ. */
export function canBeDefaultReceive(account: Pick<LinkedAccount, "accountNumber" | "verifiedAt" | "verifyMethod">): boolean {
  return isLinkedAccountVerified(account);
}

const DEFAULT_CREATED_AT = "2026-11-20T02:00:00.000Z";

function demoAccount(id: string, institutionCode: PayeeInstitutionCode, last4: string): StoredLinkedAccount {
  return {
    id,
    institutionCode,
    accountNumber: "",
    last4,
    holderName: "BAN GIAM KHAO",
    demo: true,
    accountType: defaultAccountType(institutionCode),
    verifiedAt: null,
    verifyMethod: null,
    referenceBalance: null,
  };
}

function createDefaultLinkedAccounts(): StoredLinkedAccount[] {
  return [
    demoAccount("ACC-PVCB", "PVCB", "4128"),
    demoAccount("ACC-VCB", "VCB", "9821"),
    demoAccount("ACC-MB", "MB", "5502"),
    demoAccount("ACC-MOMO", "MOMO", "888"),
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
    defaultReceiveId: null,
    trustedPayees: createDefaultTrustedPayees(),
    appLock: {
      enabled: false,
      passkeyId: null,
      pinSalt: DEFAULT_PIN_SALT,
      pinHash: hashPin(DEFAULT_APP_PIN, DEFAULT_PIN_SALT),
    },
  };
}

/**
 * Trạng thái Hub khởi tạo mặc định cho chế độ Tiền Thật (Non-Custodial):
 * chưa liên kết ngân hàng nào, không có tài khoản hay danh bạ mẫu.
 */
export function createRealHubState(): HubState {
  return {
    schemaVersion: 1,
    uiMode: "pro",
    balanceHidden: false,
    linkedAccounts: [],
    defaultSourceId: "",
    defaultReceiveId: null,
    trustedPayees: [],
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

function safeVerifyMethod(value: unknown): LinkedAccountVerifyMethod | null {
  return LINKED_ACCOUNT_VERIFY_METHODS.find((item) => item === value) ?? null;
}

function sanitizeLinkedAccount(raw: unknown): StoredLinkedAccount | null {
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
  // Xác thực chỉ có nghĩa khi có STK đầy đủ và đủ CẢ phương thức lẫn thời điểm hợp lệ.
  const verifyMethod = safeVerifyMethod(record.verifyMethod);
  const verifiedAt = safeIso(record.verifiedAt);
  const verified = Boolean(validAccount && verifyMethod && verifiedAt);
  const refBalRaw = record.referenceBalance;
  const referenceBalance =
    typeof refBalRaw === "number" && Number.isFinite(refBalRaw) && refBalRaw >= 0 ? Math.round(refBalRaw) : null;
  return {
    id,
    institutionCode: record.institutionCode,
    accountNumber: validAccount,
    last4,
    holderName: typeof record.holderName === "string" ? sanitizeAccountName(record.holderName) : "",
    demo: record.demo === true && !validAccount,
    accountType: resolveAccountType(record.institutionCode, record.accountType),
    verifiedAt: verified ? verifiedAt : null,
    verifyMethod: verified ? verifyMethod : null,
    referenceBalance,
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

/** `defaultReceiveId` hợp lệ khi trỏ tới tài khoản có STK đầy đủ; sai / thiếu → `null`. */
function resolveDefaultReceiveId(value: unknown, accounts: readonly StoredLinkedAccount[]): string | null {
  if (typeof value !== "string") return null;
  return accounts.some((item) => item.id === value && item.accountNumber !== "") ? value : null;
}

export function sanitizeHubState(raw: unknown): HubState {
  const defaults = createDefaultHubState();
  const record = asRecord(raw);
  if (!record) return defaults;

  const linkedAccounts = Array.isArray(record.linkedAccounts)
    ? record.linkedAccounts
        .map(sanitizeLinkedAccount)
        .filter((item): item is StoredLinkedAccount => item !== null)
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
    defaultReceiveId: resolveDefaultReceiveId(record.defaultReceiveId, accounts),
    trustedPayees,
    appLock: { enabled: lock?.enabled === true, passkeyId, pinSalt, pinHash },
  };
}

/** Làm sạch trạng thái Hub cho chế độ Tiền Thật: cho phép danh sách ngân hàng liên kết rỗng. */
export function sanitizeRealHubState(raw: unknown): HubState {
  const defaults = createRealHubState();
  const record = asRecord(raw);
  if (!record) return defaults;

  const accounts = Array.isArray(record.linkedAccounts)
    ? record.linkedAccounts
        .map(sanitizeLinkedAccount)
        .filter((item): item is StoredLinkedAccount => item !== null)
        .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
        .slice(0, MAX_LINKED_ACCOUNTS)
    : [];
  const defaultSourceId =
    typeof record.defaultSourceId === "string" && accounts.some((item) => item.id === record.defaultSourceId)
      ? record.defaultSourceId
      : accounts[0]?.id ?? "";

  const trustedPayees = Array.isArray(record.trustedPayees)
    ? record.trustedPayees
        .map(sanitizeTrustedPayee)
        .filter((item): item is TrustedPayee => item !== null)
        .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
        .slice(0, MAX_TRUSTED_PAYEES)
    : [];

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
    defaultReceiveId: resolveDefaultReceiveId(record.defaultReceiveId, accounts),
    trustedPayees,
    appLock: { enabled: lock?.enabled === true, passkeyId, pinSalt, pinHash },
  };
}

export const hubStore = createPersistentStore<HubState>({
  storageKey: HUB_STORAGE_KEY,
  createDefault: createRealHubState,
  sanitize: sanitizeRealHubState,
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

/**
 * Đặt / bỏ tài khoản NHẬN tiền mặc định. Chỉ nhận tài khoản có STK đầy đủ (giao diện Két còn yêu
 * cầu đã xác thực chính chủ — `canBeDefaultReceive`); id sai → giữ nguyên.
 */
export function setDefaultReceive(id: string | null): void {
  hubStore.setState((prev) => {
    if (id === null) return prev.defaultReceiveId === null ? prev : { ...prev, defaultReceiveId: null };
    if (prev.defaultReceiveId === id) return prev;
    return prev.linkedAccounts.some((item) => item.id === id && item.accountNumber !== "") ? { ...prev, defaultReceiveId: id } : prev;
  });
}

/** Ghi nhận xác thực chính chủ thành công (chỉ cho tài khoản có STK đầy đủ, thời điểm ISO hợp lệ). */
export function markLinkedAccountVerified(id: string, method: LinkedAccountVerifyMethod, atIso: string): void {
  const verifyMethod = safeVerifyMethod(method);
  const verifiedAt = safeIso(atIso);
  if (!verifyMethod || !verifiedAt) return;
  hubStore.setState((prev) => {
    if (!prev.linkedAccounts.some((item) => item.id === id && item.accountNumber !== "")) return prev;
    return {
      ...prev,
      linkedAccounts: prev.linkedAccounts.map((item) => (item.id === id ? { ...item, verifiedAt, verifyMethod } : item)),
    };
  });
}

/**
 * Thêm tài khoản / ví liên kết. Trả về id của tài khoản trong store (id mới, hoặc id của tài khoản
 * trùng ngân hàng + STK đã có), `null` nếu dữ liệu không hợp lệ hoặc đã đủ `MAX_LINKED_ACCOUNTS`.
 */
export function addLinkedAccount(account: LinkedAccount, makeDefault: boolean, options: LinkedAccountWriteOptions = {}): string | null {
  let resultId: string | null = null;
  hubStore.setState((prev) => {
    const clean = sanitizeLinkedAccount(options.accountType ? { ...account, accountType: options.accountType } : account);
    if (!clean) return prev;
    const duplicate = prev.linkedAccounts.find(
      (item) => item.institutionCode === clean.institutionCode && item.accountNumber && item.accountNumber === clean.accountNumber,
    );
    if (duplicate) {
      resultId = duplicate.id;
      return makeDefault && prev.defaultSourceId !== duplicate.id ? { ...prev, defaultSourceId: duplicate.id } : prev;
    }
    if (prev.linkedAccounts.length >= MAX_LINKED_ACCOUNTS || prev.linkedAccounts.some((item) => item.id === clean.id)) {
      return prev;
    }
    resultId = clean.id;
    return {
      ...prev,
      linkedAccounts: [...prev.linkedAccounts, clean],
      defaultSourceId: makeDefault || !prev.defaultSourceId ? clean.id : prev.defaultSourceId,
    };
  });
  return resultId;
}

/**
 * Hoàn thiện STK đầy đủ cho một tài khoản mẫu (để tạo mã VietQR thu tiền thật). STK thay đổi → xác
 * thực chính chủ cũ bị hủy và tài khoản không còn là "Nhận tiền mặc định" (phải xác thực lại).
 * Trả về `false` nếu không tìm thấy tài khoản, STK không hợp lệ hoặc trùng tài khoản khác cùng ngân hàng.
 */
export function completeLinkedAccount(
  id: string,
  accountNumber: string,
  holderName: string,
  options: LinkedAccountWriteOptions = {},
): boolean {
  let applied = false;
  hubStore.setState((prev) => {
    const target = prev.linkedAccounts.find((item) => item.id === id);
    if (!target) return prev;
    const normalized = normalizeAccountNumber(accountNumber).slice(0, 19);
    const duplicate = prev.linkedAccounts.some(
      (item) => item.id !== id && item.institutionCode === target.institutionCode && item.accountNumber !== "" && item.accountNumber === normalized,
    );
    if (duplicate) return prev;
    const numberChanged = normalized !== target.accountNumber;
    const updated = sanitizeLinkedAccount({
      ...target,
      accountNumber: normalized,
      holderName: holderName || target.holderName,
      demo: false,
      accountType: options.accountType ?? target.accountType,
      verifiedAt: numberChanged ? null : target.verifiedAt,
      verifyMethod: numberChanged ? null : target.verifyMethod,
    });
    if (!updated || !updated.accountNumber) return prev;
    applied = true;
    return {
      ...prev,
      linkedAccounts: prev.linkedAccounts.map((item) => (item.id === id ? updated : item)),
      defaultReceiveId: numberChanged && prev.defaultReceiveId === id ? null : prev.defaultReceiveId,
    };
  });
  return applied;
}

/** Cập nhật số dư tham chiếu của một tài khoản liên kết (`null` = quản lý trực tiếp trên App Ngân hàng). */
export function updateLinkedAccountBalance(id: string, referenceBalance: number | null): void {
  const clean =
    typeof referenceBalance === "number" && Number.isFinite(referenceBalance) && referenceBalance >= 0
      ? Math.round(referenceBalance)
      : null;
  hubStore.setState((prev) => {
    if (!prev.linkedAccounts.some((item) => item.id === id)) return prev;
    return {
      ...prev,
      linkedAccounts: prev.linkedAccounts.map((item) =>
        item.id === id ? { ...item, referenceBalance: clean } : item,
      ),
    };
  });
}

/** Tự động trừ số dư tham chiếu của tài khoản nguồn (nếu người dùng có nhập số dư tham chiếu). */
export function deductLinkedAccountReferenceBalance(id: string, amount: number): void {
  if (!id || amount <= 0) return;
  hubStore.setState((prev) => {
    const target = prev.linkedAccounts.find((item) => item.id === id);
    if (!target || target.referenceBalance === null) return prev;
    return {
      ...prev,
      linkedAccounts: prev.linkedAccounts.map((item) =>
        item.id === id
          ? { ...item, referenceBalance: Math.max(0, (item.referenceBalance ?? 0) - Math.round(amount)) }
          : item,
      ),
    };
  });
}

/** Gỡ liên kết tài khoản; dọn nguồn chuyển & tài khoản nhận mặc định. Trả về `true` nếu đã gỡ. */
export function removeLinkedAccount(id: string): boolean {
  let removed = false;
  hubStore.setState((prev) => {
    if (!prev.linkedAccounts.some((item) => item.id === id)) return prev;
    const linkedAccounts = prev.linkedAccounts.filter((item) => item.id !== id);
    const defaultSourceId = linkedAccounts.some((item) => item.id === prev.defaultSourceId)
      ? prev.defaultSourceId
      : linkedAccounts[0]?.id ?? "";
    const defaultReceiveId = prev.defaultReceiveId === id ? null : prev.defaultReceiveId;
    removed = true;
    return { ...prev, linkedAccounts, defaultSourceId, defaultReceiveId };
  });
  return removed;
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

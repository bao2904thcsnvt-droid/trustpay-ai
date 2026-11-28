"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  Download,
  ExternalLink,
  Fingerprint,
  HandCoins,
  Info,
  KeyRound,
  Landmark,
  LoaderCircle,
  Lock,
  PiggyBank,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  Vault,
  X,
} from "lucide-react";
import {
  findInstitution,
  isPayeeInstitutionCode,
  PAYEE_INSTITUTIONS,
  PAYER_BANK_APPS,
  type PayeeInstitution,
  type PayeeInstitutionCode,
} from "@/lib/payments/banks";
import {
  buildPayeeVietQr,
  isValidVietQrAmount,
  normalizeAccountNumber,
  removeDiacritics,
  sanitizeAccountName,
  sanitizeMemo,
  validatePayeeAccount,
} from "@/lib/payments/vietqr-builder";
import { buildBankTransferDeepLink, buildMomoAppLink } from "@/lib/payments/bank-deeplinks";
import {
  addLinkedAccount,
  canBeDefaultReceive,
  completeLinkedAccount,
  isLinkedAccountVerified,
  LINKED_ACCOUNT_TYPES,
  markLinkedAccountVerified,
  MAX_LINKED_ACCOUNTS,
  removeLinkedAccount,
  resolveAccountType,
  setDefaultReceive,
  setDefaultSource,
  useHubState,
  verifyAppPin,
  type HubState,
  type LinkedAccountType,
  type LinkedAccountVerifyMethod,
  type StoredLinkedAccount,
} from "@/lib/hub/hub-store";
import { isWebAuthnSupported, MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MS, verifyDevicePasskey } from "@/lib/security/app-lock";
import { decodeVietQr } from "@/lib/qr/vietqr-inspector";
import { createClientId } from "@/lib/wallet/ledger";
import { parseMoneyInput } from "@/lib/wallet/format";
import { useI18n, type I18nContextValue } from "@/components/i18n/I18nProvider";
import QrCodeSvg, { saveQrImage, useQrMatrix, type QrImageSaveResult } from "@/components/payments/QrCodeSvg";
import type { ToastNotification } from "@/components/layout/ToastNotice";

/**
 * Két tài khoản ngân hàng chính chủ (Bank Vault) — vòng 9.
 *
 *  - Thẻ tài khoản (vuốt ngang trên điện thoại, lưới từ `sm`): loại tài khoản, huy hiệu xác thực,
 *    nguồn chuyển / nhận tiền mặc định, nhãn MẪU cho tài khoản chưa có STK đầy đủ.
 *  - Thêm tài khoản chính chủ + bổ sung STK cho tài khoản mẫu → luôn đi qua bước xác thực.
 *  - Xác thực 2 lớp (chọn 1): chuyển thử VietQR 1.000đ về CHÍNH tài khoản (đối chiếu tên chủ TK do
 *    NAPAS tra cứu, nhập 6 ký tự TPLINK trong nội dung) hoặc passkey thiết bị / PIN ứng dụng.
 *  - Mã QR nhận tiền cá nhân + "Thu tiền qua cổng MoMo" (`/api/payment/create`, tự lùi về VietQR).
 *
 * Non-custodial: TrustPay không giữ tiền, không đọc sao kê. Mã TPLINK chỉ nằm trong mã QR / Deep Link
 * và bộ nhớ phiên — KHÔNG hiển thị, KHÔNG ghi log, KHÔNG lưu localStorage. Sự kiện Audit chỉ mang
 * 4 số cuối, không bao giờ chứa STK đầy đủ.
 */

export interface VaultAuditEvent {
  action: "LINK" | "VERIFY" | "UNLINK" | "SET_DEFAULT_RECEIVE" | "SET_DEFAULT_SOURCE";
  institutionCode: string;
  accountType: string;
  method?: string;
  last4: string;
}

export interface BankVaultManagerProps {
  onToast: (toast: ToastNotification) => void;
  onAudit?: (event: VaultAuditEvent) => void;
  requireUnlock?: boolean;
  onRequestUnlock?: () => void;
  highlighted?: boolean;
  /** id của section (mặc định `tp-linked-accounts`; giao diện laptop đã có LinkedAccountsBar mang id đó). */
  sectionId?: string;
}

type Translations = I18nContextValue["t"];

type Panel =
  | { kind: "add" }
  | { kind: "complete"; accountId: string }
  | { kind: "verify"; accountId: string; makeReceive: boolean }
  | { kind: "receive"; accountId: string };

type SaveResult = "OK" | "DUPLICATE" | "LIMIT" | "FAILED";

interface AccountDraft {
  institutionCode: PayeeInstitutionCode;
  accountNumber: string;
  holderName: string;
  accountType: LinkedAccountType;
  makeReceive: boolean;
}

interface CompleteDraft {
  accountNumber: string;
  holderName: string;
  accountType: LinkedAccountType;
}

type AuditAccount = Pick<StoredLinkedAccount, "institutionCode" | "accountType" | "last4">;

// ------------------------------------------------------------------ hằng số

/** Số tiền chuyển thử để xác thực chính chủ (tiền về chính tài khoản của người dùng). */
const VERIFY_AMOUNT_VND = 1_000;
/** Cổng MoMo yêu cầu tối thiểu 1.000đ cho một lệnh thu. */
const GATEWAY_MIN_AMOUNT_VND = 1_000;
const GATEWAY_TIMEOUT_MS = 10_000;
const MAX_CODE_ATTEMPTS = 5;
const UNLINK_ARM_MS = 4_000;
const OTHER_BANK_APP_LIMIT = 6;
const LINK_MEMO_PREFIX = "TPLINK";
const LINK_CODE_LENGTH = 6;
/** 32 ký tự (chữ in hoa + số, bỏ 0 / O / 1 / I dễ nhầm). 32 = 2^5 → `byte & 31` không lệch phân phối. */
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Gradient thẻ (bề mặt LUÔN tối → màu nội tuyến, không phụ thuộc bảng màu Obsidian / Daylight). */
const CARD_TINT: Readonly<Record<string, readonly [string, string]>> = {
  PVCB: ["#075985", "#0891b2"],
  VCB: ["#065f46", "#059669"],
  MB: ["#312e81", "#2563eb"],
  TCB: ["#9f1239", "#dc2626"],
  BIDV: ["#134e4a", "#0e7490"],
  ACB: ["#1e3a8a", "#0369a1"],
  ICB: ["#1e40af", "#4f46e5"],
  TPB: ["#5b21b6", "#c026d3"],
  VBA: ["#7c2d12", "#ea580c"],
  VPB: ["#14532d", "#16a34a"],
  MOMO: ["#a50064", "#d82d8b"],
};
const FALLBACK_TINT: readonly [string, string] = ["#334155", "#64748b"];
const MOMO_GRADIENT = "linear-gradient(135deg, #a50064 0%, #d82d8b 100%)";
const CARD_TEXT_SOFT = "rgba(255, 255, 255, 0.86)";

const CHIP_STYLE: Readonly<Record<"verified" | "pending" | "source" | "receive" | "demo", CSSProperties>> = {
  verified: { backgroundColor: "#ffffff", color: "#065f46" },
  pending: { backgroundColor: "rgba(2, 6, 23, 0.4)", color: "#fde68a" },
  source: { backgroundColor: "#fcd34d", color: "#1f2937" },
  receive: { backgroundColor: "#a7f3d0", color: "#064e3b" },
  demo: { backgroundColor: "rgba(255, 255, 255, 0.24)", color: "#ffffff" },
};

const CARD_GHOST_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[rgba(255,255,255,0.16)] px-2 py-1.5 text-center text-xs leading-tight font-bold text-[#ffffff] transition-colors hover:bg-[rgba(255,255,255,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffffff]";
const CARD_DANGER_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#e11d48] px-2 py-1.5 text-center text-xs leading-tight font-extrabold text-[#ffffff] transition-colors hover:bg-[#be123c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffffff]";
const CARD_PRIMARY_BUTTON =
  "col-span-2 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#ffffff] px-3 py-2 text-sm font-extrabold text-[#0f172a] shadow-sm transition-colors hover:bg-[#e2e8f0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffffff]";

const PANEL_CLASS = "mt-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4";
const INPUT_CLASS =
  "w-full min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70 focus:outline-none disabled:opacity-60";
const LABEL_CLASS = "mb-1 block text-xs font-semibold text-slate-600";
const PRIMARY_BUTTON =
  "tp-pill-btn inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
const APP_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-center text-xs font-bold text-slate-800 hover:bg-slate-100";
const BRAND_BUTTON =
  "inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-[#ffffff] shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

// ------------------------------------------------------------------ tiện ích

function cardBackground(code: string): string {
  const [from, to] = CARD_TINT[code] ?? FALLBACK_TINT;
  return `linear-gradient(180deg, rgba(2, 6, 23, 0) 30%, rgba(2, 6, 23, 0.34) 100%), linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  return (
    /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1)
  );
}

/** Cuộn bảng vừa mở vào tầm nhìn + chuyển focus tới tiêu đề (tham chiếu ổn định → chỉ chạy khi gắn). */
function focusOnMount(node: HTMLElement | null): void {
  if (!node || typeof window === "undefined") return;
  const rect = node.getBoundingClientRect();
  if (rect.top < 0 || rect.top > window.innerHeight * 0.6) {
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }
  node.focus({ preventScroll: true });
}

function notifyQrSave(result: QrImageSaveResult, t: Translations, onToast: (toast: ToastNotification) => void): void {
  if (result === "shared") {
    onToast({ type: "info", title: t.vault.toast.qrShared, description: t.vault.toast.qrSavedDesc });
  } else if (result === "downloaded") {
    onToast({ type: "success", title: t.vault.toast.qrSaved, description: t.vault.toast.qrSavedDesc });
  } else if (result === "failed") {
    onToast({ type: "warning", title: t.vault.toast.qrFailed, description: t.vault.toast.qrFailedDesc });
  }
}

// --------------------------------------------------- mã xác thực TPLINK (bộ nhớ phiên)

interface LinkChallenge {
  /** Ràng buộc với id + STK: đổi STK → mã cũ vô hiệu. */
  key: string;
  code: string;
  attempts: number;
}

/** Giữ mã trong RAM của phiên (đóng / mở lại bảng không đổi mã). KHÔNG ghi localStorage, KHÔNG log. */
const linkChallenges = new Map<string, LinkChallenge>();

function challengeKey(account: Pick<StoredLinkedAccount, "id" | "accountNumber">): string {
  return `${account.id}:${account.accountNumber}`;
}

function generateLinkCode(): string {
  const bytes = new Uint8Array(LINK_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += LINK_CODE_ALPHABET[byte & 31];
  }
  return code;
}

function obtainChallenge(key: string): LinkChallenge {
  const existing = linkChallenges.get(key);
  if (existing) return existing;
  const fresh: LinkChallenge = { key, code: generateLinkCode(), attempts: 0 };
  linkChallenges.set(key, fresh);
  return fresh;
}

function renewChallenge(key: string): LinkChallenge {
  const fresh: LinkChallenge = { key, code: generateLinkCode(), attempts: 0 };
  linkChallenges.set(key, fresh);
  return fresh;
}

/** Lấy 6 ký tự người dùng nhập (không phân biệt hoa thường; chấp nhận dán cả nội dung "TPLINK XXXXXX ..."). */
function extractLinkCode(raw: string): string {
  const cleaned = removeDiacritics(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const tagged = new RegExp(`${LINK_MEMO_PREFIX}([A-Z0-9]{${LINK_CODE_LENGTH}})`).exec(cleaned);
  return tagged ? tagged[1] : cleaned;
}

/** Bộ đếm sai PIN dùng chung trong phiên — đóng / mở lại bảng xác thực không xóa được khóa tạm. */
const pinGuard = { attempts: 0, lockedUntil: 0 };

// ------------------------------------------------------- cổng thu tiền (/api/payment/create)

type GatewayView =
  | { status: "loading"; key: string }
  | {
      status: "momo";
      key: string;
      orderId: string | null;
      environment: string | null;
      payUrl: string | null;
      deeplink: string | null;
      qrCodeUrl: string | null;
    }
  | { status: "local"; key: string; orderId: string | null; payload: string; mismatch: boolean }
  | { status: "error"; key: string; reason: "timeout" | "failed" };

interface GatewayExpectation {
  bankBin: string;
  accountNumber: string;
  amount: number;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function gatewayText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= max ? value : null;
}

/** Chỉ mở trang thanh toán HTTPS thuộc tên miền momo.vn (phản hồi máy chủ coi là không tin cậy). */
function safeMomoUrl(value: unknown): string | null {
  const text = gatewayText(value, 2048);
  if (!text) return null;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "momo.vn" || host.endsWith(".momo.vn")) ? url.href : null;
  } catch {
    return null;
  }
}

function safeMomoDeeplink(value: unknown): string | null {
  const text = gatewayText(value, 2048);
  return text && /^momo:\/\/[^\s"'<>]*$/i.test(text) ? text : null;
}

/** Mã QR chỉ hiển thị khi đúng một trong hai dạng của MoMo (momo:// hoặc https://*.momo.vn). */
function safeMomoQrContent(value: unknown): string | null {
  return safeMomoDeeplink(value) ?? safeMomoUrl(value);
}

/** VietQR máy chủ trả về phải đúng CRC + BIN + STK + số tiền của chính người dùng. */
function vietQrMatches(payload: string, expected: GatewayExpectation): boolean {
  try {
    const decoded = decodeVietQr(payload).decoded;
    return Boolean(
      decoded &&
        decoded.crc.valid &&
        decoded.bankBin === expected.bankBin &&
        decoded.accountNumber === expected.accountNumber &&
        decoded.amount === expected.amount,
    );
  } catch {
    return false;
  }
}

function parseGatewayResponse(
  raw: unknown,
  key: string,
  expected: GatewayExpectation,
  localPayload: string | null,
): GatewayView | null {
  const record = asObject(raw);
  if (!record || record.ok !== true) return null;
  const orderId = gatewayText(record.orderId, 64);
  const environment = gatewayText(record.environment, 32);
  if (record.mode === "MOMO_GATEWAY") {
    const momo = asObject(record.momo);
    if (!momo) return null;
    const payUrl = safeMomoUrl(momo.payUrl);
    const deeplink = safeMomoDeeplink(momo.deeplink);
    const qrCodeUrl = safeMomoQrContent(momo.qrCodeUrl);
    if (!payUrl && !deeplink && !qrCodeUrl) return null;
    return { status: "momo", key, orderId, environment, payUrl, deeplink, qrCodeUrl };
  }
  if (record.mode === "LOCAL_VIETQR") {
    const vietqr = asObject(record.vietqr);
    const payload = vietqr ? gatewayText(vietqr.payload, 512) : null;
    if (payload && vietQrMatches(payload, expected)) {
      return { status: "local", key, orderId, payload, mismatch: false };
    }
    return localPayload ? { status: "local", key, orderId, payload: localPayload, mismatch: payload !== null } : null;
  }
  return null;
}

// ------------------------------------------------------------------ thành phần phụ

function PanelHeader({ title, icon, onClose }: { title: string; icon: ReactNode; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-between gap-3">
      <h3
        ref={focusOnMount}
        tabIndex={-1}
        className="flex min-w-0 scroll-mt-24 items-start gap-2 pt-2.5 text-sm font-bold text-slate-900 focus:outline-none"
      >
        <span className="mt-0.5 shrink-0 text-slate-600">{icon}</span>
        <span className="min-w-0">{title}</span>
      </h3>
      <button
        type="button"
        onClick={onClose}
        aria-label={t.vault.close}
        title={t.vault.close}
        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

function TrustNote({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <p
      className={`flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 ${
        compact ? "px-3 py-2 text-[11px]" : "px-3 py-2.5 text-xs"
      } leading-relaxed`}
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
      <span>{t.vault.trustNote}</span>
    </p>
  );
}

function CardChip({ tone, icon, children }: { tone: keyof typeof CHIP_STYLE; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-tight font-extrabold" style={CHIP_STYLE[tone]}>
      {icon}
      {children}
    </span>
  );
}

function AccountTypeIcon({ type, className }: { type: LinkedAccountType; className: string }) {
  if (type === "WALLET") return <Smartphone className={className} aria-hidden />;
  if (type === "SAVINGS") return <PiggyBank className={className} aria-hidden />;
  return <Landmark className={className} aria-hidden />;
}

interface VaultCardProps {
  account: StoredLinkedAccount;
  bank: string;
  label: string;
  isSource: boolean;
  isReceive: boolean;
  armed: boolean;
  active: boolean;
  onComplete: () => void;
  onVerify: () => void;
  onReceiveQr: () => void;
  onSetSource: () => void;
  onSetReceive: () => void;
  onUnlink: () => void;
}

function VaultCard({
  account,
  bank,
  label,
  isSource,
  isReceive,
  armed,
  active,
  onComplete,
  onVerify,
  onReceiveQr,
  onSetSource,
  onSetReceive,
  onUnlink,
}: VaultCardProps) {
  const { t } = useI18n();
  const hasNumber = account.accountNumber !== "";
  const methodText = account.verifyMethod ? t.vault.method[account.verifyMethod] : null;
  const verified = isLinkedAccountVerified(account) && methodText !== null;
  const primary = !hasNumber
    ? { text: t.vault.action.complete, icon: <KeyRound className="h-4 w-4" aria-hidden />, onClick: onComplete }
    : !verified
      ? { text: t.vault.action.verify, icon: <ShieldCheck className="h-4 w-4" aria-hidden />, onClick: onVerify }
      : { text: t.vault.action.receiveQr, icon: <QrCode className="h-4 w-4" aria-hidden />, onClick: onReceiveQr };
  const boxShadow = [
    isSource ? "inset 0 0 0 2px rgba(255, 255, 255, 0.92)" : "",
    active ? "0 0 0 3px #fbbf24" : "0 14px 30px -18px rgba(2, 6, 23, 0.75)",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      aria-label={label}
      className="flex h-full flex-col gap-2 rounded-2xl p-3.5"
      style={{ background: cardBackground(account.institutionCode), color: "#ffffff", boxShadow }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">{bank}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: CARD_TEXT_SOFT }}>
            <AccountTypeIcon type={account.accountType} className="h-3.5 w-3.5" />
            {t.vault.accountType[account.accountType]}
          </p>
        </div>
        {account.demo && (
          <span className="shrink-0">
            <CardChip tone="demo">{t.vault.badge.demo}</CardChip>
          </span>
        )}
      </div>

      <p className="tp-code text-xl font-bold tracking-wider">•••• {account.last4}</p>
      <p className="truncate text-xs font-semibold" style={{ color: CARD_TEXT_SOFT }}>
        {account.holderName || t.vault.noHolder}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {verified && methodText ? (
          <CardChip tone="verified" icon={<BadgeCheck className="h-3 w-3" aria-hidden />}>
            {t.vault.badge.verified(methodText)}
          </CardChip>
        ) : hasNumber ? (
          <CardChip tone="pending" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>
            {t.vault.badge.unverified}
          </CardChip>
        ) : null}
        {isSource && (
          <CardChip tone="source" icon={<Star className="h-3 w-3" aria-hidden />}>
            {t.vault.badge.source}
          </CardChip>
        )}
        {isReceive && (
          <CardChip tone="receive" icon={<ArrowDownToLine className="h-3 w-3" aria-hidden />}>
            {t.vault.badge.receive}
          </CardChip>
        )}
      </div>

      {account.demo && (
        <p className="text-[11px] leading-snug" style={{ color: CARD_TEXT_SOFT }}>
          {t.vault.demoHint}
        </p>
      )}

      <div className="mt-auto grid grid-cols-2 gap-1.5 pt-1">
        <button type="button" onClick={primary.onClick} className={CARD_PRIMARY_BUTTON}>
          {primary.icon}
          {primary.text}
        </button>
        {hasNumber && !verified && (
          <button type="button" onClick={onReceiveQr} className={CARD_GHOST_BUTTON}>
            <QrCode className="h-4 w-4 shrink-0" aria-hidden />
            {t.vault.action.receiveQr}
          </button>
        )}
        {!isSource && (
          <button type="button" onClick={onSetSource} className={CARD_GHOST_BUTTON}>
            <Star className="h-4 w-4 shrink-0" aria-hidden />
            {t.vault.action.setSource}
          </button>
        )}
        {canBeDefaultReceive(account) && !isReceive && (
          <button type="button" onClick={onSetReceive} className={CARD_GHOST_BUTTON}>
            <ArrowDownToLine className="h-4 w-4 shrink-0" aria-hidden />
            {t.vault.action.setReceive}
          </button>
        )}
        <button
          type="button"
          onClick={onUnlink}
          aria-label={armed ? `${t.vault.action.unlinkConfirm}: ${label}` : `${t.vault.action.unlink}: ${label}`}
          className={armed ? CARD_DANGER_BUTTON : CARD_GHOST_BUTTON}
        >
          <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
          {armed ? t.vault.action.unlinkConfirm : t.vault.action.unlink}
        </button>
      </div>
    </article>
  );
}

function AccountTypePicker({
  name,
  institution,
  value,
  onChange,
}: {
  name: string;
  institution: PayeeInstitution | undefined;
  value: LinkedAccountType;
  onChange: (next: LinkedAccountType) => void;
}) {
  const { t } = useI18n();
  const isWallet = institution?.kind === "EWALLET";
  return (
    <fieldset className="min-w-0">
      <legend className={LABEL_CLASS}>{t.vault.form.type}</legend>
      <div className="grid grid-cols-3 gap-2">
        {LINKED_ACCOUNT_TYPES.map((type) => {
          const allowed = isWallet ? type === "WALLET" : type !== "WALLET";
          return (
            <label key={type} className={allowed ? "cursor-pointer" : "cursor-not-allowed"}>
              <input
                type="radio"
                name={name}
                value={type}
                checked={value === type}
                disabled={!allowed}
                onChange={() => onChange(type)}
                className="peer sr-only"
              />
              <span className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-center text-xs font-bold text-slate-700 transition-colors peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400 peer-disabled:opacity-40">
                <AccountTypeIcon type={type} className="h-4 w-4 shrink-0" />
                {t.vault.accountType[type]}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{isWallet ? t.vault.form.walletOnly : t.vault.form.bankOnly}</p>
      {value === "SAVINGS" && <p className="mt-1 text-[11px] font-semibold text-amber-700">{t.vault.form.savingsHint}</p>}
    </fieldset>
  );
}

function AddAccountForm({ onSubmit, onCancel }: { onSubmit: (draft: AccountDraft) => SaveResult; onCancel: () => void }) {
  const { t } = useI18n();
  const typeName = useId();
  const [code, setCode] = useState<PayeeInstitutionCode>("VCB");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [accountType, setAccountType] = useState<LinkedAccountType>("CHECKING");
  const [makeReceive, setMakeReceive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const institution = findInstitution(code);
  const isWallet = institution?.kind === "EWALLET";
  const holderPreview = sanitizeAccountName(holder);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!institution) return;
    const normalized = normalizeAccountNumber(number);
    const validation = validatePayeeAccount(normalized, institution);
    if (validation !== "OK") {
      setError(t.vault.form.error[validation]);
      return;
    }
    if (holderPreview.length < 2) {
      setError(t.vault.form.error.holder);
      return;
    }
    const result = onSubmit({
      institutionCode: institution.code,
      accountNumber: normalized,
      holderName: holderPreview,
      accountType: resolveAccountType(institution.code, accountType),
      makeReceive,
    });
    if (result === "DUPLICATE") setError(t.vault.form.error.duplicate);
    else if (result === "LIMIT") setError(t.vault.form.error.limit(MAX_LINKED_ACCOUNTS));
    else if (result === "FAILED") setError(t.vault.form.error.failed);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <PanelHeader title={t.vault.form.addTitle} icon={<Plus className="h-4 w-4" aria-hidden />} onClose={onCancel} />
      <label className="block">
        <span className={LABEL_CLASS}>{t.vault.form.bank}</span>
        <select
          value={code}
          onChange={(event) => {
            const next = event.target.value;
            if (!isPayeeInstitutionCode(next)) return;
            setCode(next);
            setAccountType((prev) => resolveAccountType(next, prev));
            setError(null);
          }}
          className={`${INPUT_CLASS} cursor-pointer`}
        >
          {PAYEE_INSTITUTIONS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.shortName}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>{isWallet ? t.vault.form.walletPhone : t.vault.form.accountNo}</span>
        <input
          value={number}
          onChange={(event) => {
            setNumber(event.target.value);
            setError(null);
          }}
          inputMode={isWallet ? "tel" : "numeric"}
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          className={`${INPUT_CLASS} tp-code tracking-wider`}
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>{t.vault.form.holder}</span>
        <input
          value={holder}
          onChange={(event) => {
            setHolder(event.target.value);
            setError(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={50}
          placeholder={t.vault.form.holderPlaceholder}
          className={`${INPUT_CLASS} uppercase placeholder:normal-case`}
        />
        <span className="mt-1 block text-[11px] text-slate-500">{t.vault.form.holderPreview(holderPreview)}</span>
      </label>
      <AccountTypePicker name={typeName} institution={institution} value={accountType} onChange={setAccountType} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={makeReceive}
          onChange={(event) => setMakeReceive(event.target.checked)}
          className="h-5 w-5 shrink-0 cursor-pointer accent-emerald-600"
        />
        {t.vault.form.makeReceive}
      </label>
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className={`${PRIMARY_BUTTON} sm:flex-1`}>
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {t.vault.form.submit}
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          {t.vault.cancel}
        </button>
      </div>
    </form>
  );
}

function CompleteAccountForm({
  account,
  label,
  onSubmit,
  onCancel,
}: {
  account: StoredLinkedAccount;
  label: string;
  onSubmit: (draft: CompleteDraft) => SaveResult;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const typeName = useId();
  const institution = findInstitution(account.institutionCode);
  const isWallet = institution?.kind === "EWALLET";
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState(account.holderName);
  const [accountType, setAccountType] = useState<LinkedAccountType>(account.accountType);
  const [error, setError] = useState<string | null>(null);
  const holderPreview = sanitizeAccountName(holder);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeAccountNumber(number);
    const validation = validatePayeeAccount(normalized, institution);
    if (validation !== "OK") {
      setError(t.vault.form.error[validation]);
      return;
    }
    if (holderPreview.length < 2) {
      setError(t.vault.form.error.holder);
      return;
    }
    const result = onSubmit({
      accountNumber: normalized,
      holderName: holderPreview,
      accountType: resolveAccountType(account.institutionCode, accountType),
    });
    if (result === "DUPLICATE") setError(t.vault.form.error.duplicate);
    else if (result !== "OK") setError(t.vault.form.error.failed);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <PanelHeader title={t.vault.form.completeTitle(label)} icon={<KeyRound className="h-4 w-4" aria-hidden />} onClose={onCancel} />
      <p className="text-xs leading-relaxed text-slate-600">{t.vault.form.completeDesc}</p>
      <label className="block">
        <span className={LABEL_CLASS}>{isWallet ? t.vault.form.walletPhone : t.vault.form.accountNo}</span>
        <input
          value={number}
          onChange={(event) => {
            setNumber(event.target.value);
            setError(null);
          }}
          inputMode={isWallet ? "tel" : "numeric"}
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          placeholder={`•••• ${account.last4}`}
          className={`${INPUT_CLASS} tp-code tracking-wider`}
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>{t.vault.form.holder}</span>
        <input
          value={holder}
          onChange={(event) => {
            setHolder(event.target.value);
            setError(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={50}
          placeholder={t.vault.form.holderPlaceholder}
          className={`${INPUT_CLASS} uppercase placeholder:normal-case`}
        />
        <span className="mt-1 block text-[11px] text-slate-500">{t.vault.form.holderPreview(holderPreview)}</span>
      </label>
      <AccountTypePicker name={typeName} institution={institution} value={accountType} onChange={setAccountType} />
      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" className={`${PRIMARY_BUTTON} sm:flex-1`}>
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {t.vault.form.completeSubmit}
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          {t.vault.cancel}
        </button>
      </div>
    </form>
  );
}

function MethodOption({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-16 w-full cursor-pointer items-start gap-3 rounded-2xl border bg-white p-3 text-left transition-colors hover:bg-slate-100 ${
        active ? "border-slate-900 ring-2 ring-slate-900/15" : "border-slate-200"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{desc}</span>
      </span>
    </button>
  );
}

interface OtherBankApp {
  code: string;
  name: string;
  link: string;
}

type Notice = { tone: "error" | "warn"; text: string };

interface VerifyPanelProps {
  account: StoredLinkedAccount;
  hub: HubState;
  bank: string;
  label: string;
  onVerified: (method: LinkedAccountVerifyMethod) => void;
  onClose: () => void;
  onToast: (toast: ToastNotification) => void;
}

function VerifyPanel({ account, hub, bank, label, onVerified, onClose, onToast }: VerifyPanelProps) {
  const { t, money } = useI18n();
  const [mode, setMode] = useState<"VIETQR" | "DEVICE" | null>(null);
  const [challenge, setChallenge] = useState<LinkChallenge | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeNotice, setCodeNotice] = useState<Notice | null>(null);
  const [desktopNote, setDesktopNote] = useState(false);
  const [webAuthn, setWebAuthn] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [pinLocked, setPinLocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const lockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
    };
  }, []);

  const institution = findInstitution(account.institutionCode);
  const isWallet = institution?.kind === "EWALLET";
  // Nội dung chuyển khoản chứa mã — chỉ dùng để dựng QR / Deep Link, không bao giờ render ra chữ.
  const memo = challenge ? `${LINK_MEMO_PREFIX} ${challenge.code}` : "";

  const payload = useMemo(() => {
    if (!memo) return null;
    try {
      return buildPayeeVietQr(
        { institutionCode: account.institutionCode, accountNumber: account.accountNumber, accountName: account.holderName },
        VERIFY_AMOUNT_VND,
        memo,
      );
    } catch {
      return null;
    }
  }, [memo, account.institutionCode, account.accountNumber, account.holderName]);
  const matrix = useQrMatrix(payload ?? "");

  const otherApps = useMemo<OtherBankApp[]>(() => {
    if (!memo || !institution) return [];
    const apps: OtherBankApp[] = [];
    for (const item of PAYER_BANK_APPS) {
      if (item.code === institution.code) continue;
      const link = buildBankTransferDeepLink({
        appId: item.slug,
        bankBin: institution.bin,
        accountNumber: account.accountNumber,
        amount: VERIFY_AMOUNT_VND,
        memo,
        accountName: account.holderName,
      });
      if (link) apps.push({ code: item.code, name: item.shortName, link });
      if (apps.length >= OTHER_BANK_APP_LIMIT) break;
    }
    return apps;
  }, [memo, institution, account.accountNumber, account.holderName]);

  const chooseMode = (next: "VIETQR" | "DEVICE") => {
    setMode(next);
    setDesktopNote(false);
    if (next === "VIETQR" && !challenge) setChallenge(obtainChallenge(challengeKey(account)));
    if (next === "DEVICE") setWebAuthn(isWebAuthnSupported());
  };

  const handleSaveQr = async () => {
    if (!matrix) return;
    const result = await saveQrImage(matrix, `trustpay-xac-thuc-${account.institutionCode.toLowerCase()}-${account.last4}.png`, {
      title: t.vault.verify.qrTitle,
      caption: [t.vault.verify.qrTitle, label, money(VERIFY_AMOUNT_VND)],
    });
    notifyQrSave(result, t, onToast);
  };

  const openBankApp = (link: string) => {
    if (!isMobileDevice()) {
      setDesktopNote(true);
      return;
    }
    setDesktopNote(false);
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const openMomo = () => {
    if (!isMobileDevice()) {
      setDesktopNote(true);
      return;
    }
    window.location.href = buildMomoAppLink();
  };

  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge) return;
    const candidate = extractLinkCode(codeInput);
    if (candidate.length !== LINK_CODE_LENGTH || candidate === LINK_MEMO_PREFIX) {
      setCodeNotice({ tone: "warn", text: t.vault.verify.codeLength });
      return;
    }
    setCodeInput("");
    if (candidate === challenge.code) {
      linkChallenges.delete(challenge.key);
      setChallenge(null);
      setCodeNotice(null);
      onVerified("VIETQR_1000");
      return;
    }
    const attempts = challenge.attempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      setChallenge(renewChallenge(challenge.key));
      setCodeNotice({ tone: "warn", text: t.vault.verify.codeRenewed });
      return;
    }
    const next: LinkChallenge = { ...challenge, attempts };
    linkChallenges.set(next.key, next);
    setChallenge(next);
    setCodeNotice({ tone: "error", text: t.vault.verify.codeWrong(MAX_CODE_ATTEMPTS - attempts) });
  };

  const lockPinFor = (ms: number) => {
    setPinLocked(true);
    if (lockTimerRef.current !== null) window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = window.setTimeout(() => {
      lockTimerRef.current = null;
      setPinLocked(false);
      setPinNotice(null);
    }, ms);
  };

  const submitPin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = Date.now();
    if (pinGuard.lockedUntil > now) {
      const remaining = pinGuard.lockedUntil - now;
      lockPinFor(remaining);
      setPin("");
      setPinNotice(t.vault.verify.pinLocked(Math.ceil(remaining / 1000)));
      return;
    }
    if (verifyAppPin(hub, pin)) {
      pinGuard.attempts = 0;
      setPin("");
      setPinNotice(null);
      onVerified("PIN");
      return;
    }
    pinGuard.attempts += 1;
    setPin("");
    if (pinGuard.attempts >= MAX_PIN_ATTEMPTS) {
      pinGuard.attempts = 0;
      pinGuard.lockedUntil = now + PIN_LOCKOUT_MS;
      lockPinFor(PIN_LOCKOUT_MS);
      setPinNotice(t.vault.verify.pinLocked(Math.round(PIN_LOCKOUT_MS / 1000)));
    } else {
      setPinNotice(t.vault.verify.pinWrong(MAX_PIN_ATTEMPTS - pinGuard.attempts));
    }
  };

  const runPasskey = async () => {
    const credentialId = hub.appLock.passkeyId;
    if (!credentialId || verifying) return;
    setVerifying(true);
    const result = await verifyDevicePasskey(credentialId);
    setVerifying(false);
    if (result.ok) {
      onVerified("PASSKEY");
    } else if (result.reason !== "CANCELLED") {
      setPinNotice(t.vault.verify.passkeyFailed);
    }
  };

  const passkeyReady = webAuthn === true && Boolean(hub.appLock.passkeyId);

  return (
    <div className="space-y-3">
      <PanelHeader title={t.vault.verify.title(label)} icon={<ShieldCheck className="h-4 w-4" aria-hidden />} onClose={onClose} />
      <TrustNote compact />
      <p className="text-xs font-semibold text-slate-700">{t.vault.verify.choose}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MethodOption
          active={mode === "VIETQR"}
          icon={<QrCode className="h-5 w-5" aria-hidden />}
          title={t.vault.verify.qrOption}
          desc={t.vault.verify.qrOptionDesc}
          onClick={() => chooseMode("VIETQR")}
        />
        <MethodOption
          active={mode === "DEVICE"}
          icon={<Fingerprint className="h-5 w-5" aria-hidden />}
          title={t.vault.verify.deviceOption}
          desc={t.vault.verify.deviceOptionDesc}
          onClick={() => chooseMode("DEVICE")}
        />
      </div>

      {mode === "VIETQR" && challenge && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
          <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-slate-700">
            <li>{t.vault.verify.step1(bank)}</li>
            <li className="font-semibold text-slate-900">
              {account.holderName ? t.vault.verify.step2(account.holderName) : t.vault.verify.step2Self}
            </li>
            <li>{t.vault.verify.step3}</li>
            <li>{t.vault.verify.step4}</li>
          </ol>

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            {payload && (
              <div className="shrink-0 rounded-2xl border border-slate-200 p-2" style={{ backgroundColor: "#ffffff" }}>
                <QrCodeSvg value={payload} size={188} title={t.vault.verify.qrTitle} />
              </div>
            )}
            <dl className="grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-slate-500">{t.vault.verify.receiver}</dt>
              <dd className="tp-code font-semibold text-slate-900">{label}</dd>
              <dt className="text-slate-500">{t.vault.verify.amount}</dt>
              <dd className="tp-num text-base font-extrabold text-slate-900">{money(VERIFY_AMOUNT_VND)}</dd>
              <dt className="text-slate-500">{t.vault.verify.memo}</dt>
              <dd className="tp-code font-semibold text-slate-900">{t.vault.verify.memoMasked}</dd>
            </dl>
          </div>

          <button type="button" disabled={!matrix} onClick={() => void handleSaveQr()} className={`${SECONDARY_BUTTON} w-full`}>
            <Download className="h-4 w-4" aria-hidden />
            {t.vault.verify.save}
          </button>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700">{t.vault.verify.openOther}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {otherApps.map((app) => (
                <button key={app.code} type="button" onClick={() => openBankApp(app.link)} className={APP_BUTTON}>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {app.name}
                </button>
              ))}
              {!isWallet && (
                <button
                  type="button"
                  onClick={openMomo}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-center text-xs font-bold text-[#ffffff] hover:brightness-110"
                  style={{ background: MOMO_GRADIENT }}
                >
                  <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t.vault.verify.momo}
                </button>
              )}
            </div>
            {!isWallet && <p className="mt-1.5 text-[11px] text-slate-500">{t.vault.verify.momoTip}</p>}
            {isWallet && <p className="mt-2 text-[11px] font-semibold text-amber-700">{t.vault.verify.walletNote}</p>}
            {desktopNote && (
              <p role="status" className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-900">
                {t.vault.verify.desktopNote}
              </p>
            )}
          </div>

          <form onSubmit={submitCode} className="space-y-2">
            <label className="block">
              <span className={LABEL_CLASS}>{t.vault.verify.codeLabel}</span>
              <input
                value={codeInput}
                onChange={(event) => {
                  setCodeInput(event.target.value.slice(0, 80));
                  setCodeNotice(null);
                }}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={80}
                className={`${INPUT_CLASS} tp-code text-center text-lg tracking-[0.3em] uppercase`}
              />
              <span className="mt-1 block text-[11px] text-slate-500">{t.vault.verify.codeHint}</span>
            </label>
            {codeNotice && (
              <p role="alert" className={`text-xs font-semibold ${codeNotice.tone === "error" ? "text-rose-600" : "text-amber-700"}`}>
                {codeNotice.text}
              </p>
            )}
            <button type="submit" disabled={codeInput.trim() === ""} className={PRIMARY_BUTTON}>
              <BadgeCheck className="h-4 w-4" aria-hidden />
              {t.vault.verify.codeSubmit}
            </button>
          </form>
        </div>
      )}

      {mode === "DEVICE" && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
          {passkeyReady ? (
            <button type="button" disabled={verifying} onClick={() => void runPasskey()} className={PRIMARY_BUTTON}>
              {verifying ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <Fingerprint className="h-5 w-5" aria-hidden />}
              {t.vault.verify.passkey}
            </button>
          ) : (
            <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {webAuthn === false ? t.vault.verify.passkeyUnsupported : t.vault.verify.passkeyMissing}
            </p>
          )}
          <form onSubmit={submitPin} className="space-y-2">
            <label className="block">
              <span className={LABEL_CLASS}>{t.vault.verify.pinLabel}</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                disabled={pinLocked}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${INPUT_CLASS} tp-num text-center text-2xl tracking-[0.5em]`}
              />
              <span className="mt-1 block text-[11px] text-slate-500">{t.vault.verify.pinHint}</span>
            </label>
            {pinNotice && (
              <p role="alert" className="text-xs font-semibold text-rose-600">
                {pinNotice}
              </p>
            )}
            <button type="submit" disabled={pin.length !== 6 || pinLocked} className={PRIMARY_BUTTON}>
              <KeyRound className="h-4 w-4" aria-hidden />
              {t.vault.verify.pinSubmit}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface ReceivePanelProps {
  account: StoredLinkedAccount;
  label: string;
  requireUnlock: boolean;
  onRequestUnlock?: () => void;
  onVerify: () => void;
  onClose: () => void;
  onToast: (toast: ToastNotification) => void;
}

function ReceivePanel({ account, label, requireUnlock, onRequestUnlock, onVerify, onClose, onToast }: ReceivePanelProps) {
  const { t, money } = useI18n();
  const [amountText, setAmountText] = useState("");
  const [memoText, setMemoText] = useState("");
  const [gateway, setGateway] = useState<GatewayView | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Đã mở khóa và hiện mã một lần → giữ mã khi đổi số tiền / nội dung (giống Chia tiền nhóm).
  const [revealed, setRevealed] = useState(false);
  if (!revealed && !requireUnlock) {
    setRevealed(true);
  }
  const lockActive = requireUnlock && !revealed;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const institution = findInstitution(account.institutionCode);
  const parsedAmount = parseMoneyInput(amountText);
  const amount = isValidVietQrAmount(parsedAmount) ? parsedAmount : null;
  const amountInvalid = amountText.trim() !== "" && amount === null;
  const memo = sanitizeMemo(memoText);
  const verified = isLinkedAccountVerified(account);

  const payload = useMemo(() => {
    if (!institution) return null;
    try {
      return buildPayeeVietQr(
        { institutionCode: account.institutionCode, accountNumber: account.accountNumber, accountName: account.holderName },
        amount,
        memo,
      );
    } catch {
      return null;
    }
  }, [institution, account.institutionCode, account.accountNumber, account.holderName, amount, memo]);
  const matrix = useQrMatrix(payload ?? "");

  const gatewayKey = `${amount ?? 0}|${memo}`;
  const gatewayView = gateway && gateway.key === gatewayKey ? gateway : null;
  const gatewayLoading = gatewayView?.status === "loading";
  const gatewayEligible = amount !== null && amount >= GATEWAY_MIN_AMOUNT_VND;

  const handleSave = async () => {
    if (!matrix) return;
    const caption = [label, account.holderName, amount !== null ? money(amount) : t.vault.receive.staticNote, memo, t.vault.receive.fileCaption].filter(
      (line) => line !== "",
    );
    const result = await saveQrImage(
      matrix,
      `trustpay-nhan-tien-${account.institutionCode.toLowerCase()}-${account.last4}${amount !== null ? `-${amount}` : ""}.png`,
      { title: t.vault.receive.qrTitle(label), caption },
    );
    notifyQrSave(result, t, onToast);
  };

  const startGateway = async () => {
    if (!institution || amount === null || amount < GATEWAY_MIN_AMOUNT_VND || gatewayLoading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const key = gatewayKey;
    const expected: GatewayExpectation = { bankBin: institution.bin, accountNumber: account.accountNumber, amount };
    const localPayload = payload;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, GATEWAY_TIMEOUT_MS);
    setGateway({ status: "loading", key });
    try {
      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "AUTO",
          amount,
          memo: memo || sanitizeMemo(t.vault.gateway.defaultMemo),
          payee: {
            institutionCode: account.institutionCode,
            accountNumber: account.accountNumber,
            accountName: account.holderName,
          },
        }),
        signal: controller.signal,
      });
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (abortRef.current !== controller) return;
      const view = response.ok ? parseGatewayResponse(data, key, expected, localPayload) : null;
      setGateway(view ?? { status: "error", key, reason: "failed" });
    } catch {
      // Bị hủy do đóng bảng / gửi lệnh mới → bỏ qua; quá 10 giây hoặc lỗi mạng → thông báo nhẹ nhàng.
      if (abortRef.current !== controller) return;
      setGateway({ status: "error", key, reason: timedOut ? "timeout" : "failed" });
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const openMomoPayment = (view: Extract<GatewayView, { status: "momo" }>) => {
    if (isMobileDevice() && view.deeplink) {
      window.location.href = view.deeplink;
      return;
    }
    if (view.payUrl) {
      window.open(view.payUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (view.deeplink) window.location.href = view.deeplink;
  };

  return (
    <div className="space-y-3">
      <PanelHeader title={t.vault.receive.title(label)} icon={<QrCode className="h-4 w-4" aria-hidden />} onClose={onClose} />
      <p className="text-xs leading-relaxed text-slate-600">{t.vault.receive.desc}</p>

      {!verified && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2 text-[11px] font-semibold text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {t.vault.receive.unverifiedNote}
          </p>
          <button type="button" onClick={onVerify} className={`${SECONDARY_BUTTON} min-h-11 shrink-0`}>
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {t.vault.receive.verifyNow}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={LABEL_CLASS}>{t.vault.receive.amount}</span>
          <input
            value={amountText}
            onChange={(event) => setAmountText(event.target.value.slice(0, 20))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            placeholder={t.vault.receive.amountPlaceholder}
            className={`${INPUT_CLASS} tp-num`}
          />
          {amount !== null && <span className="tp-num mt-1 block text-xs font-bold text-slate-900">{money(amount)}</span>}
          {amountInvalid && <span className="mt-1 block text-[11px] font-semibold text-amber-700">{t.vault.receive.amountInvalid}</span>}
        </label>
        <label className="block">
          <span className={LABEL_CLASS}>{t.vault.receive.memo}</span>
          <input
            value={memoText}
            onChange={(event) => setMemoText(event.target.value.slice(0, 40))}
            autoComplete="off"
            maxLength={40}
            placeholder={t.vault.receive.memoPlaceholder}
            className={INPUT_CLASS}
          />
          {memo && <span className="tp-code mt-1 block text-[11px] text-slate-500">{t.vault.receive.memoPreview(memo)}</span>}
        </label>
      </div>

      {lockActive ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>
            <Lock className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm font-bold text-slate-900">{t.vault.receive.lockedTitle}</p>
          <p className="text-xs text-slate-500">{t.vault.receive.lockedDesc}</p>
          {onRequestUnlock && (
            <button type="button" onClick={onRequestUnlock} className={`${PRIMARY_BUTTON} mt-1`}>
              <Lock className="h-4 w-4" aria-hidden />
              {t.vault.receive.unlock}
            </button>
          )}
        </div>
      ) : (
        <>
          {payload && (
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl border border-slate-200 p-2" style={{ backgroundColor: "#ffffff" }}>
                <QrCodeSvg value={payload} size={208} title={t.vault.receive.qrTitle(label)} />
              </div>
              <p className="text-center text-[11px] text-slate-500">
                <span className="tp-code">{label}</span>
                {account.holderName ? ` · ${account.holderName}` : ""}
                {" · "}
                {amount !== null ? <span className="tp-num font-bold text-slate-900">{money(amount)}</span> : t.vault.receive.staticNote}
              </p>
              <button type="button" disabled={!matrix} onClick={() => void handleSave()} className={`${SECONDARY_BUTTON} w-full`}>
                <Download className="h-4 w-4" aria-hidden />
                {t.vault.receive.save}
              </button>
            </div>
          )}

          <div className="space-y-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={!gatewayEligible || gatewayLoading}
              onClick={() => void startGateway()}
              className={BRAND_BUTTON}
              style={{ background: MOMO_GRADIENT }}
            >
              {gatewayLoading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <HandCoins className="h-4 w-4" aria-hidden />}
              {gatewayLoading ? t.vault.gateway.loading : t.vault.gateway.cta}
            </button>
            {!gatewayEligible && <p className="text-[11px] text-slate-500">{t.vault.gateway.needAmount}</p>}

            {gatewayView?.status === "momo" && (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  {t.vault.gateway.ready}
                </p>
                {(gatewayView.orderId || gatewayView.environment) && (
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    {gatewayView.orderId && <span className="tp-code">{t.vault.gateway.orderId(gatewayView.orderId)}</span>}
                    {gatewayView.environment && <span>{t.vault.gateway.env(gatewayView.environment)}</span>}
                  </p>
                )}
                {(gatewayView.payUrl || gatewayView.deeplink) && (
                  <button type="button" onClick={() => openMomoPayment(gatewayView)} className={BRAND_BUTTON} style={{ background: MOMO_GRADIENT }}>
                    <Smartphone className="h-4 w-4" aria-hidden />
                    {t.vault.gateway.open}
                  </button>
                )}
                {gatewayView.qrCodeUrl && (
                  <div className="flex justify-center">
                    <div className="rounded-2xl border border-slate-200 p-2" style={{ backgroundColor: "#ffffff" }}>
                      <QrCodeSvg value={gatewayView.qrCodeUrl} size={176} title={t.vault.gateway.qrTitle} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {gatewayView?.status === "local" && (
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-start gap-2 text-xs font-semibold text-amber-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {t.vault.gateway.localNote}
                </p>
                {gatewayView.mismatch && <p className="text-[11px] font-semibold text-rose-600">{t.vault.gateway.mismatch}</p>}
                {gatewayView.orderId && <p className="tp-code text-[11px] text-slate-600">{t.vault.gateway.orderId(gatewayView.orderId)}</p>}
                <div className="flex justify-center">
                  <div className="rounded-2xl border border-slate-200 p-2" style={{ backgroundColor: "#ffffff" }}>
                    <QrCodeSvg value={gatewayView.payload} size={176} title={t.vault.gateway.localQrTitle} />
                  </div>
                </div>
              </div>
            )}

            {gatewayView?.status === "error" && (
              <p role="status" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                {gatewayView.reason === "timeout" ? t.vault.gateway.timeout : t.vault.gateway.error}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ thành phần chính

export default function BankVaultManager({
  onToast,
  onAudit,
  requireUnlock = false,
  onRequestUnlock,
  highlighted = false,
  sectionId = "tp-linked-accounts",
}: BankVaultManagerProps) {
  const { t } = useI18n();
  const hub = useHubState();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [armedUnlinkId, setArmedUnlinkId] = useState<string | null>(null);
  const armTimerRef = useRef<number | null>(null);
  /** Nút đã mở bảng — trả focus về đó khi bảng đóng (bàn phím / trình đọc màn hình). */
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    };
  }, []);

  const bankName = (code: string): string => findInstitution(code)?.shortName ?? code;
  const labelOf = (account: { institutionCode: string; last4: string }): string =>
    t.vault.masked(bankName(account.institutionCode), account.last4);

  /** Audit chỉ mang 4 số cuối — không bao giờ chứa STK đầy đủ hay tên chủ tài khoản. */
  const emitAudit = (action: VaultAuditEvent["action"], account: AuditAccount, method?: LinkedAccountVerifyMethod) => {
    onAudit?.({
      action,
      institutionCode: account.institutionCode,
      accountType: account.accountType,
      ...(method ? { method } : {}),
      last4: account.last4,
    });
  };

  const disarmUnlink = () => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    setArmedUnlinkId(null);
  };

  const armUnlink = (id: string) => {
    disarmUnlink();
    setArmedUnlinkId(id);
    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      setArmedUnlinkId(null);
    }, UNLINK_ARM_MS);
  };

  const openPanel = (next: Panel | null) => {
    disarmUnlink();
    if (next !== null && panel === null) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setPanel(next);
    if (next === null) {
      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger) {
        window.requestAnimationFrame(() => {
          if (trigger.isConnected) trigger.focus();
        });
      }
    }
  };

  const handleAdd = (draft: AccountDraft): SaveResult => {
    if (hub.linkedAccounts.some((item) => item.institutionCode === draft.institutionCode && item.accountNumber === draft.accountNumber)) {
      return "DUPLICATE";
    }
    if (hub.linkedAccounts.length >= MAX_LINKED_ACCOUNTS) return "LIMIT";
    const newId = createClientId("ACC");
    const last4 = draft.accountNumber.slice(-4);
    const storedId = addLinkedAccount(
      {
        id: newId,
        institutionCode: draft.institutionCode,
        accountNumber: draft.accountNumber,
        last4,
        holderName: draft.holderName,
        demo: false,
      },
      false,
      { accountType: draft.accountType },
    );
    if (storedId === null) return "FAILED";
    if (storedId !== newId) return "DUPLICATE";
    const snapshot: AuditAccount = { institutionCode: draft.institutionCode, accountType: draft.accountType, last4 };
    emitAudit("LINK", snapshot);
    onToast({ type: "success", title: t.vault.toast.linked(labelOf(snapshot)), description: t.vault.toast.linkedDesc });
    openPanel({ kind: "verify", accountId: newId, makeReceive: draft.makeReceive });
    return "OK";
  };

  const handleComplete = (account: StoredLinkedAccount, draft: CompleteDraft): SaveResult => {
    if (
      hub.linkedAccounts.some(
        (item) => item.id !== account.id && item.institutionCode === account.institutionCode && item.accountNumber === draft.accountNumber,
      )
    ) {
      return "DUPLICATE";
    }
    if (!completeLinkedAccount(account.id, draft.accountNumber, draft.holderName, { accountType: draft.accountType })) return "FAILED";
    linkChallenges.delete(challengeKey(account));
    const snapshot: AuditAccount = {
      institutionCode: account.institutionCode,
      accountType: resolveAccountType(account.institutionCode, draft.accountType),
      last4: draft.accountNumber.slice(-4),
    };
    emitAudit("LINK", snapshot);
    onToast({ type: "success", title: t.vault.toast.completed(labelOf(snapshot)), description: t.vault.toast.linkedDesc });
    openPanel({ kind: "verify", accountId: account.id, makeReceive: false });
    return "OK";
  };

  const handleVerified = (account: StoredLinkedAccount, method: LinkedAccountVerifyMethod, makeReceive: boolean) => {
    markLinkedAccountVerified(account.id, method, new Date().toISOString());
    emitAudit("VERIFY", account, method);
    const receiveSet = makeReceive && account.accountNumber !== "" && hub.defaultReceiveId !== account.id;
    if (receiveSet) {
      setDefaultReceive(account.id);
      emitAudit("SET_DEFAULT_RECEIVE", account);
    }
    const methodText = t.vault.method[method];
    onToast({
      type: "success",
      title: t.vault.toast.verified(labelOf(account)),
      description: receiveSet ? t.vault.toast.verifiedReceiveDesc(methodText) : t.vault.toast.verifiedDesc(methodText),
    });
    openPanel(null);
  };

  const handleSetSource = (account: StoredLinkedAccount) => {
    disarmUnlink();
    if (hub.defaultSourceId === account.id) return;
    setDefaultSource(account.id);
    emitAudit("SET_DEFAULT_SOURCE", account);
    onToast({ type: "success", title: t.vault.toast.source(labelOf(account)), description: t.vault.toast.sourceDesc });
  };

  const handleSetReceive = (account: StoredLinkedAccount) => {
    disarmUnlink();
    if (!canBeDefaultReceive(account) || hub.defaultReceiveId === account.id) return;
    setDefaultReceive(account.id);
    emitAudit("SET_DEFAULT_RECEIVE", account);
    onToast({ type: "success", title: t.vault.toast.receive(labelOf(account)), description: t.vault.toast.receiveDesc });
  };

  const handleUnlink = (account: StoredLinkedAccount) => {
    if (hub.linkedAccounts.length <= 1) {
      disarmUnlink();
      onToast({ type: "warning", title: t.vault.toast.keepOne, description: t.vault.toast.keepOneDesc });
      return;
    }
    if (armedUnlinkId !== account.id) {
      armUnlink(account.id);
      return;
    }
    disarmUnlink();
    if (!removeLinkedAccount(account.id)) return;
    linkChallenges.delete(challengeKey(account));
    emitAudit("UNLINK", account);
    onToast({ type: "info", title: t.vault.toast.unlinked(labelOf(account)), description: t.vault.toast.unlinkedDesc });
    if (panel && panel.kind !== "add" && panel.accountId === account.id) openPanel(null);
  };

  const panelAccount = panel && panel.kind !== "add" ? hub.linkedAccounts.find((item) => item.id === panel.accountId) : undefined;
  const receiveAccount = hub.defaultReceiveId ? hub.linkedAccounts.find((item) => item.id === hub.defaultReceiveId) : undefined;
  const atLimit = hub.linkedAccounts.length >= MAX_LINKED_ACCOUNTS;

  let panelKey = "";
  let panelContent: ReactNode = null;
  if (panel?.kind === "add") {
    panelKey = "add";
    panelContent = <AddAccountForm onSubmit={handleAdd} onCancel={() => openPanel(null)} />;
  } else if (panel && panelAccount) {
    panelKey = `${panel.kind}:${panelAccount.id}`;
    const label = labelOf(panelAccount);
    if (panel.kind === "complete") {
      panelContent = (
        <CompleteAccountForm
          account={panelAccount}
          label={label}
          onSubmit={(draft) => handleComplete(panelAccount, draft)}
          onCancel={() => openPanel(null)}
        />
      );
    } else if (panel.kind === "verify" && panelAccount.accountNumber) {
      panelContent = (
        <VerifyPanel
          account={panelAccount}
          hub={hub}
          bank={bankName(panelAccount.institutionCode)}
          label={label}
          onVerified={(method) => handleVerified(panelAccount, method, panel.makeReceive)}
          onClose={() => openPanel(null)}
          onToast={onToast}
        />
      );
    } else if (panel.kind === "receive" && panelAccount.accountNumber) {
      panelContent = (
        <ReceivePanel
          account={panelAccount}
          label={label}
          requireUnlock={requireUnlock}
          onRequestUnlock={onRequestUnlock}
          onVerify={() => openPanel({ kind: "verify", accountId: panelAccount.id, makeReceive: false })}
          onClose={() => openPanel(null)}
          onToast={onToast}
        />
      );
    }
  }

  return (
    <section
      id={sectionId}
      aria-labelledby="tp-vault-title"
      className={`rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5 ${highlighted ? "tp-highlight" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm"
          style={{ background: "linear-gradient(135deg, #0f766e 0%, #0369a1 100%)", color: "#ffffff" }}
        >
          <Vault className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="tp-vault-title" className="text-base font-bold text-slate-900">
            {t.vault.title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.vault.subtitle}</p>
          <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
            <ArrowDownToLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{receiveAccount ? t.vault.receiveSummary(labelOf(receiveAccount)) : t.vault.receiveNone}</span>
          </p>
        </div>
      </div>

      <div className="mt-3">
        <TrustNote />
      </div>

      <div className="@container mt-3">
        <ul
          aria-label={t.vault.listLabel}
          className="tp-scroll-x -mx-1 flex snap-x snap-mandatory gap-3 px-1 pt-1 pb-2 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pt-0 sm:pb-0 @md:grid-cols-2 @4xl:grid-cols-3"
        >
          {hub.linkedAccounts.map((account) => (
            <li key={account.id} className="w-[17.5rem] shrink-0 snap-start sm:w-auto">
              <VaultCard
                account={account}
                bank={bankName(account.institutionCode)}
                label={labelOf(account)}
                isSource={account.id === hub.defaultSourceId}
                isReceive={account.id === hub.defaultReceiveId}
                armed={armedUnlinkId === account.id}
                active={panel !== null && panel.kind !== "add" && panel.accountId === account.id}
                onComplete={() => openPanel({ kind: "complete", accountId: account.id })}
                onVerify={() => openPanel({ kind: "verify", accountId: account.id, makeReceive: false })}
                onReceiveQr={() => openPanel({ kind: "receive", accountId: account.id })}
                onSetSource={() => handleSetSource(account)}
                onSetReceive={() => handleSetReceive(account)}
                onUnlink={() => handleUnlink(account)}
              />
            </li>
          ))}
        </ul>
        {hub.linkedAccounts.length > 1 && <p className="mt-1 text-[11px] text-slate-500 sm:hidden">{t.vault.swipeHint}</p>}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {t.vault.receiveRule} {t.vault.localOnly}
        </span>
      </p>

      {panelContent && (
        <div key={panelKey} className={PANEL_CLASS}>
          {panelContent}
        </div>
      )}

      {panel?.kind !== "add" && (
        <div className="mt-3">
          <button
            type="button"
            disabled={atLimit}
            onClick={() => openPanel({ kind: "add" })}
            className={PRIMARY_BUTTON}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t.vault.form.addCta}
          </button>
          {atLimit && <p className="mt-1 text-[11px] font-semibold text-amber-700">{t.vault.form.limitReached(MAX_LINKED_ACCOUNTS)}</p>}
        </div>
      )}
    </section>
  );
}

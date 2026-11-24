import type { AwsEngineMode, RiskLevel } from "@/types/trustpay";
import { sha256HexSync } from "@/lib/crypto/sha256";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";

/**
 * Decision Token của TrustPay AI SDK — gói tin SDK gửi về Host App (MoMo / Ngân
 * hàng) qua `window.parent.postMessage` tại hook `onBeforeTransferConfirm`.
 *
 * Nguyên tắc:
 *  - KHÔNG chứa PII thô: STK đã che + dấu vân tay SHA-256 của `BIN:STK`, lý do
 *    dạng mã (không gửi văn bản lệnh hay tên người nhận).
 *  - `signatureHash` = SHA-256 trên JSON chuẩn hóa (khóa sắp xếp) của payload →
 *    Host tự băm lại để kiểm tra toàn vẹn. Production: thay bằng HMAC-SHA256 /
 *    ECDSA ký bằng khóa AWS KMS phía máy chủ, Host xác minh bằng khóa công khai.
 *  - Host App vẫn giữ tiền và tự xác thực sinh trắc C06 khi `biometricRequired`.
 */

export const SDK_VERSION = "1.0.0";
export const DECISION_TOKEN_TYPE = "TRUSTPAY_SDK_DECISION";
export const DECISION_SIGNATURE_ALG = "SHA-256/canonical-json";
export const DECISION_TOKEN_TTL_MS = 120_000;

export type SdkDecision = "ALLOW" | "HOLD_GUARDIAN" | "BLOCK";

export type SdkEventName =
  | "onBeforeTransferConfirm"
  | "onGuardianDecision"
  | "onTransferConfirm"
  | "onTransferCancel"
  | "onOpsBlock"
  | "onQrInspected";

export type SdkReasonCode =
  | "NO_SCAM_SIGNALS"
  | "BLACKLIST_MATCH"
  | "AUTHORITY_IMPERSONATION"
  | "PRIZE_FEE_LURE"
  | "URGENCY_PRESSURE"
  | "OVER_BUDGET"
  | "ACTIVE_UNKNOWN_CALL"
  | "HIGH_RISK_SCORE"
  | "MEDIUM_RISK_SCORE"
  | "AMOUNT_OVER_10M_TT50"
  | "DAILY_OVER_20M_TT50"
  | "UNTRUSTED_DEVICE"
  | "COOLING_OFF_15S"
  | "GUARDIAN_APPROVED"
  | "GUARDIAN_BLOCKED"
  | "USER_CONFIRMED"
  | "USER_BIOMETRIC_OVERRIDE"
  | "USER_CANCELLED"
  | "OPS_BLOCKED"
  | "QR_VERIFIED"
  | "QR_WARNING"
  | "QR_DANGER"
  | "AI_SIGNAL";

export type DecisionEngine = AwsEngineMode | "LOCAL_RULES";

export interface DecisionTokenPayload {
  type: typeof DECISION_TOKEN_TYPE;
  sdkVersion: string;
  event: SdkEventName;
  requestId: string;
  decision: SdkDecision;
  riskScore: number;
  riskLevel: RiskLevel;
  biometricRequired: boolean;
  /** Bên chịu trách nhiệm xác thực sinh trắc học theo TT 50 khi `biometricRequired`. */
  biometricOwner: "HOST_APP_C06";
  reasons: SdkReasonCode[];
  transaction: {
    amount: number;
    currency: "VND";
    payeeBankBin: string | null;
    payeeAccountMasked: string | null;
    /** 16 ký tự hex đầu của SHA-256(`BIN:STK`) — Host đối chiếu mà không cần STK thô. */
    payeeFingerprint: string | null;
  };
  engine: DecisionEngine;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
}

export interface DecisionToken extends DecisionTokenPayload {
  signatureAlg: typeof DECISION_SIGNATURE_ALG;
  signatureHash: string;
}

/** JSON chuẩn hóa: khóa đối tượng sắp xếp tăng dần, bỏ giá trị `undefined`, mảng giữ thứ tự. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(",")}}`;
}

/** Tách phần payload (bỏ chữ ký) để băm / xác minh. */
export function decisionPayloadOf(token: DecisionToken): DecisionTokenPayload {
  const { signatureAlg: _alg, signatureHash: _hash, ...payload } = token;
  void _alg;
  void _hash;
  return payload;
}

export function signDecisionPayload(payload: DecisionTokenPayload): DecisionToken {
  return {
    ...payload,
    signatureAlg: DECISION_SIGNATURE_ALG,
    signatureHash: sha256HexSync(canonicalJson(payload)),
  };
}

/** Host App (hoặc Ban Giám Khảo) băm lại payload để kiểm tra token không bị sửa. */
export function verifyDecisionToken(token: DecisionToken): boolean {
  return (
    token.signatureAlg === DECISION_SIGNATURE_ALG &&
    sha256HexSync(canonicalJson(decisionPayloadOf(token))) === token.signatureHash
  );
}

const RED_FLAG_RULES: readonly (readonly [RegExp, SdkReasonCode])[] = [
  [/danh sách đen|blacklist/i, "BLACKLIST_MATCH"],
  [/mạo danh cơ quan|cơ quan chức năng/i, "AUTHORITY_IMPERSONATION"],
  [/nhận phần thưởng|quà tặng|nhận thưởng/i, "PRIZE_FEE_LURE"],
  [/khẩn cấp|chuyển gấp/i, "URGENCY_PRESSURE"],
  [/hạn mức ngân sách/i, "OVER_BUDGET"],
  [/cuộc gọi từ số lạ/i, "ACTIVE_UNKNOWN_CALL"],
];

const POLICY_RULES: readonly (readonly [RegExp, SdkReasonCode])[] = [
  [/\/lần/i, "AMOUNT_OVER_10M_TT50"],
  [/\/ngày/i, "DAILY_OVER_20M_TT50"],
  [/thiết bị/i, "UNTRUSTED_DEVICE"],
  [/rủi ro CAO/i, "HIGH_RISK_SCORE"],
];

/** Đổi dấu hiệu đỏ (văn bản tiếng Việt của bộ luật) + lý do chính sách sinh trắc thành mã lý do không chứa PII. */
export function reasonCodesFrom(input: {
  redFlags: readonly string[];
  policyReasons: readonly string[];
  riskLevel: RiskLevel;
}): SdkReasonCode[] {
  const codes: SdkReasonCode[] = [];
  const add = (code: SdkReasonCode) => {
    if (!codes.includes(code)) codes.push(code);
  };

  for (const flag of input.redFlags) {
    if (/^Không phát hiện/i.test(flag.trim())) {
      continue;
    }
    const rule = RED_FLAG_RULES.find(([pattern]) => pattern.test(flag));
    add(rule ? rule[1] : "AI_SIGNAL");
  }
  for (const reason of input.policyReasons) {
    const rule = POLICY_RULES.find(([pattern]) => pattern.test(reason));
    if (rule) add(rule[1]);
  }
  if (input.riskLevel === "HIGH") add("HIGH_RISK_SCORE");
  if (input.riskLevel === "MEDIUM") add("MEDIUM_RISK_SCORE");
  if (codes.length === 0) add("NO_SCAM_SIGNALS");
  return codes;
}

/** Quyết định tại `onBeforeTransferConfirm`: tạm giữ → chờ Người giám hộ; CAO không giữ → chặn; còn lại → cho phép. */
export function decisionFromRisk(input: { riskLevel: RiskLevel; held: boolean }): SdkDecision {
  if (input.held) return "HOLD_GUARDIAN";
  if (input.riskLevel === "HIGH") return "BLOCK";
  return "ALLOW";
}

/** Nonce ngẫu nhiên 16 ký tự hex (Web Crypto nếu có, nếu không dùng Math.random). */
export function createNonce(): string {
  const bytes = new Uint8Array(8);
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface DecisionTokenInput {
  event: SdkEventName;
  requestId: string;
  decision: SdkDecision;
  riskScore: number;
  riskLevel: RiskLevel;
  biometricRequired: boolean;
  reasons: readonly SdkReasonCode[];
  amount: number;
  payee?: { bankBin: string; accountNumber: string } | null;
  engine: DecisionEngine;
  nowMs: number;
  nonce: string;
  ttlMs?: number;
}

export function createDecisionToken(input: DecisionTokenInput): DecisionToken {
  const payee = input.payee ?? null;
  const payload: DecisionTokenPayload = {
    type: DECISION_TOKEN_TYPE,
    sdkVersion: SDK_VERSION,
    event: input.event,
    requestId: input.requestId,
    decision: input.decision,
    riskScore: Math.max(0, Math.min(100, Math.round(input.riskScore))),
    riskLevel: input.riskLevel,
    biometricRequired: input.biometricRequired,
    biometricOwner: "HOST_APP_C06",
    reasons: Array.from(new Set(input.reasons)),
    transaction: {
      amount: Math.max(0, Math.round(input.amount)),
      currency: "VND",
      payeeBankBin: payee ? payee.bankBin : null,
      payeeAccountMasked: payee ? maskRecipientForDisplay(payee.accountNumber) : null,
      payeeFingerprint: payee ? sha256HexSync(`${payee.bankBin}:${payee.accountNumber}`).slice(0, 16) : null,
    },
    engine: input.engine,
    issuedAt: new Date(input.nowMs).toISOString(),
    expiresAt: new Date(input.nowMs + (input.ttlMs ?? DECISION_TOKEN_TTL_MS)).toISOString(),
    nonce: input.nonce,
  };
  return signDecisionPayload(payload);
}

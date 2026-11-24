import type { RiskLevel, WalletTransaction } from "@/types/trustpay";
import { verifyEmvCrc } from "@/lib/qr/emvco";
import { decodeVietQr } from "@/lib/qr/vietqr-inspector";
import { findInstitutionByBin } from "@/lib/payments/banks";
import { buildVietQrPayload, removeDiacritics } from "@/lib/payments/vietqr-builder";
import { findBlacklistMatches, isClusterPattern } from "@/lib/wallet/blacklist-patterns";
import {
  BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND,
  BIOMETRIC_SINGLE_TXN_THRESHOLD_VND,
  decideBiometric,
} from "@/lib/compliance/biometric-policy";
import { COERCION_HIGH_THRESHOLD } from "@/lib/behavioral-ml";

/**
 * Multi-Step Autonomous Investigation Agent — điều tra gian lận 4 bước tuần tự.
 *
 *   1. verify_vietqr_cryptography           — EMVCo TLV + CRC-16/CCITT-FALSE (0x1021) + BIN NAPAS
 *   2. analyze_behavioral_velocity          — số tiền / người nhận / khung giờ so với lịch sử cục bộ
 *   3. detect_social_engineering_and_injection — 5 kịch bản lừa đảo tại Việt Nam + Prompt Injection
 *   4. enforce_tt50_security_policy         — hợp nhất điểm rủi ro đa nguồn & áp chính sách TT 50
 *
 * Mỗi bước là một "tool" xác định (cùng đầu vào → cùng kết quả), chạy 100% offline. Khi có kết
 * quả của Lá chắn LLM (`/api/analyze` — Amazon Bedrock hoặc Offline Heuristic), bước 4 hợp nhất
 * điểm đó theo nguyên tắc sàn rủi ro (ADR-1): Agent chỉ NÂNG, không bao giờ hạ điểm của LLM.
 * Văn bản người dùng là DỮ LIỆU, không bao giờ là chỉ dẫn: câu "bỏ qua hướng dẫn / risk 0"
 * bị coi là dấu hiệu tấn công và làm tăng rủi ro.
 */

export type AgentStepId =
  | "verify_vietqr_cryptography"
  | "analyze_behavioral_velocity"
  | "detect_social_engineering_and_injection"
  | "enforce_tt50_security_policy";

export const AGENT_STEP_ORDER: readonly AgentStepId[] = [
  "verify_vietqr_cryptography",
  "analyze_behavioral_velocity",
  "detect_social_engineering_and_injection",
  "enforce_tt50_security_policy",
];

export type ScamScenarioId = "POLICE_VNEID" | "SHIPPER_CARD" | "CTV_INVEST" | "RELATIVE_BOSS" | "REMOTE_CONTROL";

export type FindingCode =
  | "NO_QR"
  | "QR_BUILT_OK"
  | "CRC_OK"
  | "CRC_MISMATCH"
  | "CRC_MISSING"
  | "QR_PARSE_FAILED"
  | "BIN_KNOWN"
  | "BIN_UNKNOWN"
  | "ACCOUNT_MISMATCH"
  | "HISTORY_EMPTY"
  | "AMOUNT_RATIO"
  | "AMOUNT_NORMAL"
  | "NIGHT_HOUR"
  | "DAY_HOUR"
  | "NEW_RECIPIENT"
  | "KNOWN_RECIPIENT"
  | "SCENARIO"
  | "INJECTION"
  | "BLACKLIST"
  | "CLEAN_TEXT"
  | "LLM_SCORE"
  | "ML_SCORE"
  | "FUSED_SCORE"
  | "TT50_SINGLE"
  | "TT50_DAILY"
  | "POLICY_BIOMETRIC"
  | "POLICY_COOLING"
  | "POLICY_ALLOW";

export interface AgentFinding {
  code: FindingCode;
  /** Giá trị hiển thị (không chứa PII thô — STK luôn đã che). */
  value?: string;
}

export type AgentStepStatus = "pass" | "warn" | "fail" | "skip";

export interface AgentStep {
  id: AgentStepId;
  status: AgentStepStatus;
  /** Rủi ro do bước này phát hiện (0–100). */
  risk: number;
  findings: AgentFinding[];
  durationMs: number;
}

export interface InvestigationInput {
  commandText: string;
  amount: number;
  /** Người nhận (BIN + STK) đã chọn, nếu có. */
  payee?: { bankBin: string; accountNumber: string } | null;
  /** Chuỗi VietQR quét được (nếu giao dịch bắt đầu từ mã QR). */
  qrPayload?: string | null;
  memo?: string;
  history: readonly WalletTransaction[];
  blacklist: readonly string[];
  nowMs: number;
  dailyOutflowBefore: number;
  /** Kết quả của Lá chắn LLM (Bedrock / Offline Heuristic) nếu đã có. */
  llm?: { score: number; level: RiskLevel; engine: "AWS" | "OFFLINE_HEURISTIC" | "LOCAL_RULES" } | null;
  /** Xác suất cưỡng ép từ Edge ML (0–1). */
  mlProbability?: number | null;
}

export type RiskSourceId = "qr" | "velocity" | "social" | "ml";

export interface RiskSource {
  id: RiskSourceId;
  risk: number;
}

export interface InvestigationReport {
  /** Rủi ro từng nguồn trước khi hợp nhất noisy-OR (dùng cho XAI). */
  sources: RiskSource[];
  steps: AgentStep[];
  finalScore: number;
  finalLevel: RiskLevel;
  requireBiometric: boolean;
  coolingOff: boolean;
  guardianRequired: boolean;
  scenarios: ScamScenarioId[];
  injectionDetected: boolean;
  engine: "OFFLINE_AGENT" | "LLM_FUSED";
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Hợp nhất rủi ro độc lập kiểu noisy-OR: 1 − Π(1 − rᵢ). */
export function noisyOr(risks: readonly number[]): number {
  const keep = risks.reduce((acc, risk) => acc * (1 - Math.max(0, Math.min(100, risk)) / 100), 1);
  return clampScore((1 - keep) * 100);
}

export function levelFromScore(score: number): RiskLevel {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function fold(text: string): string {
  return removeDiacritics(text.normalize("NFKC"))
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function maskAccount(account: string): string {
  return account.length <= 4 ? account : `${"•".repeat(Math.min(6, account.length - 4))}${account.slice(-4)}`;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

function timed<T>(fn: () => T): { result: T; ms: number } {
  const started = now();
  const result = fn();
  return { result, ms: Math.max(0, now() - started) };
}

// ----------------------------------------------------- Bước 1: VietQR

function verifyVietQrCryptography(input: InvestigationInput): Omit<AgentStep, "id" | "durationMs"> {
  const findings: AgentFinding[] = [];
  let payload = input.qrPayload?.trim() ?? "";
  let built = false;

  if (!payload && input.payee) {
    try {
      payload = buildVietQrPayload({
        bankBin: input.payee.bankBin,
        accountNumber: input.payee.accountNumber,
        amount: input.amount > 0 ? Math.round(input.amount) : null,
        memo: input.memo ?? "",
      });
      built = true;
    } catch {
      findings.push({ code: "QR_PARSE_FAILED" });
      return { status: "fail", risk: 60, findings };
    }
  }

  if (!payload) {
    findings.push({ code: "NO_QR" });
    return { status: "skip", risk: 0, findings };
  }

  const crc = verifyEmvCrc(payload);
  const decoded = decodeVietQr(payload).decoded;
  let risk = 0;

  if (!crc.present) {
    findings.push({ code: "CRC_MISSING" });
    risk = Math.max(risk, 70);
  } else if (!crc.valid) {
    findings.push({ code: "CRC_MISMATCH", value: `${crc.actual ?? "—"} ≠ ${crc.expected ?? "—"}` });
    risk = Math.max(risk, 85);
  } else {
    findings.push({ code: built ? "QR_BUILT_OK" : "CRC_OK", value: crc.actual ?? "" });
  }

  if (!decoded) {
    findings.push({ code: "QR_PARSE_FAILED" });
    risk = Math.max(risk, 60);
  } else {
    const institution = findInstitutionByBin(decoded.bankBin);
    if (institution) {
      findings.push({ code: "BIN_KNOWN", value: `${institution.shortName} · ${decoded.bankBin}` });
    } else if (decoded.bankName) {
      findings.push({ code: "BIN_KNOWN", value: `${decoded.bankName} · ${decoded.bankBin ?? "—"}` });
    } else {
      findings.push({ code: "BIN_UNKNOWN", value: decoded.bankBin ?? "—" });
      risk = Math.max(risk, 30);
    }
    if (input.payee && decoded.accountNumber && decoded.accountNumber !== input.payee.accountNumber) {
      findings.push({ code: "ACCOUNT_MISMATCH", value: maskAccount(decoded.accountNumber) });
      risk = Math.max(risk, 80);
    }
  }

  return { status: risk >= 70 ? "fail" : risk >= 30 ? "warn" : "pass", risk, findings };
}

// ----------------------------------------------- Bước 2: hành vi & tốc độ

function analyzeBehavioralVelocity(input: InvestigationInput): Omit<AgentStep, "id" | "durationMs"> {
  const findings: AgentFinding[] = [];
  const history = input.history.filter(
    (tx) => tx.status === "COMPLETED" && (tx.channel === "TRANSFER" || tx.channel === "SHOPPING") && tx.amount > 0,
  );
  const hour = new Date(input.nowMs + VN_OFFSET_MS).getUTCHours();
  const night = hour >= 22 || hour < 5;
  const risks: number[] = [];

  findings.push({ code: night ? "NIGHT_HOUR" : "DAY_HOUR", value: `${hour}h` });

  if (history.length === 0) {
    findings.push({ code: "HISTORY_EMPTY" });
    if (night) risks.push(8);
  } else {
    const mean = history.reduce((sum, tx) => sum + tx.amount, 0) / history.length;
    const ratio = mean > 0 ? input.amount / mean : 0;
    const ratioText = `×${ratio.toFixed(1)}`;
    if (ratio > 5) {
      findings.push({ code: "AMOUNT_RATIO", value: ratioText });
      risks.push(night ? 35 : 15);
    } else {
      findings.push({ code: "AMOUNT_NORMAL", value: ratioText });
      if (night) risks.push(8);
    }

    const account = input.payee?.accountNumber ?? null;
    const folded = fold(input.commandText);
    const known = history.some((tx) => {
      const recipient = fold(tx.recipient);
      return account ? recipient.includes(account) : recipient.length >= 3 && folded.includes(recipient);
    });
    findings.push({ code: known ? "KNOWN_RECIPIENT" : "NEW_RECIPIENT" });
    if (!known) risks.push(6);
  }

  const risk = noisyOr(risks);
  return { status: risk >= 40 ? "warn" : "pass", risk, findings };
}

// ----------------------------------- Bước 3: lừa đảo phi kỹ thuật & injection

const SCENARIO_RULES: readonly { id: ScamScenarioId; weight: number; pattern: RegExp }[] = [
  {
    id: "POLICE_VNEID",
    weight: 45,
    pattern: /(cong an|vneid|dinh danh dien tu|cap nhat dinh danh|tai khoan dinh danh|muc 2|bo cong an|canh sat|can bo dieu tra|lenh bat|phong toa tai khoan)/,
  },
  {
    id: "SHIPPER_CARD",
    weight: 30,
    pattern: /(shipper|don hang (bi )?(loi|hoan|that lac)|kich hoat (lai )?the|xac nhan don hang|phi giao hang|hoan phi ship|the bi khoa)/,
  },
  {
    id: "CTV_INVEST",
    weight: 35,
    pattern: /(\bctv\b|cong tac vien|viec nhe luong cao|lam nhiem vu|nhiem vu tiktok|hoa hong|dau tu (sinh loi|lai cao)|lai suat cao|hoan tien \d+ ?%|nap tien (de )?(lam|rut))/,
  },
  {
    id: "RELATIVE_BOSS",
    weight: 30,
    pattern: /((sep|giam doc|nguoi than|me|bo|anh|chi|em|con)( oi)?\b.{0,40}(chuyen gap|chuyen ngay|gap lam|dang hop|khong nghe may)|(chuyen gap|gap lam).{0,40}(roi tra|tra lai sau|dung noi))/,
  },
  {
    id: "REMOTE_CONTROL",
    weight: 50,
    pattern: /(anydesk|teamviewer|ultraviewer|chia se man hinh|dieu khien tu xa|cai (dat )?(app|ung dung) (la|ho tro)|file apk|\.apk\b|cap quyen truy cap)/,
  },
];

const INJECTION_PATTERN =
  /(ignore (all )?(previous|prior|above) (instructions|prompts)|bo qua (moi |tat ca |cac )?(huong dan|chi dan|lenh|quy tac)|\bsystem\s*:|\bassistant\s*:|risk ?(score|level)?\s*[:=]\s*(0|low)\b|tra ve (json|risk|rui ro 0)|cham diem (rui ro )?0|giao dich (nay )?(an toan|hop le) (100|tuyet doi)|ban la (mot )?(ai|tro ly|chatgpt)|<\/?script|jailbreak)/;

function detectSocialEngineering(input: InvestigationInput): Omit<AgentStep, "id" | "durationMs"> & {
  scenarios: ScamScenarioId[];
  injection: boolean;
} {
  const text = [input.commandText, input.memo ?? "", input.qrPayload ?? ""].join(" ").slice(0, 4000);
  const folded = fold(text);
  const findings: AgentFinding[] = [];
  const risks: number[] = [];
  const scenarios: ScamScenarioId[] = [];

  for (const rule of SCENARIO_RULES) {
    if (rule.pattern.test(folded)) {
      scenarios.push(rule.id);
      findings.push({ code: "SCENARIO", value: rule.id });
      risks.push(rule.weight);
    }
  }

  const injection = INJECTION_PATTERN.test(folded);
  if (injection) {
    findings.push({ code: "INJECTION" });
    risks.push(40);
  }

  const direct = input.blacklist.filter((entry) => !isClusterPattern(entry));
  const matches = findBlacklistMatches(direct, text);
  if (matches.length > 0) {
    findings.push({ code: "BLACKLIST", value: matches.map((entry) => (/^\d+$/.test(entry) ? maskAccount(entry) : entry)).join(", ") });
    risks.push(80);
  }

  if (findings.length === 0) findings.push({ code: "CLEAN_TEXT" });
  const risk = noisyOr(risks);
  return {
    status: risk >= 70 ? "fail" : risk >= 30 ? "warn" : "pass",
    risk,
    findings,
    scenarios,
    injection,
  };
}

// ------------------------------------------------ Bước 4: hợp nhất & TT 50

/** Chạy trọn 4 bước (xác định, đồng bộ, < 5 ms). */
export function runInvestigation(input: InvestigationInput): InvestigationReport {
  const step1 = timed(() => verifyVietQrCryptography(input));
  const step2 = timed(() => analyzeBehavioralVelocity(input));
  const step3 = timed(() => detectSocialEngineering(input));

  const step4 = timed(() => {
    const findings: AgentFinding[] = [];
    const ml = input.mlProbability ?? null;
    const mlRisk = ml === null ? 0 : Math.round(ml * 100 * 0.6);
    const fused = noisyOr([step1.result.risk, step2.result.risk, step3.result.risk, mlRisk]);
    const llmScore = input.llm ? clampScore(input.llm.score) : 0;
    // ADR-1: Agent chỉ được nâng — điểm cuối không bao giờ thấp hơn điểm của Lá chắn LLM.
    const finalScore = Math.max(llmScore, fused);
    const finalLevel = levelFromScore(finalScore);

    if (input.llm) findings.push({ code: "LLM_SCORE", value: `${llmScore}/100 · ${input.llm.engine}` });
    if (ml !== null) findings.push({ code: "ML_SCORE", value: `${Math.round(ml * 100)}%` });
    findings.push({ code: "FUSED_SCORE", value: `${finalScore}/100` });

    const policy = decideBiometric({
      parsedAmount: input.amount,
      riskLevel: finalLevel,
      dailyCumulativeBefore: input.dailyOutflowBefore,
    });
    // Ngưỡng lấy từ chính sách tập trung (TT 50 / QĐ 2345) — không định nghĩa lại ở đây.
    if (input.amount > BIOMETRIC_SINGLE_TXN_THRESHOLD_VND) findings.push({ code: "TT50_SINGLE" });
    if (input.dailyOutflowBefore + input.amount > BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND) {
      findings.push({ code: "TT50_DAILY" });
    }

    const mlHigh = ml !== null && ml >= COERCION_HIGH_THRESHOLD;
    const requireBiometric = policy.requireBiometric || mlHigh || finalLevel === "HIGH";
    const coolingOff = finalScore >= 70;
    if (requireBiometric) findings.push({ code: "POLICY_BIOMETRIC" });
    if (coolingOff) findings.push({ code: "POLICY_COOLING" });
    if (!requireBiometric && !coolingOff) findings.push({ code: "POLICY_ALLOW" });

    return {
      step: {
        status: (coolingOff ? "fail" : requireBiometric || finalLevel !== "LOW" ? "warn" : "pass") as AgentStepStatus,
        risk: finalScore,
        findings,
      },
      finalScore,
      finalLevel,
      requireBiometric,
      coolingOff,
    };
  });

  const steps: AgentStep[] = [
    { id: "verify_vietqr_cryptography", ...step1.result, durationMs: step1.ms },
    { id: "analyze_behavioral_velocity", ...step2.result, durationMs: step2.ms },
    {
      id: "detect_social_engineering_and_injection",
      status: step3.result.status,
      risk: step3.result.risk,
      findings: step3.result.findings,
      durationMs: step3.ms,
    },
    { id: "enforce_tt50_security_policy", ...step4.result.step, durationMs: step4.ms },
  ];

  const mlProbability = input.mlProbability ?? null;
  return {
    sources: [
      { id: "qr", risk: step1.result.risk },
      { id: "velocity", risk: step2.result.risk },
      { id: "social", risk: step3.result.risk },
      { id: "ml", risk: mlProbability === null ? 0 : Math.round(mlProbability * 100 * 0.6) },
    ],
    steps,
    finalScore: step4.result.finalScore,
    finalLevel: step4.result.finalLevel,
    requireBiometric: step4.result.requireBiometric,
    coolingOff: step4.result.coolingOff,
    guardianRequired: step4.result.coolingOff,
    scenarios: step3.result.scenarios,
    injectionDetected: step3.result.injection,
    engine: input.llm ? "LLM_FUSED" : "OFFLINE_AGENT",
  };
}

export interface SourceAttribution {
  id: RiskSourceId;
  risk: number;
  /** Tỷ trọng đóng góp (%) vào điểm hợp nhất, Σ = 100 khi có rủi ro. */
  sharePct: number;
}

/**
 * Phân rã chính xác điểm noisy-OR: −ln(1 − p) = Σ −ln(1 − rᵢ) (cộng tính trong không gian
 * log-survival) ⇒ tỷ trọng nguồn i = −ln(1 − rᵢ) / Σⱼ −ln(1 − rⱼ).
 */
export function decomposeAgentRisk(sources: readonly RiskSource[]): SourceAttribution[] {
  const terms = sources.map((source) => ({
    id: source.id,
    risk: source.risk,
    term: -Math.log(1 - Math.min(99, Math.max(0, source.risk)) / 100),
  }));
  const total = terms.reduce((sum, item) => sum + item.term, 0);
  return terms
    .map((item) => ({
      id: item.id,
      risk: item.risk,
      sharePct: total > 0 ? Math.round((item.term / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.sharePct - a.sharePct);
}

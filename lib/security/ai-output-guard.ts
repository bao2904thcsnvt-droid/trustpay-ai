import type {
  BudgetAlert,
  CategoryName,
  FintechOpsTicket,
  RiskLevel,
  ScamReport,
  TransactionAnalysisResponse,
} from "@/types/trustpay";

/**
 * Lớp phòng thủ cho đầu ra của mô hình AI (Bedrock/Claude) trong TrustPay AI.
 *
 * Nguyên tắc (ADR-1, REQ-A3.8): "AI đề xuất, bộ luật quyết định các bất biến an
 * toàn". Đầu ra LLM được coi là dữ liệu không tin cậy; nó chỉ được phép làm giàu
 * kết quả, KHÔNG được hạ mức rủi ro xuống dưới mức bộ luật (baseline) đã tính.
 * Đây là tuyến chính chống Prompt Injection nhắm vào điểm rủi ro.
 */

const RANK: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const CATEGORIES: readonly CategoryName[] = ["Ăn uống", "Mua sắm", "Di chuyển", "Khác"];

export function clampRiskScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) {
    return "HIGH";
  }
  if (score >= 40) {
    return "MEDIUM";
  }
  return "LOW";
}

function asRiskLevel(value: unknown): RiskLevel | undefined {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" ? value : undefined;
}

function highestRank(...levels: Array<RiskLevel | undefined>): RiskLevel {
  let best: RiskLevel = "LOW";
  for (const level of levels) {
    if (level && RANK[level] > RANK[best]) {
      best = level;
    }
  }
  return best;
}

function floorScoreToLevel(score: number, level: RiskLevel): number {
  if (level === "HIGH") {
    return Math.max(score, 70);
  }
  if (level === "MEDIUM") {
    return Math.max(score, 40);
  }
  return score;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)));
}

function isCategory(value: unknown): value is CategoryName {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

function isBudgetAlert(value: unknown): value is BudgetAlert {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.isExceeded === "boolean" &&
    typeof v.remainingAfter === "number" &&
    typeof v.message === "string" &&
    typeof v.suggestion === "string"
  );
}

function isFintechOpsTicket(value: unknown): value is FintechOpsTicket {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.ticketId === "string" &&
    typeof v.timestamp === "string" &&
    typeof v.recipient === "string" &&
    typeof v.amount === "number" &&
    (v.status === "PENDING" || v.status === "BLOCKED" || v.status === "APPROVED")
  );
}

/**
 * Áp "sàn rủi ro": kết hợp báo cáo rủi ro của AI với baseline của bộ luật sao
 * cho mức rủi ro cuối cùng không bao giờ thấp hơn baseline.
 */
export function enforceRiskFloor(
  aiReport: Partial<ScamReport> | undefined,
  baseline: ScamReport,
): ScamReport {
  const aiScore =
    typeof aiReport?.riskScore === "number" ? clampRiskScore(aiReport.riskScore) : 0;

  const claimedLevel = highestRank(asRiskLevel(aiReport?.riskLevel), baseline.riskLevel);
  const finalScore = clampRiskScore(
    floorScoreToLevel(Math.max(aiScore, baseline.riskScore), claimedLevel),
  );
  const finalLevel = highestRank(riskLevelFromScore(finalScore), claimedLevel);

  const rawFlags: unknown = aiReport?.redFlags;
  const aiFlags: string[] = Array.isArray(rawFlags)
    ? rawFlags.filter((f): f is string => typeof f === "string")
    : [];
  const mergedFlags = dedupe([...baseline.redFlags, ...aiFlags]);

  return {
    riskLevel: finalLevel,
    riskScore: finalScore,
    scamType:
      typeof aiReport?.scamType === "string" && aiReport.scamType.trim().length > 0
        ? aiReport.scamType
        : baseline.scamType,
    redFlags: mergedFlags.length > 0 ? mergedFlags : baseline.redFlags,
    explanation:
      typeof aiReport?.explanation === "string" && aiReport.explanation.trim().length > 0
        ? aiReport.explanation
        : baseline.explanation,
  };
}

/**
 * Trộn an toàn đầu ra AI với baseline: điền khuyết bằng baseline, áp sàn rủi ro,
 * và không cho phép AI tắt yêu cầu sinh trắc học mà baseline đã bật.
 */
export function safeMergeAnalysis(
  ai: Partial<TransactionAnalysisResponse> | null | undefined,
  baseline: TransactionAnalysisResponse,
): TransactionAnalysisResponse {
  const a = ai ?? {};
  const scamReport = enforceRiskFloor(a.scamReport, baseline.scamReport);
  const requireBiometric = baseline.requireBiometric || scamReport.riskLevel === "HIGH";

  return {
    parsedAmount:
      typeof a.parsedAmount === "number" && Number.isFinite(a.parsedAmount)
        ? a.parsedAmount
        : baseline.parsedAmount,
    recipient:
      typeof a.recipient === "string" && a.recipient.trim().length > 0
        ? a.recipient
        : baseline.recipient,
    category: isCategory(a.category) ? a.category : baseline.category,
    budgetAlert: isBudgetAlert(a.budgetAlert) ? a.budgetAlert : baseline.budgetAlert,
    scamReport,
    requireBiometric,
    fintechOpsTicket: isFintechOpsTicket(a.fintechOpsTicket)
      ? a.fintechOpsTicket
      : baseline.fintechOpsTicket,
  };
}

/**
 * Trích đối tượng JSON đầu tiên cân bằng ngoặc từ văn bản LLM (bỏ qua chữ thừa,
 * tôn trọng chuỗi và ký tự thoát). Trả về null nếu không tìm thấy.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/** Phân tích an toàn một đoạn JSON đầu ra LLM thành Partial response. */
export function parseAiAnalysis(text: string): Partial<TransactionAnalysisResponse> | null {
  const json = extractFirstJsonObject(text);
  if (json === null) {
    return null;
  }
  try {
    return JSON.parse(json) as Partial<TransactionAnalysisResponse>;
  } catch {
    return null;
  }
}

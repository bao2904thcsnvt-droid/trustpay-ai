import type { AppLanguage, TransactionAnalysisResponse } from "@/types/trustpay";

/**
 * Active Call Shield — phát hiện chuyển tiền "trong lúc đang nghe điện thoại".
 *
 * Kịch bản lừa đảo phổ biến nhất tại Việt Nam (vishing): kẻ gian giữ máy, tạo
 * áp lực và đọc từng bước cho nạn nhân chuyển tiền. Ở Production, phụ đề trực
 * tiếp đến từ Amazon Transcribe Streaming (âm thanh KHÔNG được lưu, chỉ phân
 * tích từ khóa trong RAM — NĐ 13/2023). Bản demo phát lại một kịch bản phụ đề
 * mẫu theo thời gian để mô phỏng luồng streaming.
 *
 * Quy tắc an toàn (ADR-1): Call Shield chỉ được NÂNG rủi ro, không bao giờ hạ.
 */

/** Số gọi đến đã che (không hiển thị số đầy đủ). */
export const CALL_SHIELD_CALLER = "+84 9xx xxx 247";

/** Nhịp hiển thị mỗi dòng phụ đề (ms) — mô phỏng Transcribe streaming. */
export const CALL_CAPTION_INTERVAL_MS = 2600;

/** Sàn điểm rủi ro khi chuyển tiền trong lúc nghe cuộc gọi lạ (≥ ngưỡng tạm giữ 70). */
export const CALL_SHIELD_RISK_FLOOR = 82;

export type CallKeywordId = "authority" | "money-laundering" | "freeze" | "urgent" | "safe-account" | "secrecy" | "otp";

interface CallKeywordRule {
  id: CallKeywordId;
  weight: number;
  phrases: Record<AppLanguage, readonly string[]>;
}

export const CALL_KEYWORD_RULES: readonly CallKeywordRule[] = [
  { id: "authority", weight: 20, phrases: { vi: ["cán bộ điều tra", "công an"], en: ["investigator", "police"] } },
  { id: "money-laundering", weight: 10, phrases: { vi: ["rửa tiền"], en: ["money-laundering", "money laundering"] } },
  { id: "freeze", weight: 15, phrases: { vi: ["phong tỏa", "khóa tài khoản"], en: ["frozen", "freeze"] } },
  { id: "urgent", weight: 20, phrases: { vi: ["chuyển gấp", "30 phút", "ngay lập tức"], en: ["urgently", "30 minutes", "immediately"] } },
  { id: "safe-account", weight: 25, phrases: { vi: ["tài khoản an toàn"], en: ["safe account"] } },
  { id: "secrecy", weight: 15, phrases: { vi: ["giữ bí mật", "không được tắt máy"], en: ["strictly secret", "do not hang up"] } },
  { id: "otp", weight: 25, phrases: { vi: ["mã otp"], en: ["otp code"] } },
];

/** Điểm nền cho cuộc gọi từ số lạ (chưa có trong danh bạ). */
export const UNKNOWN_CALLER_BASE_SCORE = 20;

export interface CallTranscriptLine {
  speaker: "caller" | "user";
  text: Record<AppLanguage, string>;
}

export const CALL_SCRIPT: readonly CallTranscriptLine[] = [
  {
    speaker: "caller",
    text: {
      vi: "Alo, tôi là cán bộ điều tra công an quận, gọi về một vụ án rửa tiền.",
      en: "Hello, I'm a district police investigator calling about a money laundering case.",
    },
  },
  { speaker: "user", text: { vi: "Dạ… vụ án gì ạ?", en: "Sorry… what case?" } },
  {
    speaker: "caller",
    text: {
      vi: "Tài khoản của anh chị liên quan đường dây và sẽ bị phong tỏa trong 30 phút.",
      en: "Your account is linked to the ring and will be frozen within 30 minutes.",
    },
  },
  {
    speaker: "caller",
    text: {
      vi: "Anh chị phải chuyển gấp toàn bộ số dư sang tài khoản an toàn để xác minh.",
      en: "You must urgently move your whole balance to a safe account for verification.",
    },
  },
  {
    speaker: "caller",
    text: {
      vi: "Yêu cầu giữ bí mật, không được tắt máy và không báo cho người nhà.",
      en: "Keep this strictly secret, do not hang up and do not tell your family.",
    },
  },
  {
    speaker: "caller",
    text: {
      vi: "Sau khi chuyển, đọc cho tôi mã OTP vừa gửi về máy để hoàn tất hồ sơ.",
      en: "After the transfer, read me the OTP code just sent to your phone to close the file.",
    },
  },
];

export interface KeywordHit {
  id: CallKeywordId;
  phrase: string;
}

/** Tìm cụm từ khóa thúc ép trong một dòng phụ đề (không phân biệt hoa thường). */
export function detectCallKeywords(text: string, lang: AppLanguage): KeywordHit[] {
  const lower = text.toLowerCase();
  const hits: KeywordHit[] = [];
  for (const rule of CALL_KEYWORD_RULES) {
    for (const phrase of rule.phrases[lang]) {
      if (lower.includes(phrase)) {
        hits.push({ id: rule.id, phrase });
      }
    }
  }
  return hits;
}

/** Số dòng phụ đề đã "nghe được" sau `elapsedMs` kể từ lúc bắt máy. */
export function captionsRevealed(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 0;
  }
  return Math.min(CALL_SCRIPT.length, 1 + Math.floor(elapsedMs / CALL_CAPTION_INTERVAL_MS));
}

export interface CallRiskAssessment {
  score: number;
  keywordIds: CallKeywordId[];
}

/** Điểm nghi vấn của cuộc gọi dựa trên các dòng phụ đề đã nghe (xác định). */
export function assessCallRisk(revealedLines: number, lang: AppLanguage = "vi"): CallRiskAssessment {
  const ids = new Set<CallKeywordId>();
  for (const line of CALL_SCRIPT.slice(0, Math.max(0, revealedLines))) {
    for (const hit of detectCallKeywords(line.text[lang], lang)) {
      ids.add(hit.id);
    }
  }
  const keywordIds = CALL_KEYWORD_RULES.map((rule) => rule.id).filter((id) => ids.has(id));
  const score = Math.min(
    100,
    UNKNOWN_CALLER_BASE_SCORE +
      CALL_KEYWORD_RULES.filter((rule) => ids.has(rule.id)).reduce((sum, rule) => sum + rule.weight, 0),
  );
  return { score, keywordIds };
}

/** Chuỗi dữ liệu lưu bằng tiếng Việt (lớp hiển thị dịch qua `translateDataText`). */
export const CALL_DATA_TEXT = {
  scamType: "Nghi lừa đảo qua cuộc gọi điện thoại (vishing) đang diễn ra",
  redFlag:
    "Lệnh chuyển tiền được tạo trong lúc đang nghe cuộc gọi từ số lạ — Amazon Transcribe phát hiện từ khóa thúc ép chuyển tiền",
  explanation:
    "Bạn đang nghe cuộc gọi từ số lạ có dấu hiệu thúc ép chuyển tiền. TrustPay AI tạm giữ giao dịch 15 giây và cần Người giám hộ xác nhận trước khi tiền rời ví.",
  ticketSegment: "Active Call Shield: giao dịch phát sinh khi khách hàng đang nghe cuộc gọi từ số lạ",
  recommendedAction:
    "Tạm giữ giao dịch, yêu cầu Người giám hộ xác nhận, xác thực sinh trắc học và gọi lại khách hàng qua số đã đăng ký.",
} as const;

const NO_SCAM_FLAG = "Không phát hiện từ khóa lừa đảo hoặc tài khoản Blacklist";

export interface CallShieldContext {
  keywordIds: readonly CallKeywordId[];
}

/**
 * Nâng rủi ro cho giao dịch tạo ra trong lúc cuộc gọi lạ đang diễn ra:
 * riskScore ≥ sàn 82 (vượt ngưỡng tạm giữ 70), riskLevel HIGH, bật sinh trắc học.
 * Giữ nguyên cấu trúc `TransactionAnalysisResponse` (hợp đồng API không đổi).
 */
export function applyCallShieldUplift(
  analysis: TransactionAnalysisResponse,
  context: CallShieldContext,
): TransactionAnalysisResponse {
  const original = analysis.scamReport;
  const floor = Math.min(97, CALL_SHIELD_RISK_FLOOR + context.keywordIds.length * 2);
  const riskScore = Math.max(original.riskScore, floor);
  const wasLow = original.riskLevel === "LOW";
  const redFlags = [
    CALL_DATA_TEXT.redFlag,
    ...original.redFlags.filter((flag) => flag !== NO_SCAM_FLAG && flag !== CALL_DATA_TEXT.redFlag),
  ];
  const summary = analysis.fintechOpsTicket.summary.includes(CALL_DATA_TEXT.ticketSegment)
    ? analysis.fintechOpsTicket.summary
    : `${analysis.fintechOpsTicket.summary} | ${CALL_DATA_TEXT.ticketSegment}`;

  return {
    ...analysis,
    requireBiometric: true,
    scamReport: {
      ...original,
      riskLevel: "HIGH",
      riskScore,
      scamType: wasLow ? CALL_DATA_TEXT.scamType : original.scamType,
      explanation: wasLow ? CALL_DATA_TEXT.explanation : original.explanation,
      redFlags,
    },
    fintechOpsTicket: {
      ...analysis.fintechOpsTicket,
      riskLevel: "HIGH",
      riskScore,
      summary,
      recommendedAction: CALL_DATA_TEXT.recommendedAction,
    },
  };
}

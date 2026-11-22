import type {
  AppLanguage,
  CategoryName,
  TransactionAnalysisResponse,
  TrustedGuardian,
} from "@/types/trustpay";
import { formatClock, formatDateTime, formatMoney } from "@/lib/wallet/format";
import { maskPhoneForDisplay, maskRecipientForDisplay } from "@/lib/security/pii-display";
import { translateCategory, translateDataText } from "@/lib/i18n/server-text";

/**
 * Cơ chế Hạ nhiệt tâm lý 15 giây & Phê duyệt từ Người giám hộ (Human-Centered).
 * Tóm tắt gửi Người giám hộ được dựng ĐỘNG từ lý do rủi ro của chính giao dịch
 * đang bị tạm giữ (scamType, redFlags, explanation của Lá chắn AI).
 */

export const COOLING_OFF_SECONDS = 15;
export const COOLING_OFF_MS = COOLING_OFF_SECONDS * 1000;

/** Ngưỡng điểm rủi ro kích hoạt tạm giữ FROZEN + Hạ nhiệt (khớp mức HIGH). */
export const HIGH_RISK_HOLD_SCORE = 70;

/** Thời gian mô phỏng gửi cảnh báo tới điện thoại Người giám hộ. */
export const GUARDIAN_DELIVERY_MS = 1400;

export interface GuardianAlertSummary {
  headline: string;
  summary: string;
  highlights: string[];
  advice: string;
}

function isPlaceholderFlag(flag: string): boolean {
  return flag.startsWith("Không phát hiện");
}

function scenarioAdvice(analysis: TransactionAnalysisResponse, lang: AppLanguage): string {
  const haystack = `${analysis.scamReport.scamType} ${analysis.scamReport.redFlags.join(" ")}`.toLowerCase();
  const isAuthority = /công an|điều tra|cơ quan chức năng|mạo danh/.test(haystack);
  const isPrize = /thưởng|quà|hải quan|phí nhận/.test(haystack);
  const isBlacklist = haystack.includes("blacklist") || haystack.includes("danh sách đen");

  if (lang === "en") {
    if (isAuthority) {
      return "Police never ask people to transfer money over the phone to \"verify an account\". Call your relative right now.";
    }
    if (isPrize) {
      return "No legitimate prize program charges a fee upfront. Ask your relative to stop and call you.";
    }
    if (isBlacklist) {
      return "The recipient account has already been reported for fraud. Please block this transfer.";
    }
    return "Call your relative directly to confirm before you decide.";
  }

  if (isAuthority) {
    return "Công an không bao giờ yêu cầu chuyển tiền qua điện thoại để \"xác minh tài khoản\". Hãy gọi ngay cho người thân.";
  }
  if (isPrize) {
    return "Không chương trình trúng thưởng hợp pháp nào bắt nộp phí trước để nhận quà. Hãy yêu cầu người thân dừng lại.";
  }
  if (isBlacklist) {
    return "STK người nhận đã bị báo cáo lừa đảo trên hệ thống. Bạn nên chặn giao dịch này.";
  }
  return "Hãy gọi trực tiếp cho người thân để xác nhận trước khi quyết định.";
}

/** Dựng tóm tắt AI hiển thị trên điện thoại Người giám hộ. */
export function buildGuardianAlertSummary(input: {
  analysis: TransactionAnalysisResponse;
  ownerName: string;
  lang: AppLanguage;
}): GuardianAlertSummary {
  const { analysis, ownerName, lang } = input;
  const report = analysis.scamReport;
  const amount = formatMoney(analysis.parsedAmount, lang);
  const recipient = maskRecipientForDisplay(translateDataText(analysis.recipient, lang));
  const scamType = translateDataText(report.scamType, lang);
  const highlights = report.redFlags
    .filter((flag) => !isPlaceholderFlag(flag))
    .slice(0, 3)
    .map((flag) => maskRecipientForDisplay(translateDataText(flag, lang)));

  if (lang === "en") {
    return {
      headline: `${ownerName} is about to send ${amount} to "${recipient}"`,
      summary: `TrustPay AI froze this transfer (FROZEN). AI Shield risk score ${report.riskScore}/100 — pattern "${scamType}". The wallet owner is in a 15-second cool-off and asked you to review it.`,
      highlights,
      advice: scenarioAdvice(analysis, lang),
    };
  }

  return {
    headline: `${ownerName} sắp chuyển ${amount} tới "${recipient}"`,
    summary: `Lá chắn AI đã tạm giữ (FROZEN) giao dịch này. Điểm rủi ro ${report.riskScore}/100 — kịch bản "${scamType}". Chủ ví đang trong 15 giây Hạ nhiệt và nhờ bạn duyệt giúp.`,
    highlights,
    advice: scenarioAdvice(analysis, lang),
  };
}

export interface ProtectionReportInput {
  lang: AppLanguage;
  reportId: string;
  createdAtIso: string;
  ownerName: string;
  guardian: TrustedGuardian;
  analysis: TransactionAnalysisResponse;
  category: CategoryName;
  balanceAfter: number;
  ticketId: string;
  frozenAtMs: number;
  guardianSentAtMs: number | null;
  decidedAtMs: number;
  commandHash: string | null;
  pipelineLine: string;
}

/** Biên bản bảo vệ giao dịch (.txt) — PII đã che, không chứa văn bản lệnh thô. */
export function buildProtectionReport(input: ProtectionReportInput): string {
  const { lang, analysis } = input;
  const money = (value: number) => formatMoney(value, lang);
  const report = analysis.scamReport;
  const recipient = maskRecipientForDisplay(translateDataText(analysis.recipient, lang));
  const flags = report.redFlags.map(
    (flag, index) => `  ${index + 1}. ${maskRecipientForDisplay(translateDataText(flag, lang))}`,
  );
  const guardianLine = `${input.guardian.name} (${maskPhoneForDisplay(input.guardian.phone)})`;
  const divider = "=".repeat(64);
  const hash = input.commandHash ?? (lang === "en" ? "unavailable in this browser" : "không khả dụng trên trình duyệt này");

  if (lang === "en") {
    return [
      "TRANSACTION PROTECTION REPORT — TRUSTPAY AI",
      divider,
      `Report ID        : ${input.reportId}`,
      `Created at       : ${formatDateTime(input.createdAtIso, "en")} (GMT+7)`,
      `Wallet owner     : ${input.ownerName}`,
      `Trusted guardian : ${guardianLine}`,
      "",
      "I. BLOCKED TRANSACTION",
      `- Amount         : ${money(analysis.parsedAmount)}`,
      `- Recipient      : ${recipient}`,
      `- Category       : ${translateCategory(input.category, "en")}`,
      `- Order hash     : SHA-256 ${hash}`,
      "                   (raw command text is not stored — Decree 13/2023/ND-CP)",
      "",
      "II. AI SHIELD FINDINGS",
      `- Risk level     : ${report.riskLevel} (${report.riskScore}/100)`,
      `- Scam pattern   : ${translateDataText(report.scamType, "en")}`,
      "- Red flags      :",
      ...flags,
      `- AI assessment  : ${translateDataText(report.explanation, "en")}`,
      "",
      "III. TIMELINE (GMT+7)",
      `- ${formatClock(input.frozenAtMs, true)}  Transaction FROZEN, 15-second psychological cool-off started`,
      ...(input.guardianSentAtMs !== null
        ? [`- ${formatClock(input.guardianSentAtMs, true)}  Alert sent to the trusted guardian`]
        : []),
      `- ${formatClock(input.decidedAtMs, true)}  Guardian chose "Block & cancel transaction now"`,
      "",
      "IV. OUTCOME",
      `- Transaction CANCELLED — wallet balance unchanged: ${money(input.balanceAfter)}`,
      `- Ticket escalated to Fintech Ops: ${input.ticketId}`,
      `- Processing pipeline: ${input.pipelineLine}`,
      "",
      "V. LEGAL BASIS",
      "- Circular 50/2024/TT-NHNN and Decision 2345/QĐ-NHNN (State Bank of Vietnam)",
      "- Decree 13/2023/ND-CP: account/phone numbers are masked; no face images are stored.",
      "",
      "Advice: never transfer money to \"verify an account\" or to pay a prize fee. Report the scam via the TrustPay hotline.",
    ].join("\n");
  }

  return [
    "BIÊN BẢN BẢO VỆ GIAO DỊCH — TRUSTPAY AI",
    divider,
    `Mã biên bản      : ${input.reportId}`,
    `Thời điểm lập    : ${formatDateTime(input.createdAtIso, "vi")} (GMT+7)`,
    `Chủ ví           : ${input.ownerName}`,
    `Người giám hộ    : ${guardianLine}`,
    "",
    "I. THÔNG TIN GIAO DỊCH BỊ CHẶN",
    `- Số tiền        : ${money(analysis.parsedAmount)}`,
    `- Người nhận     : ${recipient}`,
    `- Danh mục       : ${input.category}`,
    `- Mã băm lệnh    : SHA-256 ${hash}`,
    "                   (không lưu văn bản lệnh thô — Nghị định 13/2023/NĐ-CP)",
    "",
    "II. KẾT QUẢ LÁ CHẮN AI",
    `- Mức rủi ro     : ${report.riskLevel} (${report.riskScore}/100)`,
    `- Kịch bản       : ${report.scamType}`,
    "- Dấu hiệu       :",
    ...flags,
    `- Nhận định AI   : ${report.explanation}`,
    "",
    "III. DIỄN BIẾN XỬ LÝ (GMT+7)",
    `- ${formatClock(input.frozenAtMs, true)}  Tạm giữ giao dịch (FROZEN), kích hoạt Hạ nhiệt tâm lý 15 giây`,
    ...(input.guardianSentAtMs !== null
      ? [`- ${formatClock(input.guardianSentAtMs, true)}  Gửi cảnh báo tới Người giám hộ tin cậy`]
      : []),
    `- ${formatClock(input.decidedAtMs, true)}  Người giám hộ chọn "Chặn & Hủy giao dịch ngay"`,
    "",
    "IV. KẾT QUẢ",
    `- Giao dịch đã bị HỦY — số dư ví giữ nguyên: ${money(input.balanceAfter)}`,
    `- Ticket đã đẩy sang Fintech Ops: ${input.ticketId}`,
    `- Luồng xử lý: ${input.pipelineLine}`,
    "",
    "V. CĂN CỨ",
    "- Thông tư 50/2024/TT-NHNN và Quyết định 2345/QĐ-NHNN",
    "- Nghị định 13/2023/NĐ-CP: STK/SĐT đã được che; không lưu ảnh khuôn mặt.",
    "",
    "Khuyến nghị: tuyệt đối không chuyển tiền để \"xác minh tài khoản\" hay nộp phí nhận thưởng. Báo cáo lừa đảo qua tổng đài TrustPay.",
  ].join("\n");
}

/** Ghi chú gắn vào ticket Ops khi Người giám hộ chặn giao dịch. */
export function guardianBlockedTicketNote(guardianName: string, decidedAtMs: number): string {
  return `Người giám hộ ${guardianName} đã chặn & hủy giao dịch lúc ${formatClock(decidedAtMs)} — đề nghị Ops xác minh và đưa người nhận vào Blacklist.`;
}

/** Ghi chú gắn vào ticket Ops khi Người giám hộ cho phép chuyển. */
export function guardianApprovedTicketNote(guardianName: string, decidedAtMs: number): string {
  return `Người giám hộ ${guardianName} đã xác nhận an toàn lúc ${formatClock(decidedAtMs)} — giao dịch đã thực hiện, đề nghị Ops hậu kiểm.`;
}

/** Nối ghi chú mới vào tóm tắt ticket (bỏ ghi chú Người giám hộ cũ nếu có). */
export function appendTicketNote(summary: string, note: string): string {
  const base = summary
    .split(" | ")
    .filter((segment) => !segment.startsWith("Người giám hộ "))
    .join(" | ");
  return `${base} | ${note}`;
}

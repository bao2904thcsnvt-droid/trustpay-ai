/**
 * Bộ máy heuristic (Offline Fallback) rút gọn cho Lambda Production của TrustPay
 * AI. Tái sử dụng hợp đồng kiểu từ `@/types/trustpay` và các tiện ích bảo mật
 * dùng chung (`@/lib/...`) để giữ một nguồn sự thật duy nhất.
 *
 * Đây là bản port tham chiếu; engine đầy đủ hiện nằm trong `app/api/analyze`.
 * Lộ trình T-3.x sẽ trích engine chung ra `lib/` để cả Next.js và Lambda dùng.
 */

import type {
  BudgetCategory,
  CategoryName,
  RiskLevel,
  TransactionAnalysisRequest,
  TransactionAnalysisResponse,
} from "@/types/trustpay";
import { clampRiskScore, riskLevelFromScore } from "@/lib/security/ai-output-guard";
import { maskPiiInText } from "@/lib/security/pii-masking";

const DEFAULT_BUDGETS: BudgetCategory[] = [
  { id: "b1", name: "Ăn uống", limit: 3_000_000, spent: 1_200_000 },
  { id: "b2", name: "Mua sắm", limit: 4_000_000, spent: 2_500_000 },
  { id: "b3", name: "Di chuyển", limit: 1_000_000, spent: 400_000 },
  { id: "b4", name: "Khác", limit: 2_000_000, spent: 500_000 },
];

const DEFAULT_BLACKLIST = ["999988887777", "1903888999", "Cán bộ điều tra"];

function parseAmount(text: string): number {
  const million = text.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(?:triệu|tr\b|củ)/i);
  if (million) {
    return Math.round(parseFloat(million[1].replace(",", ".")) * 1_000_000);
  }
  const formatted = text.match(/\b\d{1,3}(?:[.,]\d{3})+\b/g);
  if (formatted && formatted.length > 0) {
    return parseInt(formatted[0].replace(/[.,]/g, ""), 10);
  }
  const plain = text.match(/\b\d{4,9}\b/);
  return plain ? parseInt(plain[0], 10) : 0;
}

function detectCategory(text: string): CategoryName {
  const t = text.toLowerCase();
  if (/bún|phở|cơm|ăn|uống|cafe|cà phê|quán|nhà hàng|food/.test(t)) return "Ăn uống";
  if (/mua|giày|áo|quần|shop|điện thoại|laptop|siêu thị/.test(t)) return "Mua sắm";
  if (/xe|grab|taxi|xăng|vé|tàu|máy bay|di chuyển/.test(t)) return "Di chuyển";
  return "Khác";
}

export function buildBaseline(
  req: TransactionAnalysisRequest,
  ocrText = "",
): TransactionAnalysisResponse {
  const fullText = `${req.commandText ?? ""} ${ocrText}`.trim();
  const lower = fullText.toLowerCase();
  const budgets = req.currentBudgets?.length ? req.currentBudgets : DEFAULT_BUDGETS;
  const blacklist = req.blacklist?.length ? req.blacklist : DEFAULT_BLACKLIST;

  const amount = parseAmount(fullText);
  const category = detectCategory(fullText);
  const budget = budgets.find((b) => b.name === category) ?? budgets[budgets.length - 1];
  const remainingAfter = budget.limit - budget.spent - amount;
  const isExceeded = remainingAfter < 0;

  const redFlags: string[] = [];
  let score = 10;

  const matchedBlacklist = blacklist.filter((i) => i && lower.includes(i.toLowerCase()));
  if (matchedBlacklist.length > 0) {
    score += 50;
    redFlags.push("Người nhận nằm trong danh sách đen (Blacklist)");
  }
  const authority = /công an|cán bộ|điều tra|viện kiểm sát|xác minh tài khoản|lệnh bắt/.test(lower);
  if (authority) {
    score += 45;
    redFlags.push("Dấu hiệu mạo danh cơ quan chức năng");
  }
  const prize = /nhận thưởng|trúng thưởng|phí nhận|phí hải quan|nhận quà|iphone 16|quà quốc tế/.test(lower);
  if (prize) {
    score += 78;
    redFlags.push("Yêu cầu nộp phí để nhận thưởng/quà giá trị cao");
  }
  if (/chuyển gấp|khẩn cấp|ngay lập tức|nâng cấp sim|nhiệm vụ tiktok|hoa hồng/.test(lower)) {
    score += 15;
    redFlags.push("Tạo áp lực tâm lý khẩn cấp");
  }

  if (authority && matchedBlacklist.length > 0) {
    score = 95;
  } else if (prize && matchedBlacklist.length === 0) {
    score = 88;
  } else if (matchedBlacklist.length > 0 && score < 85) {
    score = 90;
  }
  score = clampRiskScore(score);

  const riskLevel: RiskLevel = riskLevelFromScore(score);
  if (redFlags.length === 0) {
    redFlags.push("Không phát hiện từ khóa lừa đảo hoặc tài khoản Blacklist");
  }

  const recipient = maskPiiInText(matchedBlacklist[0] ?? "Người nhận chưa xác định");
  const now = new Date();
  const ticketId = `TCK-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(
    Math.floor(100 + Math.random() * 900),
  )}`;

  return {
    parsedAmount: amount,
    recipient,
    category,
    budgetAlert: {
      isExceeded,
      remainingAfter,
      message: isExceeded
        ? `Giao dịch vượt hạn mức danh mục '${category}'.`
        : `Chi tiêu trong hạn mức danh mục '${category}'.`,
      suggestion: isExceeded
        ? "Hãy trì hoãn hoặc điều chỉnh hạn mức."
        : "Ngân sách đang ở trạng thái an toàn.",
    },
    scamReport: {
      riskLevel,
      riskScore: score,
      scamType:
        riskLevel === "HIGH"
          ? authority
            ? "Lừa đảo mạo danh cơ quan chức năng"
            : "Lừa đảo nộp phí nhận thưởng/quà"
          : "Giao dịch tiêu dùng thông thường",
      redFlags,
      explanation:
        riskLevel === "HIGH"
          ? `Hệ thống phát hiện rủi ro CAO (${score}/100). Không chuyển tiền để 'xác minh' hay 'nhận thưởng'.`
          : `Giao dịch danh mục '${category}' không có dấu hiệu lừa đảo rõ ràng.`,
    },
    requireBiometric: riskLevel === "HIGH",
    fintechOpsTicket: {
      ticketId,
      timestamp: now.toISOString(),
      recipient,
      amount,
      riskLevel,
      riskScore: score,
      summary: `Giao dịch ${amount} VNĐ tới "${recipient}" — mức rủi ro ${riskLevel}.`,
      recommendedAction:
        riskLevel === "HIGH"
          ? "Tạm khóa, yêu cầu xác thực sinh trắc học, đẩy cảnh báo Ops."
          : "Cho phép giao dịch bình thường.",
      status: riskLevel === "HIGH" ? "PENDING" : "APPROVED",
    },
  };
}

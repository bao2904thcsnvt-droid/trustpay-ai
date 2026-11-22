import type { BudgetCategory, CategoryName, RecurringSubscription } from "@/types/trustpay";

/**
 * AI Payment Copilot — hiểu yêu cầu tiếng Việt/tiếng Anh tự nhiên và chuyển
 * thành hành động trên Ví (điền sẵn lệnh chuyển, tra hạn mức thật, mở đúng trợ
 * lý). Bộ hiểu ý định chạy cục bộ, xác định và không gửi dữ liệu ra ngoài; lệnh
 * chuyển tiền sau đó vẫn đi qua Lá chắn AI (Bedrock + bộ luật) như bình thường.
 */

export type CopilotIntent =
  | {
      kind: "transfer";
      amount: number | null;
      recipient: string | null;
      category: CategoryName;
      /** Câu lệnh tiếng Việt chuẩn hóa để điền vào form chuyển tiền. */
      commandText: string | null;
    }
  | { kind: "budget"; category: CategoryName | null }
  | { kind: "subscriptions" }
  | { kind: "qr" }
  | { kind: "call-shield" }
  | { kind: "unknown" };

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Đọc số tiền: "250.000đ", "250,000 VND", "250k", "250 nghìn", "1,5tr", "2 triệu", "250000". */
export function parseAmountPhrase(text: string): number | null {
  const folded = fold(text);

  const million = folded.match(/(\d+(?:[.,]\d+)?)\s*(?:trieu|tr\b|cu\b|million|m\b)/);
  if (million) {
    const value = Number(million[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0) return Math.round(value * 1_000_000);
  }

  const thousand = folded.match(/(\d+(?:[.,]\d+)?)\s*(?:nghin|ngan|k\b|thousand)/);
  if (thousand) {
    const value = Number(thousand[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0) return Math.round(value * 1_000);
  }

  // "đ" đã được gập thành "d" (ký tự chữ) nên không dùng \b ở cuối số.
  const grouped = folded.match(/(?:^|[^\d.,])(\d{1,3}(?:[.,]\d{3})+)(?![\d])/);
  if (grouped) {
    const value = Number(grouped[1].replace(/[.,]/g, ""));
    if (Number.isFinite(value) && value >= 1_000) return value;
  }

  const plain = folded.match(/(?:^|[^\d.,])(\d{4,9})(?![\d.,]*\d)/);
  if (plain) {
    const value = Number(plain[1]);
    if (Number.isFinite(value) && value >= 1_000) return value;
  }
  return null;
}

const RECIPIENT_STOP_WORDS = new Set([
  "tien",
  "de",
  "voi",
  "nhe",
  "nha",
  "a",
  "luc",
  "vao",
  "qua",
  "for",
  "as",
  "lunch",
  "money",
  "via",
  "now",
  "please",
  "today",
]);

/** Lấy tên người nhận sau "cho …" (VI) hoặc "to …" (EN), tối đa 5 từ, dừng ở số hoặc từ nối. */
export function parseRecipientPhrase(text: string): string | null {
  const match = text.match(/(?:^|\s)(?:cho|to)\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const words: string[] = [];
  for (const raw of match[1].split(/\s+/)) {
    const word = raw.replace(/[.,!?;:]+$/, "");
    if (!word || /\d/.test(word) || RECIPIENT_STOP_WORDS.has(fold(word))) {
      break;
    }
    words.push(word);
    if (words.length >= 5 || /[.,!?;:]$/.test(raw)) {
      break;
    }
  }
  const name = words.join(" ").trim();
  return name.length >= 2 ? name : null;
}

export function detectCategoryPhrase(text: string): CategoryName | null {
  const folded = fold(text);
  if (/\ban\b(?! toan)|\b(uong|com|trua|cafe|ca phe|pho|bun|tra sua|lunch|dinner|breakfast|food|meal|coffee|drinks?)\b/.test(folded)) {
    return "Ăn uống";
  }
  if (/\b(mua sam|mua|shopping|shop|quan ao|giay)\b/.test(folded)) {
    return "Mua sắm";
  }
  if (/\b(hoa don|tien dien|tien nuoc|internet|wifi|bills?|electricity|utilities)\b/.test(folded)) {
    return "Hóa đơn";
  }
  if (/\b(khac|other)\b/.test(folded)) {
    return "Khác";
  }
  return null;
}

function formatVndDots(amount: number): string {
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const PURPOSE_BY_CATEGORY: Record<CategoryName, string> = {
  "Ăn uống": "tiền ăn uống",
  "Mua sắm": "tiền mua sắm",
  "Hóa đơn": "tiền hóa đơn",
  "Di chuyển": "tiền đi lại",
  "Khác": "",
};

function purposePhrase(text: string, category: CategoryName): string {
  const folded = fold(text);
  if (/\b(an trua|lunch)\b/.test(folded)) return "tiền ăn trưa";
  if (/\b(an toi|dinner)\b/.test(folded)) return "tiền ăn tối";
  if (/\b(cafe|ca phe|coffee)\b/.test(folded)) return "tiền cà phê";
  return PURPOSE_BY_CATEGORY[category];
}

/** Câu lệnh tiếng Việt chuẩn mà bộ phân tích `/api/analyze` hiểu được. */
export function buildTransferCommand(amount: number, recipient: string, purpose: string): string {
  return `Chuyển ${formatVndDots(amount)}đ ${purpose} cho ${recipient}`.replace(/\s+/g, " ").trim();
}

export function parseCopilotIntent(input: string): CopilotIntent {
  const text = input.trim().slice(0, 300);
  const folded = fold(text);
  if (!folded) {
    return { kind: "unknown" };
  }

  if (/(goi dang ky|dang ky|subscription|tru tien ngam|tru ngam|gia han|recurring|silently|hidden charge)/.test(folded)) {
    return { kind: "subscriptions" };
  }

  if (/(han muc|ngan sach|budget|con bao nhieu|con lai|how much|remaining|left in)/.test(folded)) {
    return { kind: "budget", category: detectCategoryPhrase(text.replace(/hạn mức|han muc|budget/gi, "")) };
  }

  if (/(\bqr\b|vietqr|quet ma|soi ma|scan)/.test(folded)) {
    return { kind: "qr" };
  }

  if (/(cuoc goi|goi den|nghe may|\bcall\b|phone call|transcribe)/.test(folded)) {
    return { kind: "call-shield" };
  }

  if (/(\bchuyen\b|\bgui\b|chuyen khoan|transfer|\bsend\b|\bpay\b|tra tien)/.test(folded)) {
    const amount = parseAmountPhrase(text);
    const recipient = parseRecipientPhrase(text);
    const category = detectCategoryPhrase(text) ?? "Khác";
    const commandText =
      amount !== null && recipient !== null ? buildTransferCommand(amount, recipient, purposePhrase(text, category)) : null;
    return { kind: "transfer", amount, recipient, category, commandText };
  }

  return { kind: "unknown" };
}

export interface BudgetAnswer {
  category: CategoryName;
  limit: number;
  spent: number;
  remaining: number;
}

/** Trả lời hạn mức từ dữ liệu Ví thật (localStorage). */
export function answerBudget(budgets: readonly BudgetCategory[], category: CategoryName | null): BudgetAnswer[] {
  const pick = category ? budgets.filter((budget) => budget.name === category) : budgets;
  return pick.map((budget) => ({
    category: budget.name,
    limit: budget.limit,
    spent: budget.spent,
    remaining: budget.limit - budget.spent,
  }));
}

export interface SubscriptionAnswer {
  activeCount: number;
  monthlyTotal: number;
  flaggedCount: number;
  flaggedMonthly: number;
}

export function answerSubscriptions(
  subscriptions: readonly RecurringSubscription[],
  isFlagged: (subscription: RecurringSubscription) => boolean,
): SubscriptionAnswer {
  const active = subscriptions.filter((subscription) => subscription.status === "ACTIVE");
  const flagged = active.filter(isFlagged);
  return {
    activeCount: active.length,
    monthlyTotal: active.reduce((sum, subscription) => sum + subscription.monthlyAmount, 0),
    flaggedCount: flagged.length,
    flaggedMonthly: flagged.reduce((sum, subscription) => sum + subscription.monthlyAmount, 0),
  };
}

/** 3 gợi ý nhanh của Copilot (đúng câu chữ trong kịch bản demo). */
export const COPILOT_CHIPS = {
  vi: [
    "Chuyển 250.000đ tiền ăn trưa cho Nguyễn Minh",
    "Kiểm tra hạn mức Mua sắm còn bao nhiêu?",
    "Soát giúp tôi các gói đăng ký đang bị trừ tiền ngầm",
  ],
  en: [
    "Transfer 250,000 VND lunch money to Nguyen Minh",
    "How much is left in my Shopping budget?",
    "Review the subscriptions silently charging me",
  ],
} as const;

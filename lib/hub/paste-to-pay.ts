import { findInstitution, type PayeeInstitutionCode } from "@/lib/payments/banks";
import { removeDiacritics, sanitizeAccountName, sanitizeMemo } from "@/lib/payments/vietqr-builder";
import { amountToTrieuPhrase } from "@/lib/wallet/format";

/**
 * Magic Paste-to-Pay: bóc tách thông tin chuyển khoản từ tin nhắn Zalo / Messenger
 * (vd "Ck cho anh 450k tiền cafe qua PVcomBank 102000334455 Nguyen Van B").
 *
 * Chạy hoàn toàn trên máy, xác định (cùng tin nhắn → cùng kết quả). Lệnh gửi Lá
 * chắn AI LUÔN kèm "Tin nhắn gốc" để không làm mất dấu hiệu lừa đảo trong tin nhắn.
 */

export type PasteField = "bank" | "account" | "amount" | "name" | "memo";

export interface PastedPayment {
  institutionCode: PayeeInstitutionCode | null;
  accountNumber: string | null;
  amount: number | null;
  accountName: string | null;
  memo: string | null;
  found: PasteField[];
}

export const PASTE_MAX_LENGTH = 500;

// So khớp trên văn bản đã bỏ dấu + chữ thường (MB để cuối vì "mb" ngắn, dễ trùng).
const BANK_ALIASES: readonly (readonly [PayeeInstitutionCode, RegExp])[] = [
  ["PVCB", /\b(?:pv\s?com\s?bank|pvcombank|pvcb|pvcom)\b/],
  ["VCB", /\b(?:vietcom\s?bank|vietcombank|vcb)\b/],
  ["TCB", /\b(?:techcom\s?bank|techcombank|techcom|tcb)\b/],
  ["BIDV", /\bbidv\b/],
  ["ACB", /\bacb\b/],
  ["ICB", /\b(?:vietin\s?bank|vietinbank|viettinbank|icb|ctg)\b/],
  ["TPB", /\b(?:tp\s?bank|tpbank|tpb|tien phong)\b/],
  ["MOMO", /\b(?:vi momo|momo)\b/],
  ["MB", /\b(?:mb\s?bank|mbbank|quan doi|mb)\b/],
];

const ACCOUNT_KEYWORDS = /\b(?:stk|so tk|so tai khoan|tai khoan|tk|acc|account|a\/c)\s*[:#.-]?\s*$/;

const NAME_STOP_WORDS = new Set(["QUA", "STK", "TK", "CHO", "ND", "NOI", "DUNG", "SO", "TEN", "CHU", "NGUOI", "NHAN"]);

const HONORIFICS = /^(?:anh|chi|chị|em|co|cô|chu|chú|bac|bác|ong|ông|ba|bà|ban|bạn|mr|ms|mrs)\s+/i;

const STOP_AFTER = "(?:\\s|$|[,.;:!?])";

function fold(text: string): string {
  return removeDiacritics(text).toLowerCase();
}

interface DigitRun {
  digits: string;
  start: number;
  end: number;
}

/**
 * Ứng viên STK: dãy số liền 6–19 chữ số, hoặc các nhóm 3–6 chữ số cách nhau một
 * dấu cách / gạch (vd "0071 0012 34567"). Bỏ qua nhóm thuộc số tiền dạng "450.000".
 */
function findDigitRuns(text: string): DigitRun[] {
  const tokens: DigitRun[] = [];
  const pattern = /\d+/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    tokens.push({ digits: match[0], start: match.index, end: match.index + match[0].length });
    match = pattern.exec(text);
  }

  const isMoneyTail = (token: DigitRun) => {
    const before = text[token.start - 1];
    return before === "." || before === ",";
  };
  const isMoneyHead = (token: DigitRun) => /^[.,]\d{3}(?!\d)/.test(text.slice(token.end, token.end + 5));
  const isGroupToken = (token: DigitRun) => token.digits.length >= 3 && token.digits.length <= 6;

  const runs: DigitRun[] = tokens.filter((token) => token.digits.length >= 6 && !isMoneyTail(token) && !isMoneyHead(token));

  let index = 0;
  while (index < tokens.length) {
    const first = tokens[index];
    if (!isGroupToken(first) || isMoneyTail(first) || isMoneyHead(first)) {
      index++;
      continue;
    }
    let last = index;
    let digits = first.digits;
    while (last + 1 < tokens.length) {
      const next = tokens[last + 1];
      const separator = text.slice(tokens[last].end, next.start);
      if (!/^[ -]$/.test(separator) || !isGroupToken(next) || isMoneyHead(next)) break;
      last++;
      digits += next.digits;
    }
    if (last > index && digits.length >= 8 && digits.length <= 19) {
      runs.push({ digits, start: first.start, end: tokens[last].end });
    }
    index = last + 1;
  }
  return runs;
}

function followedByMoneyUnit(folded: string, end: number): boolean {
  return /^\s*(?:k\b|kk\b|d\b|vnd|dong|tr\b|trieu|nghin|ngan|cu\b)/.test(folded.slice(end, end + 8));
}

function pickAccount(text: string, folded: string): DigitRun | null {
  const candidates = findDigitRuns(text).filter(
    (run) => run.digits.length >= 6 && run.digits.length <= 19 && !followedByMoneyUnit(folded, run.end),
  );
  if (candidates.length === 0) return null;
  const keyworded = candidates.find((run) => ACCOUNT_KEYWORDS.test(folded.slice(Math.max(0, run.start - 20), run.start)));
  if (keyworded) return keyworded;
  return candidates.reduce((best, run) => (run.digits.length > best.digits.length ? run : best), candidates[0]);
}

function pickBank(folded: string, accountStart: number | null): PayeeInstitutionCode | null {
  let best: { code: PayeeInstitutionCode; distance: number } | null = null;
  for (const [code, pattern] of BANK_ALIASES) {
    const global = new RegExp(pattern.source, "g");
    let match: RegExpExecArray | null = global.exec(folded);
    while (match !== null) {
      const distance = accountStart === null ? match.index : Math.abs(accountStart - match.index);
      if (!best || distance < best.distance) {
        best = { code, distance };
      }
      match = global.exec(folded);
    }
  }
  return best ? best.code : null;
}

function parseFraction(fraction: string): number {
  if (fraction.length === 1) return Number(fraction) * 100_000;
  if (fraction.length === 2) return Number(fraction) * 10_000;
  return Number(fraction.slice(0, 3)) * 1_000;
}

/** Đọc số tiền (văn bản đã bỏ dấu): "450k", "1tr2", "1,5 trieu", "2 cu", "1.200.000d", "450000 vnd". */
export function parsePastedAmount(foldedText: string): number | null {
  const text = foldedText;
  const slang = text.match(/(\d+)\s*(?:tr|trieu|cu)\s*(\d{1,3})(?![\d.,])/);
  if (slang) {
    const value = Number(slang[1]) * 1_000_000 + parseFraction(slang[2]);
    if (value > 0) return value;
  }
  const million = text.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|cu)\b/);
  if (million) {
    const value = Math.round(Number(million[1].replace(",", ".")) * 1_000_000);
    if (value > 0) return value;
  }
  const thousand = text.match(/(\d+(?:[.,]\d+)?)\s*(?:k|nghin|ngan)\b/);
  if (thousand) {
    const value = Math.round(Number(thousand[1].replace(",", ".")) * 1_000);
    if (value > 0) return value;
  }
  const grouped = text.match(/(?:^|[^\d.,])(\d{1,3}(?:[.,]\d{3})+)(?![\d])/);
  if (grouped) {
    const value = Number(grouped[1].replace(/[.,]/g, ""));
    if (value >= 1_000) return value;
  }
  const withUnit = text.match(/(?:^|[^\d.,])(\d{4,9})\s*(?:d\b|vnd|dong)/);
  if (withUnit) {
    const value = Number(withUnit[1]);
    if (value >= 1_000) return value;
  }
  return null;
}

function isCapitalized(word: string): boolean {
  const first = word.charAt(0);
  return first !== first.toLowerCase() && first === first.toUpperCase();
}

function isBankWord(word: string): boolean {
  const folded = fold(word);
  return BANK_ALIASES.some(([, pattern]) => pattern.test(folded));
}

/** Lấy tối đa 5 từ làm tên; `requireCapitalized` → chỉ nhận từ viết hoa chữ đầu (tên riêng). */
function cleanNameWords(raw: string, requireCapitalized: boolean): string | null {
  const words = raw
    .replace(/[^A-Za-zÀ-ỹ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    const key = removeDiacritics(word).toUpperCase();
    const rejected = NAME_STOP_WORDS.has(key) || isBankWord(word) || (requireCapitalized && !isCapitalized(word));
    if (rejected) {
      if (kept.length > 0) break;
      continue;
    }
    kept.push(word);
    if (kept.length >= 5) break;
  }
  const name = sanitizeAccountName(kept.join(" "));
  return name.replace(/\s/g, "").length >= 2 ? name : null;
}

function pickName(text: string, account: DigitRun | null): string | null {
  const explicit = text.match(
    /(?:^|[^A-Za-zÀ-ỹ])(?:tên tk|ten tk|tên|ten|chủ tk|chu tk|chủ tài khoản|chu tai khoan|ctk|người nhận|nguoi nhan)\s*[:\-]?\s*([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ ]{1,50})/i,
  );
  if (explicit) {
    const name = cleanNameWords(explicit[1], false);
    if (name) return name;
  }
  if (account) {
    const after = text.slice(account.end).replace(/^[\s\-–—,.()]+/, "");
    const segment = after.split(/[\n,;.!?:]/)[0] ?? "";
    const afterName = cleanNameWords(segment, true);
    if (afterName) return afterName;
  }
  const forWhom = text.match(/(?:^|\s)cho\s+([^\n,;.!?:]{2,60})/i);
  if (forWhom) {
    const name = cleanNameWords(forWhom[1].replace(HONORIFICS, ""), true);
    if (name) return name;
  }
  return null;
}

function pickMemo(text: string): string | null {
  const explicit = text.match(/(?:nội dung|noi dung|\bnd\b|ghi chú|ghi chu|lý do|ly do)\s*[:\-]\s*([^\n]{2,60})/i);
  if (explicit) {
    const memo = sanitizeMemo(explicit[1]);
    if (memo.length >= 2) return memo;
  }
  const money = text.match(
    new RegExp(
      `(tiền|tien)\\s+([^\\n,.;:!?]{2,40}?)(?=\\s+(?:qua|cho|vào|vao|stk|tk|nhé|nhe|nha|nhá|ạ|giúp|giup|ngân hàng|ngan hang|bank)${STOP_AFTER}|\\s+\\d{6,}|[,.;:!?\\n]|$)`,
      "i",
    ),
  );
  if (money) {
    const memo = sanitizeMemo(`${money[1]} ${money[2]}`);
    if (memo.length >= 4) return memo;
  }
  return null;
}

/** Bóc tách Ngân hàng, STK, Số tiền, Tên người nhận, Nội dung từ một tin nhắn. */
export function parsePaymentMessage(input: string): PastedPayment {
  // NFC trước để vị trí ký tự giữa văn bản gốc và văn bản bỏ dấu khớp nhau.
  const text = input.normalize("NFC").slice(0, PASTE_MAX_LENGTH);
  const folded = fold(text);
  const account = pickAccount(text, folded);

  // Bỏ đoạn STK trước khi đọc số tiền để không nhầm STK thành tiền.
  const foldedWithoutAccount = account ? `${folded.slice(0, account.start)} ${folded.slice(account.end)}` : folded;

  const institutionCode = pickBank(folded, account ? account.start : null);
  const amount = parsePastedAmount(foldedWithoutAccount);
  const accountName = pickName(text, account);
  const memo = pickMemo(text);

  const found: PasteField[] = [];
  if (institutionCode) found.push("bank");
  if (account) found.push("account");
  if (amount !== null) found.push("amount");
  if (accountName) found.push("name");
  if (memo) found.push("memo");

  return {
    institutionCode,
    accountNumber: account ? account.digits : null,
    amount,
    accountName,
    memo,
    found,
  };
}

/** Đủ thông tin để tự phân tích và hiện mã VietQR ngay (ngân hàng + STK + số tiền). */
export function isPasteComplete(parsed: PastedPayment): boolean {
  return parsed.institutionCode !== null && parsed.accountNumber !== null && parsed.amount !== null;
}

/** Tin nhắn có vẻ là yêu cầu chuyển khoản (để bắt Ctrl+V vào ô lệnh). */
export function looksLikePaymentMessage(parsed: PastedPayment): boolean {
  return parsed.accountNumber !== null && (parsed.institutionCode !== null || parsed.amount !== null);
}

/**
 * Lệnh gửi Lá chắn AI: phần chuẩn hóa đứng trước (số tiền dạng "x triệu" để bộ luật
 * đọc đúng, người nhận + STK + ngân hàng), sau đó là "Tin nhắn gốc" để AI vẫn thấy
 * mọi dấu hiệu lừa đảo (mạo danh, thúc ép, link lạ…) có trong tin nhắn.
 */
export function buildPasteCommand(parsed: PastedPayment, rawMessage: string): string {
  const parts: string[] = ["Chuyển"];
  if (parsed.amount !== null) parts.push(amountToTrieuPhrase(parsed.amount));
  if (parsed.memo) parts.push(parsed.memo);
  if (parsed.accountName) parts.push(`cho ${parsed.accountName}`);
  if (parsed.accountNumber) {
    const institution = findInstitution(parsed.institutionCode);
    parts.push(`STK ${parsed.accountNumber}${institution ? ` (${institution.shortName})` : ""}`);
  }
  const head = `${parts.join(" ")}.`;
  const original = rawMessage.replace(/\s+/g, " ").trim().slice(0, PASTE_MAX_LENGTH);
  return original ? `${head} Tin nhắn gốc: ${original}` : head;
}

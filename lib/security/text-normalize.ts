/**
 * Chuẩn hóa văn bản TRƯỚC khi bộ luật chống lừa đảo dò từ khóa / Blacklist (T-2.9).
 *
 * Kẻ gian né bộ luật bằng:
 *  - ký tự vô hình chèn giữa chữ (zero-width, soft hyphen, ký tự điều hướng bidi);
 *  - tiếng Việt ở dạng tổ hợp NFD (o + dấu rời) thay vì dựng sẵn NFC;
 *  - chữ full-width (ｃôｎｇ) hoặc chữ Kirin / Hy Lạp trông giống Latin (homoglyph: с, о, а, е…).
 * Hàm thuần, không phụ thuộc trình duyệt / Node — dùng được cả server lẫn client.
 */

/** Zero-width, soft hyphen, word joiner, BOM, ký tự điều hướng hai chiều, khoảng trắng ẩn của Mông Cổ. */
const INVISIBLE_CHARS = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;

/** Chữ Kirin / Hy Lạp hay bị dùng giả dạng chữ Latin (thường + hoa). */
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  "а": "a", "А": "A", "в": "b", "В": "B", "е": "e", "Е": "E", "ё": "e", "к": "k", "К": "K",
  "м": "m", "М": "M", "н": "h", "Н": "H", "о": "o", "О": "O", "р": "p", "Р": "P", "с": "c",
  "С": "C", "т": "t", "Т": "T", "у": "y", "У": "Y", "х": "x", "Х": "X", "і": "i", "І": "I",
  "ј": "j", "Ј": "J", "ѕ": "s", "Ѕ": "S", "һ": "h", "ԁ": "d", "ԛ": "q", "ԝ": "w",
  "α": "a", "Α": "A", "β": "b", "Β": "B", "ε": "e", "Ε": "E", "ι": "i", "Ι": "I", "κ": "k",
  "Κ": "K", "ν": "v", "Ν": "N", "ο": "o", "Ο": "O", "ρ": "p", "Ρ": "P", "τ": "t", "Τ": "T",
  "υ": "u", "χ": "x", "Χ": "X", "Ζ": "Z", "Η": "H", "Μ": "M",
};

const HOMOGLYPH_PATTERN = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "g");

export function normalizeForRules(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    return "";
  }
  return input
    .replace(INVISIBLE_CHARS, "")
    // NFKC: full-width → ASCII, chữ ghép → chữ thường; đồng thời dựng sẵn tiếng Việt (NFD → NFC).
    .normalize("NFKC")
    .replace(HOMOGLYPH_PATTERN, (ch) => HOMOGLYPHS[ch] ?? ch)
    .normalize("NFC");
}

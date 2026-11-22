import type { AppLanguage } from "@/types/trustpay";

/**
 * Tiện ích định dạng dùng chung cho giao diện TrustPay AI (thuần TS, chạy được
 * cả server lẫn trình duyệt). Mọi mốc thời gian được định dạng theo múi giờ
 * Asia/Ho_Chi_Minh để kết quả giống nhau giữa SSR và client (không lệch hydrate)
 * và khớp cách tính hạn mức lũy kế ngày của NHNN.
 */

export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Việt Nam dùng UTC+7 cố định (không có giờ mùa hè). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const VI_NUMBER = new Intl.NumberFormat("vi-VN");
const EN_NUMBER = new Intl.NumberFormat("en-US");

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Tách các thành phần ngày giờ theo giờ Việt Nam bằng phép cộng offset cố định —
 * cho kết quả giống hệt nhau giữa Node (SSR) và mọi trình duyệt, tránh lệch
 * hydrate do khác biệt dữ liệu ICU của `Intl.DateTimeFormat`.
 */
function vnParts(epochMs: number) {
  const shifted = new Date(epochMs + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function safeRound(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

/** Định dạng tiền VNĐ theo ngôn ngữ: `1.000.000đ` (vi) hoặc `1,000,000₫` (en). */
export function formatMoney(amount: number, lang: AppLanguage = "vi"): string {
  const rounded = safeRound(amount);
  return lang === "en"
    ? `${EN_NUMBER.format(rounded)}₫`
    : `${VI_NUMBER.format(rounded)}đ`;
}

/** Định dạng số nguyên có phân tách hàng nghìn (dùng cho ô nhập tiền). */
export function formatNumberInput(amount: number): string {
  return amount > 0 ? VI_NUMBER.format(safeRound(amount)) : "";
}

/**
 * Chuyển chuỗi người dùng nhập thành số tiền VNĐ. Hỗ trợ `1.290.000`,
 * `1,290,000`, `1290000`, `450k`, `450 nghìn`, `1,29tr`, `2.5 triệu`.
 * Trả về 0 nếu không hợp lệ.
 */
export function parseMoneyInput(raw: string): number {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) {
    return 0;
  }

  const unitMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(k|nghìn|nghin|ngàn|ngan|tr|triệu|trieu|củ)$/);
  if (unitMatch) {
    const value = parseFloat(unitMatch[1].replace(",", "."));
    if (!Number.isFinite(value)) {
      return 0;
    }
    const unit = unitMatch[2];
    const multiplier = unit === "k" || unit.startsWith("ng") ? 1_000 : 1_000_000;
    return Math.round(value * multiplier);
  }

  const digits = text.replace(/[^\d]/g, "");
  if (!digits || digits.length > 13) {
    return 0;
  }
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Biểu diễn số tiền dạng "x,yz triệu" để đưa vào câu lệnh gửi Lá chắn AI. Bộ
 * luật dự phòng ưu tiên bóc tách mẫu "triệu" trước mọi mẫu khác, nên cách viết
 * này đảm bảo số tiền không bị nhầm với chữ số nằm trong tên miền (vd `99k`).
 */
export function amountToTrieuPhrase(amount: number): string {
  const millions = safeRound(amount) / 1_000_000;
  const fixed = millions.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return `${fixed.replace(".", ",")} triệu`;
}

/**
 * Định dạng ngày giờ theo giờ Việt Nam (GMT+7): `HH:mm dd/MM/yyyy` (vi) hoặc
 * `dd/MM/yyyy HH:mm` (en).
 */
export function formatDateTime(iso: string, lang: AppLanguage = "vi"): string {
  const epochMs = Date.parse(iso);
  if (!Number.isFinite(epochMs)) {
    return iso;
  }
  const p = vnParts(epochMs);
  const date = `${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
  const time = `${pad2(p.hour)}:${pad2(p.minute)}`;
  return lang === "en" ? `${date} ${time}` : `${time} ${date}`;
}

/** Giờ:phút (tùy chọn giây) theo giờ Việt Nam từ epoch ms. */
export function formatClock(epochMs: number, withSeconds = false): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) {
    return "--:--";
  }
  const p = vnParts(epochMs);
  const base = `${pad2(p.hour)}:${pad2(p.minute)}`;
  return withSeconds ? `${base}:${pad2(p.second)}` : base;
}

/** Khóa ngày `YYYY-MM-DD` theo giờ Việt Nam (dùng cho hạn mức lũy kế/ngày). */
export function vnDayKey(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    return "";
  }
  const p = vnParts(epochMs);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Phần ngày `YYYYMMDD` để sinh mã ticket theo chuẩn `TCK-YYYYMMDD-NNN`. */
export function vnDatePart(epochMs: number): string {
  return vnDayKey(epochMs).replace(/-/g, "");
}

/** Định dạng độ trễ (ms) gọn gàng cho thanh luồng công nghệ. */
export function formatLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return "—";
  }
  if (ms < 1) {
    return "<1 ms";
  }
  if (ms < 10) {
    return `${ms.toFixed(1)} ms`;
  }
  return `${Math.round(ms)} ms`;
}

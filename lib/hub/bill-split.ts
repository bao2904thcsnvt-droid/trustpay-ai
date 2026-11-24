import { sanitizeMemo } from "@/lib/payments/vietqr-builder";

/**
 * Smart Bill Splitter: chia đều hóa đơn nhóm và tính số tiền mỗi người cần quét
 * mã VietQR thu tiền. Làm tròn LÊN tới bội số `roundTo` (mặc định 1.000đ) để mọi
 * người quét cùng một mã; phần dư hiển thị minh bạch.
 */

export const SPLIT_MIN_PEOPLE = 2;
export const SPLIT_MAX_PEOPLE = 50;
export const SPLIT_MAX_TOTAL = 500_000_000;

export interface BillSplit {
  total: number;
  people: number;
  perPerson: number;
  /** Số người còn lại cần trả (người tạo mã đã trả trước). */
  othersCount: number;
  expectedFromOthers: number;
  /** Phần dư do làm tròn lên (perPerson × people − total). */
  surplus: number;
}

export function splitBill(total: number, people: number, roundTo = 1_000): BillSplit | null {
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    total > SPLIT_MAX_TOTAL ||
    !Number.isInteger(people) ||
    people < SPLIT_MIN_PEOPLE ||
    people > SPLIT_MAX_PEOPLE
  ) {
    return null;
  }
  const rounded = Math.round(total);
  const unit = rounded >= roundTo * people ? roundTo : 1;
  const perPerson = Math.ceil(rounded / people / unit) * unit;
  return {
    total: rounded,
    people,
    perPerson,
    othersCount: people - 1,
    expectedFromOthers: perPerson * (people - 1),
    surplus: perPerson * people - rounded,
  };
}

/** Nội dung chuyển khoản cho mã thu tiền nhóm, vd "Chia tien an toi" (≤ 25 ký tự, không dấu). */
export function buildSplitMemo(note: string): string {
  const cleanNote = sanitizeMemo(note, 25);
  return sanitizeMemo(cleanNote ? `Chia tien ${cleanNote}` : "Chia tien nhom", 25);
}

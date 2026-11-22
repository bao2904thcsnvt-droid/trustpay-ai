/**
 * Blacklist sống phía client: hỗ trợ cả mục cụ thể (STK, tên, tên miền) lẫn mục
 * dạng CỤM theo tiền tố như `1903xxxx` (phong tỏa cả đường dây STK).
 *
 * Hợp đồng `/api/analyze` chỉ nhận `blacklist: string[]` và so khớp theo chuỗi
 * con, nên trước khi gọi API, client "nở" (expand) các mục cụm thành những STK
 * cụ thể xuất hiện trong câu lệnh. Nhờ vậy hợp đồng JSON giữ nguyên.
 */

const CLUSTER_PATTERN = /^(\d{2,})([xX*]{2,})$/;

export interface BlacklistClusterPattern {
  raw: string;
  prefix: string;
  /** Độ dài tối thiểu của STK thuộc cụm (tiền tố + số ký tự đại diện). */
  minLength: number;
}

export function parseClusterPattern(entry: string): BlacklistClusterPattern | null {
  const match = entry.trim().match(CLUSTER_PATTERN);
  if (!match) {
    return null;
  }
  return {
    raw: entry.trim(),
    prefix: match[1],
    minLength: match[1].length + match[2].length,
  };
}

export function isClusterPattern(entry: string): boolean {
  return parseClusterPattern(entry) !== null;
}

function digitRuns(text: string): string[] {
  return text.match(/\d{4,}/g) ?? [];
}

/** True nếu một mục Blacklist khớp với giá trị (STK/tên/tên miền/câu lệnh). */
export function matchesBlacklistEntry(entry: string, value: string): boolean {
  const normalizedEntry = entry.trim().toLowerCase();
  if (!normalizedEntry || !value) {
    return false;
  }
  const pattern = parseClusterPattern(normalizedEntry);
  if (pattern) {
    return digitRuns(value).some(
      (run) => run.startsWith(pattern.prefix) && run.length >= pattern.minLength,
    );
  }
  return value.toLowerCase().includes(normalizedEntry);
}

/** Trả về các mục Blacklist khớp với giá trị. */
export function findBlacklistMatches(blacklist: string[], value: string): string[] {
  return blacklist.filter((entry) => matchesBlacklistEntry(entry, value));
}

export function isValueBlacklisted(blacklist: string[], value: string): boolean {
  return findBlacklistMatches(blacklist, value).length > 0;
}

/**
 * Bổ sung vào payload Blacklist những STK cụ thể trong văn bản thuộc một cụm
 * tiền tố (vd `1903xxxx` → `1903456721`), giữ nguyên các mục gốc.
 */
export function expandBlacklistForText(blacklist: string[], text: string): string[] {
  const patterns = blacklist
    .map((entry) => parseClusterPattern(entry))
    .filter((p): p is BlacklistClusterPattern => p !== null);

  if (patterns.length === 0 || !text) {
    return [...blacklist];
  }

  const additions: string[] = [];
  for (const run of digitRuns(text)) {
    if (patterns.some((p) => run.startsWith(p.prefix) && run.length >= p.minLength)) {
      additions.push(run);
    }
  }
  return mergeBlacklist(blacklist, additions);
}

/** Chuẩn hóa mục người dùng nhập: bỏ khoảng trắng thừa, 4–64 ký tự. */
export function normalizeBlacklistEntry(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length < 4 || collapsed.length > 64) {
    return null;
  }
  return collapsed;
}

/** Gộp Blacklist, loại trùng không phân biệt hoa thường; mục mới đứng đầu. */
export function mergeBlacklist(existing: string[], additions: string[]): string[] {
  const old: string[] = [];
  const oldKeys = new Set<string>();
  for (const item of existing) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || oldKeys.has(key)) {
      continue;
    }
    oldKeys.add(key);
    old.push(trimmed);
  }

  const fresh: string[] = [];
  const freshKeys = new Set<string>();
  for (const item of additions) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || oldKeys.has(key) || freshKeys.has(key)) {
      continue;
    }
    freshKeys.add(key);
    fresh.push(trimmed);
  }

  return [...fresh, ...old];
}

/**
 * Tách khóa Blacklist từ chuỗi người nhận của ticket (REQ-A4.3): ưu tiên STK
 * (6–19 chữ số) để giao dịch kế tiếp tới cùng STK bị chặn dù tên thay đổi; nếu
 * không có STK thì dùng nguyên tên người nhận.
 */
export function blacklistKeysFromRecipient(recipient: string): string[] {
  const trimmed = recipient.trim();
  if (!trimmed || trimmed === "Người nhận chưa xác định") {
    return [];
  }
  const accounts = (trimmed.match(/\d{6,19}/g) ?? []).filter((run, idx, arr) => arr.indexOf(run) === idx);
  if (accounts.length > 0) {
    return accounts;
  }
  return normalizeBlacklistEntry(trimmed) ? [trimmed] : [];
}

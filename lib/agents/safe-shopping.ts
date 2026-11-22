import type { ShopRiskReport, ShopRiskSignal, ShopTargetKind } from "@/types/trustpay";
import { clampRiskScore, riskLevelFromScore } from "@/lib/security/ai-output-guard";
import { findBlacklistMatches } from "@/lib/wallet/blacklist-patterns";
import { amountToTrieuPhrase } from "@/lib/wallet/format";

/**
 * Safe Shopping Agent — bộ phân tích cấu trúc URL / tên cửa hàng xác định
 * (deterministic, thuần TS, không gọi mạng). Kết quả là "sàn rủi ro" phía
 * client; điểm cuối cùng = max(điểm bộ phân tích này, điểm Lá chắn AI), nên AI
 * chỉ có thể nâng chứ không hạ mức cảnh báo (ADR-1).
 */

interface OfficialStore {
  domain: string;
  name: string;
  aliases: string[];
}

const OFFICIAL_STORES: readonly OfficialStore[] = [
  { domain: "shopee.vn", name: "Shopee Việt Nam", aliases: ["shopee", "shopee mall"] },
  { domain: "tiki.vn", name: "Tiki", aliases: ["tiki", "tiki trading"] },
  { domain: "lazada.vn", name: "Lazada Việt Nam", aliases: ["lazada", "lazmall"] },
  { domain: "sendo.vn", name: "Sendo", aliases: ["sendo"] },
  { domain: "thegioididong.com", name: "Thế Giới Di Động", aliases: ["thế giới di động", "the gioi di dong", "tgdd"] },
  { domain: "dienmayxanh.com", name: "Điện Máy Xanh", aliases: ["điện máy xanh", "dien may xanh"] },
  { domain: "fptshop.com.vn", name: "FPT Shop", aliases: ["fpt shop", "fptshop"] },
  { domain: "cellphones.com.vn", name: "CellphoneS", aliases: ["cellphones", "cellphone s"] },
  { domain: "hoanghamobile.com", name: "Hoàng Hà Mobile", aliases: ["hoàng hà mobile", "hoang ha mobile"] },
  { domain: "nguyenkim.com", name: "Nguyễn Kim", aliases: ["nguyễn kim", "nguyen kim"] },
  { domain: "bachhoaxanh.com", name: "Bách Hóa Xanh", aliases: ["bách hóa xanh", "bach hoa xanh"] },
  { domain: "hasaki.vn", name: "Hasaki", aliases: ["hasaki"] },
  { domain: "pnj.com.vn", name: "PNJ", aliases: ["pnj"] },
  { domain: "uniqlo.com", name: "UNIQLO", aliases: ["uniqlo"] },
  { domain: "apple.com", name: "Apple Store", aliases: ["apple store"] },
  { domain: "momo.vn", name: "MoMo", aliases: ["momo"] },
];

interface ProtectedBrand {
  token: string;
  label: string;
  officialDomains: string[];
}

const PROTECTED_BRANDS: readonly ProtectedBrand[] = [
  ...OFFICIAL_STORES.map((store) => ({
    token: store.domain.split(".")[0],
    label: store.name,
    officialDomains: [store.domain],
  })),
  { token: "vietcombank", label: "Vietcombank", officialDomains: ["vietcombank.com.vn"] },
  { token: "techcombank", label: "Techcombank", officialDomains: ["techcombank.com", "techcombank.com.vn"] },
  { token: "vietinbank", label: "VietinBank", officialDomains: ["vietinbank.vn"] },
  { token: "agribank", label: "Agribank", officialDomains: ["agribank.com.vn"] },
  { token: "bidv", label: "BIDV", officialDomains: ["bidv.com.vn"] },
  { token: "mbbank", label: "MB Bank", officialDomains: ["mbbank.com.vn"] },
  { token: "zalopay", label: "ZaloPay", officialDomains: ["zalopay.vn"] },
  { token: "vnpay", label: "VNPAY", officialDomains: ["vnpay.vn"] },
];

const MULTI_LEVEL_SUFFIXES: ReadonlySet<string> = new Set([
  "com.vn",
  "net.vn",
  "org.vn",
  "edu.vn",
  "gov.vn",
  "info.vn",
  "biz.vn",
  "name.vn",
  "pro.vn",
  "co.uk",
  "com.au",
  "com.sg",
  "co.jp",
  "com.cn",
]);

const SUSPICIOUS_TLDS: ReadonlySet<string> = new Set([
  "xyz", "top", "club", "online", "site", "icu", "buzz", "live", "click", "link", "info", "cc",
  "tk", "ml", "ga", "cf", "gq", "rest", "cyou", "monster", "sbs", "vip", "win", "bid", "loan",
  "work", "fit", "shop", "store", "cfd", "bond", "quest",
]);

const URL_SHORTENERS: ReadonlySet<string> = new Set([
  "bit.ly", "bitly.com", "tinyurl.com", "cutt.ly", "shorturl.at", "rb.gy", "t.ly", "is.gd",
  "ow.ly", "s.id", "tiny.cc", "goo.su",
]);

const LURE_TOKENS: ReadonlySet<string> = new Set([
  "sale", "flash", "free", "freeship", "voucher", "lucky", "gift", "bonus", "deal", "giamgia",
  "khuyenmai", "quatang", "trungthuong", "trian", "thanhly", "xakho", "giasoc", "sieure",
  "mienphi", "99k", "9k", "1k", "0d", "0dong",
]);

const LURE_PHRASES: readonly string[] = [
  "giam-gia", "khuyen-mai", "qua-tang", "trung-thuong", "tri-an", "thanh-ly", "xa-kho",
  "gia-soc", "sieu-re", "mien-phi",
];

const NAME_LURE_PHRASES: readonly string[] = [
  "sale sốc", "xả kho", "thanh lý", "giá gốc", "giá sỉ", "siêu rẻ", "rẻ vô địch", "flash sale",
  "đồng giá 1k", "0đ", "trúng thưởng", "tri ân", "quà tặng miễn phí",
];

const NAME_PREPAYMENT_PHRASES: readonly string[] = [
  "chuyển khoản trước", "đặt cọc", "cọc trước", "inbox", "ib zalo", "qua zalo", "telegram",
  "liên hệ riêng", "ngoài sàn", "không qua sàn",
];

interface PriceReference {
  pattern: RegExp;
  label: string;
  minPlausibleVnd: number;
}

const PRICE_REFERENCES: readonly PriceReference[] = [
  { pattern: /iphone\s*1[5-7]\s*pro\s*max/, label: "iPhone Pro Max", minPlausibleVnd: 25_000_000 },
  { pattern: /iphone\s*1[5-7]/, label: "iPhone 15–17", minPlausibleVnd: 15_000_000 },
  { pattern: /macbook/, label: "MacBook", minPlausibleVnd: 18_000_000 },
  { pattern: /ipad/, label: "iPad", minPlausibleVnd: 7_000_000 },
  { pattern: /airpods/, label: "AirPods", minPlausibleVnd: 2_500_000 },
  { pattern: /galaxy\s*(s2[3-6]|z\s*(fold|flip))/, label: "Samsung Galaxy S/Z", minPlausibleVnd: 12_000_000 },
  { pattern: /ps5|playstation\s*5/, label: "PlayStation 5", minPlausibleVnd: 9_000_000 },
  { pattern: /dyson/, label: "Dyson", minPlausibleVnd: 7_000_000 },
  { pattern: /rolex/, label: "Rolex", minPlausibleVnd: 100_000_000 },
];

/** Hai mẫu điền nhanh 1 chạm cho Ban Giám Khảo. */
export const SHOP_SAMPLES = {
  trusted: {
    target: "https://tiki.vn/tai-nghe-bluetooth-sony-wh-ch520-p275948372.html",
    price: 1_290_000,
    productName: "Tai nghe Bluetooth Sony WH-CH520",
  },
  suspicious: {
    target: "http://shopee-sale-99k.xyz/flash-sale/iphone-16-pro-max?ref=zalo",
    price: 2_990_000,
    productName: "iPhone 16 Pro Max 256GB",
  },
} as const;

function registrableDomain(hostname: string): string {
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) {
    return labels.join(".");
  }
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

function looksLikeUrl(target: string): boolean {
  if (target.includes("://")) {
    return true;
  }
  if (/\s/.test(target)) {
    return false;
  }
  return /^[^\s/]+\.[a-z0-9-]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(target);
}

function priceSignal(text: string, price: number): ShopRiskSignal | null {
  if (price <= 0) {
    return null;
  }
  const normalized = text.toLowerCase().replace(/[-_/+.]/g, " ");
  const reference = PRICE_REFERENCES.find((ref) => ref.pattern.test(normalized));
  if (!reference || price >= reference.minPlausibleVnd * 0.4) {
    return null;
  }
  return { code: "PRICE_TOO_GOOD", weight: 30, detail: reference.label };
}

function blacklistSignal(blacklist: string[], values: string[]): ShopRiskSignal | null {
  const matches = Array.from(new Set(values.flatMap((value) => findBlacklistMatches(blacklist, value))));
  return matches.length > 0 ? { code: "BLACKLISTED", weight: 60, detail: matches.slice(0, 3).join(", ") } : null;
}

function finalize(
  kind: ShopTargetKind,
  normalizedTarget: string,
  displayTarget: string,
  baseScore: number,
  signals: ShopRiskSignal[],
  officialStoreName?: string,
): ShopRiskReport {
  const riskScore = clampRiskScore(signals.reduce((sum, signal) => sum + signal.weight, baseScore));
  return {
    kind,
    normalizedTarget,
    displayTarget,
    ...(officialStoreName ? { officialStoreName } : {}),
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    signals,
  };
}

function analyzeUrl(rawTarget: string, price: number, productName: string, blacklist: string[]): ShopRiskReport | null {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawTarget);
  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? rawTarget : `https://${rawTarget}`);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!hostname) {
    return null;
  }
  const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  const displayTarget = `${hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`.slice(0, 96);
  const domain = registrableDomain(hostname);
  const tld = hostname.split(".").pop() ?? "";
  const signals: ShopRiskSignal[] = [];

  const official = OFFICIAL_STORES.find((store) => store.domain === domain);
  if (official) {
    signals.push({ code: "OFFICIAL_STORE", weight: 0, detail: official.name });
  }

  if (parsed.protocol === "http:") {
    signals.push({ code: "NO_HTTPS", weight: 20 });
  }

  if (parsed.username || parsed.password) {
    signals.push({ code: "CREDENTIALS_IN_URL", weight: 30 });
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    signals.push({ code: "IP_HOST", weight: 35 });
  }

  if (hostname.includes("xn--")) {
    signals.push({ code: "PUNYCODE", weight: 30 });
  }

  if (URL_SHORTENERS.has(domain)) {
    signals.push({ code: "URL_SHORTENER", weight: 20 });
  }

  if (!official && SUSPICIOUS_TLDS.has(tld)) {
    signals.push({ code: "SUSPICIOUS_TLD", weight: 25, detail: `.${tld}` });
  }

  if (!official) {
    const impersonated = PROTECTED_BRANDS.find(
      (brand) => hostname.includes(brand.token) && !brand.officialDomains.includes(domain),
    );
    if (impersonated) {
      signals.push({ code: "BRAND_IMPERSONATION", weight: 40, detail: impersonated.label });
    }
  }

  const haystack = `${hostname}${path}`;
  const tokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  const lureHits = Array.from(
    new Set([
      ...tokens.filter((token) => LURE_TOKENS.has(token)),
      ...LURE_PHRASES.filter((phrase) => haystack.includes(phrase)),
    ]),
  );
  if (lureHits.length > 0) {
    signals.push({ code: "LURE_KEYWORDS", weight: Math.min(25, 10 + 5 * (lureHits.length - 1)), detail: lureHits.slice(0, 4).join(", ") });
  }

  const firstLabel = domain.split(".")[0] ?? "";
  const hyphenCount = (firstLabel.match(/-/g) ?? []).length;
  const digitCount = (firstLabel.match(/\d/g) ?? []).length;
  if (!official && (hyphenCount >= 2 || digitCount >= 3 || hostname.length > 30 || hostname.split(".").length > 4)) {
    signals.push({ code: "COMPLEX_HOSTNAME", weight: 10 });
  }

  if (/(?:^|[?&])(ref|utm_source)=(zalo|fb|facebook|tiktok|telegram|messenger)\b/.test(parsed.search.toLowerCase()) || parsed.searchParams.has("fbclid")) {
    signals.push({ code: "SOCIAL_REFERRAL", weight: 8 });
  }

  const priceFlag = priceSignal(`${productName} ${hostname} ${path}`, price);
  if (priceFlag) {
    signals.push(priceFlag);
  }

  const blacklistFlag = blacklistSignal(blacklist, [hostname, domain, rawTarget]);
  if (blacklistFlag) {
    signals.push(blacklistFlag);
  }

  if (!official) {
    signals.push({ code: "UNVERIFIED_STORE", weight: 20 });
  }

  return finalize("URL", hostname, displayTarget, official ? 5 : 10, signals, official?.name);
}

function analyzeStoreName(rawTarget: string, price: number, productName: string, blacklist: string[]): ShopRiskReport {
  const normalized = rawTarget.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const signals: ShopRiskSignal[] = [];

  const official = OFFICIAL_STORES.find((store) => store.aliases.some((alias) => lower === alias || lower.includes(alias)));
  if (official) {
    signals.push({ code: "OFFICIAL_STORE", weight: 0, detail: official.name });
  }

  const lureHits = NAME_LURE_PHRASES.filter((phrase) => lower.includes(phrase));
  if (lureHits.length > 0) {
    signals.push({ code: "LURE_KEYWORDS", weight: Math.min(25, 15 + 5 * (lureHits.length - 1)), detail: lureHits.slice(0, 3).join(", ") });
  }

  const pressureHits = NAME_PREPAYMENT_PHRASES.filter((phrase) => lower.includes(phrase));
  if (pressureHits.length > 0) {
    signals.push({ code: "PREPAYMENT_PRESSURE", weight: 25, detail: pressureHits.slice(0, 3).join(", ") });
  }

  const priceFlag = priceSignal(`${productName} ${lower}`, price);
  if (priceFlag) {
    signals.push(priceFlag);
  }

  const blacklistFlag = blacklistSignal(blacklist, [normalized]);
  if (blacklistFlag) {
    signals.push(blacklistFlag);
  }

  if (!official) {
    signals.push({ code: "UNVERIFIED_STORE", weight: 25 });
  }

  return finalize("STORE_NAME", normalized, normalized.slice(0, 96), official ? 5 : 10, signals, official?.name);
}

/**
 * Phân tích link sản phẩm hoặc tên cửa hàng online trước khi thanh toán.
 * Không bao giờ ném lỗi: đầu vào không nhận diện được → cảnh báo INVALID_TARGET.
 */
export function analyzeShopTarget(input: {
  target: string;
  price: number;
  productName?: string;
  blacklist: string[];
}): ShopRiskReport {
  const target = input.target.trim().slice(0, 500);
  const productName = (input.productName ?? "").trim().slice(0, 120);

  if (!target) {
    return finalize("STORE_NAME", "", "", 10, [{ code: "INVALID_TARGET", weight: 40 }]);
  }

  if (looksLikeUrl(target)) {
    const report = analyzeUrl(target, input.price, productName, input.blacklist);
    if (report) {
      return report;
    }
  }
  return analyzeStoreName(target, input.price, productName, input.blacklist);
}

/**
 * Câu lệnh ngữ cảnh gửi Lá chắn AI (Bedrock / Offline Heuristic). Số tiền được
 * viết dạng "x,yz triệu" để bộ luật bóc tách đúng giá kể cả khi tên miền chứa số.
 */
export function buildShopCommandText(report: ShopRiskReport, price: number): string {
  const where = report.kind === "URL" ? `website ${report.displayTarget}` : `cửa hàng ${report.normalizedTarget}`;
  return `Thanh toán ${amountToTrieuPhrase(price)} mua hàng online tại ${where}`;
}

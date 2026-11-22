import type { AppLanguage, CategoryName } from "@/types/trustpay";

/**
 * Dịch sang tiếng Anh các chuỗi DỮ LIỆU do bộ luật (Smart Fallback Engine),
 * chính sách sinh trắc học và các tác vụ phía client sinh ra bằng tiếng Việt
 * (scamType, redFlags, explanation, budgetAlert, summary của ticket, ghi chú lịch
 * sử...). Dữ liệu luôn được LƯU bằng tiếng Việt (ngôn ngữ chuẩn của hệ thống);
 * lớp hiển thị dịch theo mẫu đã biết. Chuỗi lạ (vd do Bedrock sinh tự do) được
 * giữ nguyên văn bản gốc.
 */

const CATEGORY_EN: Record<CategoryName, string> = {
  "Ăn uống": "Food & Drinks",
  "Mua sắm": "Shopping",
  "Di chuyển": "Transport",
  "Hóa đơn": "Bills",
  "Khác": "Other",
};

export function translateCategory(category: CategoryName, lang: AppLanguage): string {
  return lang === "en" ? CATEGORY_EN[category] : category;
}

function categoryNameEn(raw: string): string {
  return (CATEGORY_EN as Record<string, string>)[raw] ?? raw;
}

/** Đổi định dạng số `12.000.000` → `12,000,000` và `VNĐ` → `VND`. */
function localizeNumbersEn(text: string): string {
  return text
    .replace(/\d{1,3}(?:\.\d{3})+(?!\d)/g, (match) => match.replace(/\./g, ","))
    .replace(/VNĐ/g, "VND");
}

const EXACT_EN: Record<string, string> = {
  // scamType
  "Giao dịch tiêu dùng thông thường": "Regular consumer transaction",
  "Lừa đảo mạo danh Cơ quan Công an / Cán bộ điều tra": "Police / investigator impersonation scam",
  "Lừa đảo đóng phí nhận thưởng / Quà tặng giá trị cao": "Prize-fee scam / high-value gift bait",
  "Giao dịch tới tài khoản nằm trong Danh sách đen (Blacklist)": "Transfer to a blacklisted account",
  // redFlags
  "Dấu hiệu mạo danh cơ quan chức năng yêu cầu chuyển tiền phục vụ điều tra / xác minh tài khoản":
    "Signs of impersonating authorities who demand money for an \"investigation\" or \"account verification\"",
  "Yêu cầu chuyển khoản phí trước để nhận phần thưởng / quà tặng giá trị cao (iPhone, bưu kiện)":
    "Asks for an upfront fee to receive a prize / high-value gift (iPhone, parcel)",
  "Tạo áp lực tâm lý khẩn cấp ('chuyển gấp') nhằm ngăn người dùng kiểm chứng thông tin":
    "Creates urgent pressure (\"transfer now\") to stop you from verifying the story",
  "Số tiền giao dịch lớn vượt quá hạn mức ngân sách hiện tại": "Large amount that exceeds the current budget limit",
  "Không phát hiện từ khóa lừa đảo hoặc tài khoản Blacklist": "No scam keywords or blacklisted accounts detected",
  // budgetAlert.suggestion
  "Hãy trì hoãn giao dịch hoặc điều chỉnh lại hạn mức chi tiêu trước khi xác nhận.":
    "Consider postponing this transaction or adjusting your spending limits before confirming.",
  "Ngân sách của bạn đang ở trạng thái an toàn, có thể tiếp tục thanh toán.":
    "Your budget is healthy — you can go ahead with the payment.",
  "Hãy trì hoãn giao dịch hoặc điều chỉnh lại hạn mức chi tiêu.":
    "Consider postponing this transaction or adjusting your spending limits.",
  // recommendedAction
  "Tạm khóa giao dịch, yêu cầu xác thực sinh trắc học khuôn mặt (AWS Rekognition) và đẩy cảnh báo lên đội ngũ Fintech Ops.":
    "Hold the transaction, require face biometrics (AWS Rekognition) and escalate to the Fintech Ops team.",
  "Cho phép giao dịch sau khi nhắc nhở người dùng về việc vượt hạn mức ngân sách.":
    "Allow the transaction after reminding the user about the budget overrun.",
  "Cho phép thực hiện giao dịch bình thường.": "Allow the transaction as normal.",
  "Tạm khóa giao dịch, yêu cầu xác thực sinh trắc học khuôn mặt và cảnh báo khách hàng.":
    "Hold the transaction, require face biometrics and warn the customer.",
  "Phát hiện giao dịch chuyển 5.000.000đ tới tài khoản Blacklist với dấu hiệu lừa đảo phí hải quan.":
    "Detected a 5,000,000₫ transfer to a blacklisted account showing customs-fee scam signs.",
  "Phối hợp ngân hàng thụ hưởng tạm khóa cụm STK, lập hồ sơ gửi cơ quan công an và cảnh báo các khách hàng đã chuyển tiền.":
    "Work with the receiving banks to freeze the account cluster, file a police report and warn the customers who sent money.",
  "Cảnh báo người dùng, đưa tên miền vào Blacklist và rà soát nguồn quảng cáo dẫn link.":
    "Warn the user, add the domain to the Blacklist and review the ad source that spread the link.",
  // recipient
  "Người nhận chưa xác định": "Unidentified recipient",
  // biometric-policy reasons & legal basis
  "Lá Chắn AI xếp giao dịch ở mức rủi ro CAO": "AI Shield rated this transaction HIGH risk",
  "Giao dịch trên thiết bị mới/chưa tin cậy": "Transaction on a new / untrusted device",
  "TT 50/2024/TT-NHNN — cảnh báo giao dịch bất thường": "Circular 50/2024/TT-NHNN — unusual transaction alert",
  "QĐ 2345/QĐ-NHNN — ngưỡng trên 10 triệu VNĐ/lần": "Decision 2345/QĐ-NHNN — above 10 million VND per transaction",
  "QĐ 2345/QĐ-NHNN — ngưỡng lũy kế trên 20 triệu VNĐ/ngày":
    "Decision 2345/QĐ-NHNN — cumulative above 20 million VND per day",
  "TT 50/2024/TT-NHNN — ràng buộc thiết bị tin cậy": "Circular 50/2024/TT-NHNN — trusted device binding",
  // wallet history notes
  "Phiên kết thúc khi giao dịch đang tạm giữ — hệ thống tự hủy an toàn, tiền chưa bị trừ":
    "Session ended while the transaction was on hold — safely auto-cancelled, no money left the wallet",
  "Người dùng hủy giao dịch — số dư giữ nguyên": "Cancelled by the user — balance unchanged",
  "Đã tạo lệnh mới — giao dịch tạm giữ trước đó bị hủy, tiền chưa bị trừ":
    "A new order was created — the previous held transaction was cancelled, no money left the wallet",
  "FaceID đã xác thực sau 15 giây hạ nhiệt — người dùng xác nhận chuyển":
    "FaceID verified after the 15-second cool-off — confirmed by the user",
  "Fintech Ops đã chặn & đưa người nhận vào Blacklist": "Fintech Ops blocked it and blacklisted the recipient",
  "Đang tạm giữ — chờ Hạ nhiệt 15 giây, FaceID hoặc Người giám hộ duyệt":
    "On hold — waiting for the 15-second cool-off, FaceID or guardian approval",
  "Xác thực sinh trắc học theo TT 50 NHNN": "Biometric step-up under SBV Circular 50",
  // verify-face messages
  "Xác thực sinh trắc học AWS Rekognition thành công (Demo Mode)":
    "AWS Rekognition biometric verification succeeded (Demo Mode)",
  "Khuôn mặt không khớp với hồ sơ sinh trắc học đã đăng ký.":
    "The face does not match the registered biometric profile.",
};

type Rule = [RegExp, (match: RegExpMatchArray) => string];

const RULES_EN: readonly Rule[] = [
  [
    /^Tài khoản \/ Tên người nhận nằm trong danh sách đen \(Blacklist: (.+)\)$/,
    (m) => `Recipient account / name is on the Blacklist (${m[1]})`,
  ],
  [
    /^Giao dịch này sẽ làm vượt ngân sách mục '(.+?)' ([\d.]+) VNĐ\.$/,
    (m) => `This transaction would exceed the '${categoryNameEn(m[1])}' budget by ${m[2]} VND.`,
  ],
  [
    /^Chi tiêu nằm trong hạn mức '(.+?)'\. Số dư ngân sách còn lại sau giao dịch: ([\d.]+) VNĐ\.$/,
    (m) => `Spending is within the '${categoryNameEn(m[1])}' limit. Budget left after this transaction: ${m[2]} VND.`,
  ],
  [
    /^Giao dịch vượt hạn mức danh mục '(.+?)'\.$/,
    (m) => `This transaction exceeds the '${categoryNameEn(m[1])}' budget.`,
  ],
  [
    /^Hệ thống Lá chắn AI phát hiện rủi ro lừa đảo mức CAO \((\d+)\/100\) với kịch bản "(.+?)"\./,
    (m) =>
      `AI Shield detected a HIGH scam risk (${m[1]}/100) matching "${translateDataText(m[2], "en")}". Real authorities and legitimate prize programs never ask people to send money to personal accounts to "verify" them or to claim gifts.`,
  ],
  [
    /^Giao dịch có một số dấu hiệu bất thường \((\d+)\/100\)/,
    (m) => `This transaction shows some unusual signs (${m[1]}/100). Please double-check the recipient's identity before transferring.`,
  ],
  [
    /^Giao dịch thanh toán thuộc danh mục '(.+?)' có nội dung rõ ràng/,
    (m) => `This '${categoryNameEn(m[1])}' payment has a clear purpose and the recipient is not on any scam watchlist.`,
  ],
  [
    /^Phát hiện giao dịch rủi ro CAO \((\d+)đ\) chuyển ([\d.]+) VNĐ tới "(.+)" - Dấu hiệu: (.+)\.$/,
    (m) =>
      `HIGH-risk transaction detected (${m[1]} pts): ${m[2]} VND to "${translateDataText(m[3], "en")}" — pattern: ${translateDataText(m[4], "en")}.`,
  ],
  [
    /^Giao dịch chuyển ([\d.]+) VNĐ tới "(.+)" \((.+?)\) đã được AI kiểm tra an toàn\.$/,
    (m) => `Transfer of ${m[1]} VND to "${translateDataText(m[2], "en")}" (${categoryNameEn(m[3])}) was checked as safe by AI.`,
  ],
  [
    /^Giá trị giao dịch ([\d.,]+) VNĐ vượt ngưỡng ([\d.,]+) VNĐ\/lần$/,
    (m) => `Amount ${m[1]} VND exceeds the ${m[2]} VND per-transaction threshold`,
  ],
  [
    /^Tổng giao dịch trong ngày ([\d.,]+) VNĐ vượt ngưỡng ([\d.,]+) VNĐ\/ngày$/,
    (m) => `Today's total ${m[1]} VND exceeds the ${m[2]} VND daily threshold`,
  ],
  [
    /^Người giám hộ (.+) đã chặn & hủy giao dịch lúc (\d{1,2}:\d{2}) — đề nghị Ops xác minh và đưa người nhận vào Blacklist\.?$/,
    (m) => `Guardian ${m[1]} blocked and cancelled the transfer at ${m[2]} — Ops should verify and blacklist the recipient.`,
  ],
  [
    /^Người giám hộ (.+) đã xác nhận an toàn lúc (\d{1,2}:\d{2}) — giao dịch đã thực hiện, đề nghị Ops hậu kiểm\.?$/,
    (m) => `Guardian ${m[1]} confirmed it was safe at ${m[2]} — transfer executed, Ops post-review recommended.`,
  ],
  [
    /^Người giám hộ (.+) đã chặn & hủy giao dịch — số dư giữ nguyên$/,
    (m) => `Guardian ${m[1]} blocked and cancelled it — balance unchanged`,
  ],
  [
    /^Người giám hộ (.+) xác nhận an toàn — đã chuyển tiền$/,
    (m) => `Guardian ${m[1]} confirmed it was safe — money sent`,
  ],
  [
    /^Trích hạn mức '(.+?)' → '(.+?)'$/,
    (m) => `Budget moved '${categoryNameEn(m[1])}' → '${categoryNameEn(m[2])}'`,
  ],
  [
    /^Điều chuyển hạn mức từ '(.+?)' sang '(.+?)' để thanh toán$/,
    (m) => `Budget moved from '${categoryNameEn(m[1])}' to '${categoryNameEn(m[2])}' to cover the payment`,
  ],
  [
    /^Safe Shopping Agent phát hiện website rủi ro (LOW|MEDIUM|HIGH) \((\d+)đ\) khi thanh toán ([\d.]+)đ tại "(.+)"\.$/,
    (m) => `Safe Shopping Agent flagged a ${m[1]}-risk website (${m[2]} pts) for a ${m[3]}₫ payment at "${m[4]}".`,
  ],
  [
    /^Safe Shopping Agent — mua (.+)$/,
    (m) => `Safe Shopping Agent — bought ${m[1]}`,
  ],
  [
    /^Truy vết đường dây: (\d+) tài khoản khác nhau cùng chuyển tiền vào STK (\S+) trong (\d+) phút\. Đã phong tỏa cụm (\d+) STK liên quan và đồng bộ Blacklist sống sang Ví\.$/,
    (m) =>
      `Network trace: ${m[1]} different accounts sent money to account ${m[2]} within ${m[3]} minutes. A cluster of ${m[4]} linked accounts was frozen and the live Blacklist synced to the Wallet.`,
  ],
  [/^Cụm STK (\S+)$/, (m) => `Account cluster ${m[1]}`],
  [
    /^Xác thực khuôn mặt thành công qua Amazon Rekognition \(Độ khớp: ([\d.]+)%\)\.$/,
    (m) => `Face verified via Amazon Rekognition (similarity: ${m[1]}%).`,
  ],
];

/** Dịch một chuỗi dữ liệu tiếng Việt đã biết sang tiếng Anh (lang = "en"). */
export function translateDataText(text: string, lang: AppLanguage): string {
  if (lang !== "en" || !text) {
    return text;
  }

  // Ghép nhiều đoạn bằng " | " (vd tóm tắt ticket + ghi chú Người giám hộ).
  if (text.includes(" | ")) {
    return text
      .split(" | ")
      .map((segment) => translateDataText(segment, lang))
      .join(" | ");
  }

  const trimmed = text.trim();
  const exact = EXACT_EN[trimmed];
  if (exact !== undefined) {
    return localizeNumbersEn(exact);
  }

  for (const [pattern, render] of RULES_EN) {
    const match = trimmed.match(pattern);
    if (match) {
      return localizeNumbersEn(render(match));
    }
  }

  return text;
}

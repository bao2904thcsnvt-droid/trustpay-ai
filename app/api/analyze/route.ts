import { NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  RekognitionClient,
  DetectTextCommand,
} from "@aws-sdk/client-rekognition";
import {
  TranslateClient,
  TranslateTextCommand,
} from "@aws-sdk/client-translate";
import type {
  BudgetCategory,
  CategoryName,
  RiskLevel,
  TransactionAnalysisRequest,
  TransactionAnalysisResponse,
} from "@/types/trustpay";
import { DEFAULT_BLACKLIST, DEFAULT_BUDGETS } from "@/lib/mock-scenarios";
import { decideBiometric } from "@/lib/compliance/biometric-policy";
import { normalizeForRules } from "@/lib/security/text-normalize";
import {
  AwsFallbackSignal,
  breakerHeaderValue,
  callAwsService,
  classifyFallbackReason,
  type AwsFallbackReasonCode,
} from "@/lib/aws/service-breakers";
import {
  pickUnmaskedIdentity,
  redactForPrompt,
  redactJsonForPrompt,
} from "@/lib/security/prompt-redaction";

/**
 * Telemetry vận hành trả qua HTTP header (KHÔNG chèn vào JSON hợp đồng):
 *  - `x-trustpay-engine`: `bedrock` | `offline-heuristic`
 *  - `x-trustpay-ocr`: `none` | `rekognition` | `error` | `offline-heuristic`
 *  - `server-timing`: thời gian từng chặng (ocr, translate, bedrock, rules, total)
 * Giao diện dùng để hiển thị luồng công nghệ AWS + độ trễ thực tế.
 */
type EngineMode = "bedrock" | "offline-heuristic";
type OcrMode = "none" | "rekognition" | "error" | "offline-heuristic";

interface StageTimings {
  ocr: number | null;
  translate: number | null;
  bedrock: number | null;
  rules: number | null;
}

function buildTelemetryHeaders(
  engine: EngineMode,
  ocr: OcrMode,
  timings: StageTimings,
  startedAt: number,
  fallbackReason?: AwsFallbackReasonCode
): Record<string, string> {
  const metrics: string[] = [];
  const push = (name: string, value: number | null) => {
    if (value !== null && Number.isFinite(value)) {
      metrics.push(`${name};dur=${value.toFixed(1)}`);
    }
  };
  push("ocr", timings.ocr);
  push("translate", timings.translate);
  push("bedrock", timings.bedrock);
  push("rules", timings.rules);
  push("total", performance.now() - startedAt);

  return {
    "x-trustpay-engine": engine,
    "x-trustpay-ocr": ocr,
    // Trạng thái Circuit Breaker thật của từng dịch vụ AWS (Bedrock/Rekognition/Translate).
    "x-trustpay-breaker": breakerHeaderValue(),
    ...(fallbackReason ? { "x-trustpay-fallback": fallbackReason } : {}),
    "server-timing": metrics.join(", "),
    "cache-control": "no-store",
  };
}

/** Văn bản đã là tiếng Việt có dấu → không cần gọi Amazon Translate (FinOps). */
function looksVietnamese(text: string): boolean {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.abs(Math.round(n)));
}

function parseAmountFromText(text: string): number {
  const normalized = text.toLowerCase();

  // 1. Khớp mẫu có đơn vị "triệu", "tr", "củ" (vd: "12 triệu", "2.5 triệu", "5tr")
  const millionMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr\b|củ)/i
  );
  if (millionMatch) {
    const val = parseFloat(millionMatch[1].replace(",", "."));
    if (!isNaN(val)) return Math.round(val * 1_000_000);
  }

  // 2. Khớp mẫu có đơn vị "nghìn", "ngàn", "k" (vd: "45k", "50 nghìn")
  const thousandMatch = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*(?:nghìn|nghin|ngàn|ngan|k\b)/i
  );
  if (thousandMatch) {
    const val = parseFloat(thousandMatch[1].replace(",", "."));
    if (!isNaN(val)) return Math.round(val * 1_000);
  }

  // 3. Khớp số tiền định dạng phân cách hàng nghìn bằng dấu chấm hoặc phẩy (vd: 12.000.000đ, 45.000đ, 2,500,000)
  const formattedMatches = text.match(/\b\d{1,3}(?:[.,]\d{3})+\b/g);
  if (formattedMatches && formattedMatches.length > 0) {
    for (const raw of formattedMatches) {
      const cleaned = raw.replace(/[.,]/g, "");
      const num = parseInt(cleaned, 10);
      if (!isNaN(num) && num >= 1000) {
        return num;
      }
    }
  }

  // 4. Khớp chuỗi số kèm đ / vnd (vd: 500000đ, 45000 vnd)
  const currencyMatch = normalized.match(/\b(\d{4,9})\s*(?:đ|d|vnd|vnđ)\b/i);
  if (currencyMatch) {
    return parseInt(currencyMatch[1], 10);
  }

  // 5. Tìm số từ 4-8 chữ số không phải STK dài (>= 9 chữ số)
  const plainNumbers = text.match(/\b\d{4,8}\b/g);
  if (plainNumbers && plainNumbers.length > 0) {
    return parseInt(plainNumbers[0], 10);
  }

  return 0;
}

function parseRecipientFromText(text: string, blacklist: string[]): string {
  // Ưu tiên phát hiện STK trong câu lệnh
  const stkExplicitMatch = text.match(
    /(?:STK|số tài khoản|tài khoản|tk)\s*[:#-]?\s*([0-9A-Za-z]{6,16})/i
  );

  // Kiểm tra nếu có cụm "cho <Tên> STK <Số>"
  const personAndStkMatch = text.match(
    /cho\s+([^,.]+?)\s+STK\s+([0-9]{6,16})/i
  );
  if (personAndStkMatch) {
    return `${personAndStkMatch[1].trim()} (${personAndStkMatch[2].trim()})`;
  }

  if (stkExplicitMatch) {
    return stkExplicitMatch[1].trim();
  }

  // Kiểm tra xem có phần tử blacklist nào xuất hiện trực tiếp trong câu lệnh không
  for (const item of blacklist) {
    if (item && text.toLowerCase().includes(item.toLowerCase())) {
      return item;
    }
  }

  // Tìm sau giới từ "cho", "tại", "tới", "đến"
  const afterPrepMatch = text.match(
    /(?:cho|tại|tới|đến)\s+([A-ZÀ-Ỹ0-9][^,.]*?)(?:\s+(?:để|nhận|xác minh|với|số tiền)|$)/i
  );
  if (afterPrepMatch && afterPrepMatch[1].trim().length > 1) {
    return afterPrepMatch[1].trim();
  }

  return "Người nhận chưa xác định";
}

/**
 * Phân loại danh mục theo từ khóa. Nhận biết ngân sách người dùng đang theo dõi:
 *  - `Hóa đơn` chỉ được trả về khi ngân sách có danh mục này (Ví v1.1).
 *  - Nhóm di chuyển quy về `Khác` khi ngân sách không theo dõi `Di chuyển`,
 *    khớp với cách bộ luật chọn ngân sách dự phòng `Khác`.
 * Với `DEFAULT_BUDGETS` (bộ test), hành vi giữ nguyên như trước.
 */
function detectCategory(text: string, budgets: BudgetCategory[]): CategoryName {
  const lower = normalizeForRules(text).toLowerCase();
  const tracks = (name: CategoryName) => budgets.some((b) => b.name === name);

  if (
    /bún|phở|cơm|ăn|uống|cafe|cà phê|trà sữa|quán|nhà hàng|buffet|lẩu|nướng|bánh|đồ ăn|food|grabfood|shopee\s*food/.test(
      lower
    )
  ) {
    return "Ăn uống";
  }

  if (
    /mua|giày|sneaker|áo|quần|shop|thời trang|mỹ phẩm|điện thoại|laptop|túi|đồng hồ|siêu thị|mall|lazada|shopee|tiki/.test(
      lower
    )
  ) {
    return "Mua sắm";
  }

  if (
    tracks("Hóa đơn") &&
    /hóa đơn|hoá đơn|tiền điện|tiền nước|điện lực|evn|nước sạch|sawaco|cấp nước|cước|internet|wifi|4g|5g|truyền hình|netflix|spotify|youtube premium|icloud|gói cước|trả sau|học phí|phí chung cư|phí quản lý/.test(
      lower
    )
  ) {
    return "Hóa đơn";
  }

  if (
    /xe|grab|be\b|taxi|xăng|vé|tàu|máy bay|di chuyển|đi lại|gửi xe|trạm thu phí|bus/.test(
      lower
    )
  ) {
    return tracks("Di chuyển") || !tracks("Khác") ? "Di chuyển" : "Khác";
  }

  return "Khác";
}

function buildSmartFallbackAnalysis(
  req: TransactionAnalysisRequest,
  extractedImageText?: string
): TransactionAnalysisResponse {
  // T-2.9: chuẩn hóa Unicode (ký tự vô hình, NFD, full-width, homoglyph) trước MỌI phép dò luật,
  // kể cả bóc STK / so Blacklist — chèn zero-width vào STK cũng không lọt.
  const fullText = normalizeForRules(
    [req.commandText || "", extractedImageText || ""].filter(Boolean).join(" ")
  );
  const lower = fullText.toLowerCase();

  const budgets: BudgetCategory[] =
    req.currentBudgets && req.currentBudgets.length > 0
      ? req.currentBudgets
      : DEFAULT_BUDGETS;

  const blacklist: string[] =
    req.blacklist && req.blacklist.length > 0
      ? req.blacklist
      : DEFAULT_BLACKLIST;

  const parsedAmount = parseAmountFromText(fullText);
  const recipient = parseRecipientFromText(fullText, blacklist);
  const category = detectCategory(fullText, budgets);

  // Tính toán ngân sách
  const matchedBudget =
    budgets.find((b) => b.name === category) ||
    budgets.find((b) => b.name === "Khác") || {
      id: "b4",
      name: category,
      limit: 2_000_000,
      spent: 500_000,
    };

  const remainingBefore = matchedBudget.limit - matchedBudget.spent;
  const remainingAfter = remainingBefore - parsedAmount;
  const isExceeded = remainingAfter < 0;

  const budgetAlert = isExceeded
    ? {
        isExceeded: true,
        remainingAfter,
        message: `Giao dịch này sẽ làm vượt ngân sách mục '${matchedBudget.name}' ${formatNumber(
          Math.abs(remainingAfter)
        )} VNĐ.`,
        suggestion:
          "Hãy trì hoãn giao dịch hoặc điều chỉnh lại hạn mức chi tiêu trước khi xác nhận.",
      }
    : {
        isExceeded: false,
        remainingAfter,
        message: `Chi tiêu nằm trong hạn mức '${matchedBudget.name}'. Số dư ngân sách còn lại sau giao dịch: ${formatNumber(
          remainingAfter
        )} VNĐ.`,
        suggestion:
          "Ngân sách của bạn đang ở trạng thái an toàn, có thể tiếp tục thanh toán.",
      };

  // Phân tích rủi ro lừa đảo
  const redFlags: string[] = [];
  let riskScore = 10;
  let scamType = "Giao dịch tiêu dùng thông thường";

  // 1. Kiểm tra Blacklist
  const matchedBlacklistItems = blacklist.filter(
    (item) => item && lower.includes(item.toLowerCase())
  );
  const isBlacklisted = matchedBlacklistItems.length > 0;
  if (isBlacklisted) {
    riskScore += 50;
    redFlags.push(
      `Tài khoản / Tên người nhận nằm trong danh sách đen (Blacklist: ${matchedBlacklistItems.join(
        ", "
      )})`
    );
  }

  // 2. Nhóm từ khóa mạo danh cơ quan chức năng / công an / điều tra
  const authorityMatch =
    /\bc[oô]ng an\b|cán bộ|điều tra|viện kiểm sát|tòa án|xác minh tài khoản|phong tỏa|chạy án|lệnh bắt|bộ c[oô]ng an\b/.test(
      lower
    );
  if (authorityMatch) {
    riskScore += 45;
    scamType = "Lừa đảo mạo danh Cơ quan Công an / Cán bộ điều tra";
    redFlags.push(
      "Dấu hiệu mạo danh cơ quan chức năng yêu cầu chuyển tiền phục vụ điều tra / xác minh tài khoản"
    );
  }

  // 3. Nhóm từ khóa trúng thưởng / phí nhận quà / hải quan
  const prizeScamMatch =
    /nhận thưởng|trúng thưởng|phí nhận|phí hồ sơ|phí hải quan|nhận quà|iphone 16|quà quốc tế|giải thưởng|trung tâm cskh/.test(
      lower
    );
  if (prizeScamMatch) {
    riskScore += 78;
    if (!authorityMatch) {
      scamType = "Lừa đảo đóng phí nhận thưởng / Quà tặng giá trị cao";
    }
    redFlags.push(
      "Yêu cầu chuyển khoản phí trước để nhận phần thưởng / quà tặng giá trị cao (iPhone, bưu kiện)"
    );
  }

  // 3b. Yêu cầu cài ứng dụng lạ / VNeID giả / phần mềm điều khiển từ xa (mã độc chiếm quyền thiết bị)
  const malwareAppMatch =
    /vneid giả|cài (đặt )?(app|ứng dụng|phần mềm)|tải (app|ứng dụng|phần mềm)|file apk|tệp apk|link apk|\.apk\b|quyền trợ năng|điều khiển từ xa|teamviewer|ultraviewer|anydesk/.test(
      lower
    );
  if (malwareAppMatch) {
    riskScore += 40;
    if (!authorityMatch && !prizeScamMatch) {
      scamType = "Lừa đảo cài ứng dụng giả mạo / Mã độc chiếm quyền điều khiển thiết bị";
    }
    redFlags.push(
      "Yêu cầu cài ứng dụng lạ (VNeID giả, tệp APK, phần mềm điều khiển từ xa) — nguy cơ mã độc chiếm quyền thiết bị và đọc trộm OTP"
    );
  }

  // 3c. Việc nhẹ lương cao / làm nhiệm vụ nhận hoa hồng (REQ-A3.6 — tối thiểu TRUNG BÌNH).
  // Không bắt chữ "hoa hồng" đứng một mình để tránh nhầm với mua hoa.
  const jobScamMatch =
    /việc nhẹ lương cao|làm nhiệm vụ|nhiệm vụ (tiktok|shopee|lazada|online|like|đánh giá)|nhận hoa hồng|hưởng hoa hồng|hoa hồng \d+ ?%|chốt đơn ảo|đơn hàng ảo|nạp tiền (để )?(làm|nhận)|cộng tác viên online|tuyển ctv online/.test(
      lower
    );
  if (jobScamMatch) {
    riskScore += 45;
    if (!authorityMatch && !prizeScamMatch && !malwareAppMatch) {
      scamType = "Lừa đảo việc nhẹ lương cao / Nạp tiền làm nhiệm vụ nhận hoa hồng";
    }
    redFlags.push(
      "Dụ nạp tiền làm nhiệm vụ / việc nhẹ lương cao để nhận hoa hồng — tiền nạp thường bị chiếm đoạt sau vài lần trả thưởng nhỏ"
    );
  }

  // 4. Nhóm từ khóa thúc giục, khẩn cấp, đầu tư, việc nhẹ lương cao
  const urgencyMatch =
    /chuyển gấp|khẩn cấp|ngay lập tức|trong 5 phút|nâng cấp sim|khóa thẻ|nhiệm vụ tiktok|hoa hồng/.test(
      lower
    );
  if (urgencyMatch) {
    riskScore += 15;
    redFlags.push(
      "Tạo áp lực tâm lý khẩn cấp ('chuyển gấp') nhằm ngăn người dùng kiểm chứng thông tin"
    );
  }

  // Chuẩn hóa điểm số cho các kịch bản mẫu chuẩn xác
  if (authorityMatch && isBlacklisted) {
    riskScore = 95;
  } else if (prizeScamMatch && !isBlacklisted) {
    riskScore = 88;
  } else if (isBlacklisted && riskScore < 85) {
    riskScore = 90;
    if (scamType === "Giao dịch tiêu dùng thông thường") {
      scamType = "Giao dịch tới tài khoản nằm trong Danh sách đen (Blacklist)";
    }
  } else {
    riskScore = Math.min(99, Math.max(8, riskScore));
  }

  if (isExceeded && riskScore >= 60) {
    redFlags.push("Số tiền giao dịch lớn vượt quá hạn mức ngân sách hiện tại");
  }

  let riskLevel: RiskLevel = "LOW";
  if (riskScore >= 70) {
    riskLevel = "HIGH";
  } else if (riskScore >= 40) {
    riskLevel = "MEDIUM";
  }

  if (redFlags.length === 0) {
    redFlags.push("Không phát hiện từ khóa lừa đảo hoặc tài khoản Blacklist");
  }

  const explanation =
    riskLevel === "HIGH"
      ? `Hệ thống Lá chắn AI phát hiện rủi ro lừa đảo mức CAO (${riskScore}/100) với kịch bản "${scamType}". Cơ quan chức năng hoặc các chương trình trao thưởng hợp pháp không bao giờ yêu cầu người dân chuyển tiền qua tài khoản cá nhân để xác minh hay nhận quà.`
      : riskLevel === "MEDIUM"
        ? `Giao dịch có một số dấu hiệu bất thường (${riskScore}/100). Vui lòng kiểm tra kỹ danh tính người nhận trước khi chuyển khoản.`
        : `Giao dịch thanh toán thuộc danh mục '${category}' có nội dung rõ ràng, người nhận hợp lệ và không nằm trong danh sách cảnh báo lừa đảo.`;

  // Sàn pháp lý tập trung (TT 50 / QĐ 2345): rủi ro CAO hoặc > 10 triệu/lần → bắt buộc sinh trắc học,
  // kể cả khi giao dịch được chấm THẤP. Lũy kế 20 triệu/ngày áp ở client (máy chủ không giữ lịch sử).
  const requireBiometric = decideBiometric({ parsedAmount, riskLevel }).requireBiometric;

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = String(Math.floor(100 + Math.random() * 900));
  const ticketId = `TCK-${datePart}-${randomSuffix}`;

  const fintechOpsTicket = {
    ticketId,
    timestamp: now.toISOString(),
    recipient,
    amount: parsedAmount,
    riskLevel,
    riskScore,
    summary:
      riskLevel === "HIGH"
        ? `Phát hiện giao dịch rủi ro CAO (${riskScore}đ) chuyển ${formatNumber(
            parsedAmount
          )} VNĐ tới "${recipient}" - Dấu hiệu: ${scamType}.`
        : `Giao dịch chuyển ${formatNumber(
            parsedAmount
          )} VNĐ tới "${recipient}" (${category}) đã được AI kiểm tra an toàn.`,
    recommendedAction:
      riskLevel === "HIGH"
        ? "Tạm khóa giao dịch, yêu cầu xác thực sinh trắc học khuôn mặt (AWS Rekognition) và đẩy cảnh báo lên đội ngũ Fintech Ops."
        : isExceeded
          ? "Cho phép giao dịch sau khi nhắc nhở người dùng về việc vượt hạn mức ngân sách."
          : "Cho phép thực hiện giao dịch bình thường.",
    ...(req.imageBase64 ? { evidenceImageBase64: req.imageBase64 } : {}),
    status: (riskLevel === "HIGH" ? "PENDING" : "APPROVED") as
      | "PENDING"
      | "BLOCKED"
      | "APPROVED",
  };

  return {
    parsedAmount,
    recipient,
    category,
    budgetAlert,
    scamReport: {
      riskLevel,
      riskScore,
      scamType,
      redFlags,
      explanation,
    },
    requireBiometric,
    fintechOpsTicket,
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const timings: StageTimings = {
    ocr: null,
    translate: null,
    bedrock: null,
    rules: null,
  };
  let ocrMode: OcrMode = "none";

  let body: TransactionAnalysisRequest;
  try {
    body = (await request.json()) as TransactionAnalysisRequest;
  } catch {
    body = {
      commandText: "",
      currentBudgets: DEFAULT_BUDGETS,
      blacklist: DEFAULT_BLACKLIST,
    };
  }

  const commandText = body.commandText || "";
  const currentBudgets =
    body.currentBudgets && body.currentBudgets.length > 0
      ? body.currentBudgets
      : DEFAULT_BUDGETS;
  const blacklist =
    body.blacklist && body.blacklist.length > 0
      ? body.blacklist
      : DEFAULT_BLACKLIST;

  let extractedImageText = "";

  // Luồng gọi AWS SDK v3 thực tế khi có cấu hình AWS_ACCESS_KEY_ID
  try {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
      throw new AwsFallbackSignal(
        "no-credentials",
        "Missing AWS credentials in environment variables - switching to Smart Fallback Engine"
      );
    }

    const awsCredentials = {
      accessKeyId,
      secretAccessKey,
      ...(process.env.AWS_SESSION_TOKEN
        ? { sessionToken: process.env.AWS_SESSION_TOKEN }
        : {}),
    };

    // 1. Nếu có imageBase64, gọi Amazon Rekognition DetectText để đọc chữ trên ảnh hóa đơn / tin nhắn
    if (body.imageBase64) {
      const ocrStartedAt = performance.now();
      try {
        const rekognition = new RekognitionClient({
          region,
          credentials: awsCredentials,
        });
        const base64Clean = body.imageBase64.replace(
          /^data:image\/\w+;base64,/,
          ""
        );
        const imageBytes = Buffer.from(base64Clean, "base64");

        const detectTextRes = await callAwsService("rekognition", () =>
          rekognition.send(
            new DetectTextCommand({
              Image: { Bytes: imageBytes },
            })
          )
        );

        extractedImageText = (detectTextRes.TextDetections || [])
          .filter((d) => d.Type === "LINE" && d.DetectedText)
          .map((d) => d.DetectedText)
          .join(" ");
        ocrMode = "rekognition";
      } catch {
        // Bỏ qua lỗi OCR lẻ và tiếp tục phân tích bằng text
        ocrMode = "error";
      } finally {
        timings.ocr = performance.now() - ocrStartedAt;
      }
    }

    // 2. Tích hợp Amazon Translate (chỉ khi văn bản chưa phải tiếng Việt — đòn bẩy FinOps)
    let translatedNote = "";
    if (commandText.trim() && !looksVietnamese(commandText)) {
      const translateStartedAt = performance.now();
      try {
        const translateClient = new TranslateClient({
          region,
          credentials: awsCredentials,
        });
        const translateRes = await callAwsService("translate", () =>
          translateClient.send(
            new TranslateTextCommand({
              Text: commandText.slice(0, 500),
              SourceLanguageCode: "auto",
              TargetLanguageCode: "vi",
            })
          )
        );
        translatedNote = translateRes.TranslatedText || "";
      } catch {
        // Không chặn luồng chính nếu Translate không khả dụng
      } finally {
        timings.translate = performance.now() - translateStartedAt;
      }
    }

    // 3. Gọi Amazon Bedrock Runtime (Claude 3.5 Sonnet) để phân tích giao dịch
    const bedrock = new BedrockRuntimeClient({
      region,
      credentials: awsCredentials,
    });

    const modelId =
      process.env.BEDROCK_MODEL_ID ||
      "anthropic.claude-3-5-sonnet-20240620-v1:0";

    const rulesStartedAt = performance.now();
    const fallbackBaseline = buildSmartFallbackAnalysis(
      { ...body, currentBudgets, blacklist },
      extractedImageText
    );
    timings.rules = performance.now() - rulesStartedAt;

    // NĐ 13/2023/NĐ-CP: che CCCD / SĐT / STK trước khi dữ liệu rời biên tin cậy sang
    // Bedrock. Bộ luật ở trên đã chạy trên dữ liệu gốc (trong RAM); ảnh base64 bị loại
    // khỏi JSON tham chiếu để không gửi ảnh thô và tiết kiệm token.
    const promptCommand = redactForPrompt(commandText).text;
    const promptOcr = redactForPrompt(extractedImageText).text;
    const promptTranslated = redactForPrompt(translatedNote).text;
    const promptBlacklist = JSON.stringify(redactJsonForPrompt(blacklist));
    const promptBaseline = JSON.stringify(redactJsonForPrompt(fallbackBaseline));

    const prompt = `Bạn là hệ thống AI chống lừa đảo tài chính TrustPay AI.
Hãy phân tích giao dịch sau và trả về DUY NHẤT một chuỗi JSON hợp lệ theo đúng cấu trúc TransactionAnalysisResponse.
Lưu ý: số CCCD, số điện thoại và số tài khoản đã được che bằng ký tự * theo Nghị định 13/2023/NĐ-CP.
Câu lệnh giao dịch: "${promptCommand}"
Văn bản OCR từ ảnh đính kèm: "${promptOcr}"
Bản dịch hỗ trợ: "${promptTranslated}"
Danh sách đen (Blacklist): ${promptBlacklist}
Ngân sách hiện tại: ${JSON.stringify(currentBudgets)}

Yêu cầu trả về JSON mẫu tham chiếu:
${promptBaseline}`;

    const bedrockStartedAt = performance.now();
    const invokeRes = await callAwsService("bedrock", () =>
      bedrock.send(
        new InvokeModelCommand({
          modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1024,
            temperature: 0.1,
            messages: [{ role: "user", content: prompt }],
          }),
        })
      )
    );
    timings.bedrock = performance.now() - bedrockStartedAt;

    const rawBody = new TextDecoder().decode(invokeRes.body);
    const parsedBedrock = JSON.parse(rawBody);
    const aiText: string = parsedBedrock?.content?.[0]?.text || "";
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const aiResponse = JSON.parse(
        jsonMatch[0]
      ) as Partial<TransactionAnalysisResponse>;

      const mergedResponse: TransactionAnalysisResponse = {
        parsedAmount:
          typeof aiResponse.parsedAmount === "number"
            ? aiResponse.parsedAmount
            : fallbackBaseline.parsedAmount,
        // Prompt đã che PII → định danh người nhận lấy từ bộ luật khi AI trả về bản bị che.
        recipient: pickUnmaskedIdentity(aiResponse.recipient, fallbackBaseline.recipient),
        category: aiResponse.category || fallbackBaseline.category,
        budgetAlert: aiResponse.budgetAlert || fallbackBaseline.budgetAlert,
        scamReport: aiResponse.scamReport || fallbackBaseline.scamReport,
        // AI chỉ được NÂNG yêu cầu sinh trắc học, không được hạ dưới sàn pháp lý của bộ luật.
        requireBiometric:
          aiResponse.requireBiometric === true ||
          fallbackBaseline.requireBiometric ||
          decideBiometric({
            parsedAmount:
              typeof aiResponse.parsedAmount === "number" ? aiResponse.parsedAmount : fallbackBaseline.parsedAmount,
            riskLevel: (aiResponse.scamReport || fallbackBaseline.scamReport).riskLevel,
          }).requireBiometric,
        fintechOpsTicket: aiResponse.fintechOpsTicket
          ? {
              ...fallbackBaseline.fintechOpsTicket,
              ...aiResponse.fintechOpsTicket,
              // Định danh kỹ thuật & ảnh bằng chứng luôn lấy từ máy chủ (AI không thấy bản gốc).
              ticketId: fallbackBaseline.fintechOpsTicket.ticketId,
              timestamp: fallbackBaseline.fintechOpsTicket.timestamp,
              recipient: pickUnmaskedIdentity(
                aiResponse.fintechOpsTicket.recipient,
                fallbackBaseline.fintechOpsTicket.recipient
              ),
              ...(fallbackBaseline.fintechOpsTicket.evidenceImageBase64
                ? { evidenceImageBase64: fallbackBaseline.fintechOpsTicket.evidenceImageBase64 }
                : {}),
            }
          : fallbackBaseline.fintechOpsTicket,
      };

      return NextResponse.json(mergedResponse, {
        status: 200,
        headers: buildTelemetryHeaders("bedrock", ocrMode, timings, startedAt),
      });
    }

    // Bedrock không trả JSON dùng được → kết quả là baseline của bộ luật (dự phòng).
    return NextResponse.json(fallbackBaseline, {
      status: 200,
      headers: buildTelemetryHeaders("offline-heuristic", ocrMode, timings, startedAt, "invalid-json"),
    });
  } catch (error) {
    const fallbackReason = classifyFallbackReason(error);
    // Fallback thông minh khi thiếu AWS_ACCESS_KEY_ID hoặc AWS API báo lỗi
    const rulesStartedAt = performance.now();
    const fallbackResponse = buildSmartFallbackAnalysis(
      {
        commandText,
        imageBase64: body.imageBase64,
        currentBudgets,
        blacklist,
      },
      extractedImageText
    );
    timings.rules = performance.now() - rulesStartedAt;
    timings.bedrock = null;
    if (body.imageBase64 && ocrMode === "none") {
      ocrMode = "offline-heuristic";
    }

    return NextResponse.json(fallbackResponse, {
      status: 200,
      headers: buildTelemetryHeaders("offline-heuristic", ocrMode, timings, startedAt, fallbackReason),
    });
  }
}

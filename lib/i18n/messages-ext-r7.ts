import type {
  AgentStepId,
  AgentStepStatus,
  FindingCode,
  RiskSourceId,
  ScamScenarioId,
} from "@/lib/investigation-agent";
import type { FeatureKey } from "@/lib/behavioral-ml";
import type { AuditKind, ChainVerification } from "@/lib/audit-chain";

/**
 * Từ điển VI/EN vòng 7 — ProMax: AI Agent điều tra 4 bước, Edge ML hành vi, CV Forensics (ELA,
 * viền QR), XAI SHAP, đồ thị tài khoản trung gian, chuỗi Audit SHA-256. Trộn vào `Messages`
 * trong `lib/i18n/messages.ts`; bản tiếng Anh dùng kiểu suy ra từ bản tiếng Việt.
 */

type StepText = Record<AgentStepId, { title: string; thought: string; tool: string }>;

const viScenario: Record<ScamScenarioId, string> = {
  POLICE_VNEID: "Giả danh Công an / VNeID cập nhật định danh",
  SHIPPER_CARD: "Shipper báo đơn lỗi / kích hoạt thẻ",
  CTV_INVEST: "Tuyển CTV / Đầu tư hoàn tiền",
  RELATIVE_BOSS: "Người thân / Sếp nhắn nhờ chuyển gấp",
  REMOTE_CONTROL: "Chiếm quyền điều khiển màn hình",
};

const enScenario: Record<ScamScenarioId, string> = {
  POLICE_VNEID: "Police / VNeID identity-update impersonation",
  SHIPPER_CARD: "Shipper failed-order / card activation",
  CTV_INVEST: "Fake part-time job / refund investment",
  RELATIVE_BOSS: "Relative / boss urgent transfer request",
  REMOTE_CONTROL: "Remote screen-control takeover",
};

function viFinding(code: FindingCode, value = ""): string {
  switch (code) {
    case "NO_QR":
      return "Không có mã VietQR — bỏ qua kiểm tra mật mã.";
    case "QR_BUILT_OK":
      return `Dựng mã VietQR cho người nhận, CRC-16 tự kiểm khớp (${value}).`;
    case "CRC_OK":
      return `CRC-16/CCITT-FALSE (0x1021) khớp: ${value}.`;
    case "CRC_MISMATCH":
      return `CRC-16 KHÔNG khớp (${value}) — payload QR đã bị sửa.`;
    case "CRC_MISSING":
      return "Thiếu trường CRC (tag 63) — mã không đúng chuẩn EMVCo.";
    case "QR_PARSE_FAILED":
      return "Không bóc tách được cấu trúc TLV EMVCo.";
    case "BIN_KNOWN":
      return `BIN NAPAS hợp lệ: ${value}.`;
    case "BIN_UNKNOWN":
      return `BIN ${value} không có trong danh bạ NAPAS.`;
    case "ACCOUNT_MISMATCH":
      return `STK trong mã (${value}) khác STK người nhận đã chọn.`;
    case "HISTORY_EMPTY":
      return "Chưa có lịch sử chi tiêu để so sánh.";
    case "AMOUNT_RATIO":
      return `Số tiền gấp ${value} trung bình lịch sử (> ×5).`;
    case "AMOUNT_NORMAL":
      return `Số tiền ${value} trung bình — trong thói quen.`;
    case "NIGHT_HOUR":
      return `Khung giờ ${value} (22h–05h) — ngoài thói quen giao dịch.`;
    case "DAY_HOUR":
      return `Khung giờ ${value} — bình thường.`;
    case "NEW_RECIPIENT":
      return "Người nhận mới (chưa từng chuyển).";
    case "KNOWN_RECIPIENT":
      return "Người nhận đã từng giao dịch.";
    case "SCENARIO":
      return `Kịch bản lừa đảo: ${viScenario[value as ScamScenarioId] ?? value}.`;
    case "INJECTION":
      return "Phát hiện Prompt Injection trong nội dung — đã vô hiệu hóa, coi là dấu hiệu tấn công.";
    case "BLACKLIST":
      return `Trùng Blacklist: ${value}.`;
    case "CLEAN_TEXT":
      return "Không thấy ngôn ngữ thao túng hay chỉ thị độc hại.";
    case "LLM_SCORE":
      return `Lá chắn LLM: ${value}.`;
    case "ML_SCORE":
      return `Edge ML hành vi: ${value} khả năng bị cưỡng ép.`;
    case "FUSED_SCORE":
      return `Điểm hợp nhất (noisy-OR, sàn ADR-1): ${value}.`;
    case "TT50_SINGLE":
      return "Vượt 10.000.000đ/lần (TT 50) — bắt buộc sinh trắc học.";
    case "TT50_DAILY":
      return "Lũy kế ngày vượt 20.000.000đ (TT 50) — bắt buộc sinh trắc học.";
    case "POLICY_BIOMETRIC":
      return "Chính sách: xác thực Sinh trắc học / Passkey trước khi mở mã VietQR.";
    case "POLICY_COOLING":
      return "Chính sách: Hạ nhiệt 15 giây + Người giám hộ duyệt.";
    case "POLICY_ALLOW":
      return "Chính sách: cho phép — mở mã VietQR chuyển thật.";
  }
}

function enFinding(code: FindingCode, value = ""): string {
  switch (code) {
    case "NO_QR":
      return "No VietQR code — cryptographic check skipped.";
    case "QR_BUILT_OK":
      return `Built the recipient's VietQR; CRC-16 self-check matches (${value}).`;
    case "CRC_OK":
      return `CRC-16/CCITT-FALSE (0x1021) matches: ${value}.`;
    case "CRC_MISMATCH":
      return `CRC-16 does NOT match (${value}) — the QR payload was altered.`;
    case "CRC_MISSING":
      return "Missing CRC field (tag 63) — not a valid EMVCo code.";
    case "QR_PARSE_FAILED":
      return "Could not parse the EMVCo TLV structure.";
    case "BIN_KNOWN":
      return `Valid NAPAS BIN: ${value}.`;
    case "BIN_UNKNOWN":
      return `BIN ${value} is not in the NAPAS directory.`;
    case "ACCOUNT_MISMATCH":
      return `The account in the code (${value}) differs from the chosen recipient.`;
    case "HISTORY_EMPTY":
      return "No spending history to compare yet.";
    case "AMOUNT_RATIO":
      return `Amount is ${value} the historical average (> ×5).`;
    case "AMOUNT_NORMAL":
      return `Amount is ${value} the average — within habit.`;
    case "NIGHT_HOUR":
      return `Time ${value} (22h–05h) — outside your usual hours.`;
    case "DAY_HOUR":
      return `Time ${value} — normal.`;
    case "NEW_RECIPIENT":
      return "New recipient (never paid before).";
    case "KNOWN_RECIPIENT":
      return "Recipient seen in your history.";
    case "SCENARIO":
      return `Scam scenario: ${enScenario[value as ScamScenarioId] ?? value}.`;
    case "INJECTION":
      return "Prompt injection found in the content — neutralised and treated as an attack signal.";
    case "BLACKLIST":
      return `Blacklist match: ${value}.`;
    case "CLEAN_TEXT":
      return "No manipulative language or malicious instructions found.";
    case "LLM_SCORE":
      return `LLM shield: ${value}.`;
    case "ML_SCORE":
      return `Behavioural edge ML: ${value} likelihood of coercion.`;
    case "FUSED_SCORE":
      return `Fused score (noisy-OR, ADR-1 floor): ${value}.`;
    case "TT50_SINGLE":
      return "Above 10,000,000₫ per transaction (Circular 50) — biometrics required.";
    case "TT50_DAILY":
      return "Daily total above 20,000,000₫ (Circular 50) — biometrics required.";
    case "POLICY_BIOMETRIC":
      return "Policy: biometric / passkey verification before the VietQR code opens.";
    case "POLICY_COOLING":
      return "Policy: 15-second cool-off + Guardian approval.";
    case "POLICY_ALLOW":
      return "Policy: allowed — real VietQR transfer code unlocked.";
  }
}

const viSteps: StepText = {
  verify_vietqr_cryptography: {
    title: "Bước 1 · Xác minh mật mã VietQR",
    thought: "Mã QR có đúng chuẩn EMVCo và chưa bị sửa không?",
    tool: "verify_vietqr_cryptography(payload)",
  },
  analyze_behavioral_velocity: {
    title: "Bước 2 · Phân tích hành vi & tốc độ",
    thought: "Số tiền, người nhận và giờ giao dịch có khác thói quen không?",
    tool: "analyze_behavioral_velocity(history, amount, hour)",
  },
  detect_social_engineering_and_injection: {
    title: "Bước 3 · Lừa đảo phi kỹ thuật & Prompt Injection",
    thought: "Nội dung có kịch bản lừa đảo hoặc chỉ thị độc hại không?",
    tool: "detect_social_engineering_and_injection(text)",
  },
  enforce_tt50_security_policy: {
    title: "Bước 4 · Áp chính sách TT 50 NHNN",
    thought: "Hợp nhất điểm đa nguồn và chọn hàng rào bảo vệ tương xứng.",
    tool: "enforce_tt50_security_policy(scores, amount, daily)",
  },
};

const enSteps: StepText = {
  verify_vietqr_cryptography: {
    title: "Step 1 · Verify VietQR cryptography",
    thought: "Is the QR code valid EMVCo and untampered?",
    tool: "verify_vietqr_cryptography(payload)",
  },
  analyze_behavioral_velocity: {
    title: "Step 2 · Behavioural velocity analysis",
    thought: "Do the amount, recipient and time differ from your habits?",
    tool: "analyze_behavioral_velocity(history, amount, hour)",
  },
  detect_social_engineering_and_injection: {
    title: "Step 3 · Social engineering & prompt injection",
    thought: "Does the content contain a scam script or malicious instructions?",
    tool: "detect_social_engineering_and_injection(text)",
  },
  enforce_tt50_security_policy: {
    title: "Step 4 · Enforce SBV Circular 50 policy",
    thought: "Fuse multi-source scores and pick the matching safeguard.",
    tool: "enforce_tt50_security_policy(scores, amount, daily)",
  },
};

export const viExtR7 = {
  pm: {
    agentTitle: "AI Agent điều tra gian lận — 4 bước",
    agentSubtitle: "Thought → Tool Call → Observation → Verdict, chạy ngay trên máy (offline được).",
    engine: (engine: "OFFLINE_AGENT" | "LLM_FUSED"): string =>
      engine === "LLM_FUSED" ? "Agent + Lá chắn LLM" : "Agent offline",
    thought: "Thought",
    tool: "Tool",
    observation: "Observation",
    verdict: "Verdict",
    steps: viSteps,
    status: { pass: "Đạt", warn: "Cảnh báo", fail: "Nguy hiểm", skip: "Bỏ qua" } as Record<AgentStepStatus, string>,
    finding: viFinding,
    scenario: viScenario,
    finalVerdict: (score: number, level: string): string => `Kết luận: ${score}/100 · ${level}`,
    replay: "Chạy lại suy luận",
    mlTitle: "Edge ML · Xác suất bị cưỡng ép / bất thường",
    mlHint: "Mô hình hồi quy logistic chuẩn hóa chạy trên máy, chỉ dùng nhịp gõ phím, tỷ lệ dán, tốc độ thao tác, cuộc gọi và độ lệch số tiền — không gửi dữ liệu thô đi.",
    mlHigh: "Bất thường cao — yêu cầu thêm xác thực sinh trắc học.",
    mlLow: "Hành vi thao tác bình thường.",
    feature: {
      keystrokeHesitationMs: "Nhịp gõ phím ngập ngừng",
      clipboardPasteRatio: "Tỷ lệ dán từ bộ nhớ tạm",
      flowVelocityScore: "Thao tác vội vàng",
      activeCallRisk: "Đang nghe cuộc gọi lạ",
      amountZScore: "Độ lệch số tiền so với lịch sử",
    } as Record<FeatureKey, string>,
    cv: {
      title: "Soi ảnh Bill / Hóa đơn thật-giả (CV Forensics)",
      subtitle: "Error Level Analysis: tái nén JPEG 0.85, khuếch đại sai phân ×15 để lộ vùng chữ số / tên bị cắt ghép.",
      pick: "Chọn ảnh chụp màn hình chuyển khoản",
      running: "Đang phân tích từng điểm ảnh…",
      score: (score: number): string => `Tampering Score: ${score}/100`,
      verdict: (score: number): string =>
        score >= 60
          ? "⛔ Nhiều khả năng ảnh đã bị chỉnh sửa cục bộ"
          : score >= 30
            ? "⚠️ Có vùng nén bất thường — hãy kiểm tra lại với ngân hàng"
            : "✅ Không thấy dấu hiệu cắt ghép rõ rệt",
      blocks: (count: number, total: number): string => `${count}/${total} khối 16×16 có lỗi nén ngoại lai`,
      heatmap: "Bản đồ nhiệt pháp y",
      original: "Ảnh gốc",
      overlay: "Chồng bản đồ nhiệt",
      failed: "Không phân tích được ảnh này.",
      note: "ELA là phép thử pháp y gợi ý, không thay thế xác nhận giao dịch trực tiếp từ ngân hàng. Ảnh xử lý trong bộ nhớ, không gửi đi.",
    },
    qrOverlay: (score: number): string =>
      `⚠️ Viền mã QR có đường biên thẳng bao quanh — nghi tem dán đè lên mã gốc (${score}/100). Đối chiếu tên chủ tài khoản trước khi trả.`,
    qrOverlayOk: "Viền mã QR sạch — không thấy tem dán đè.",
    ops: {
      title: "Data Science & Explainable AI",
      xaiTitle: "SHAP · Đóng góp từng yếu tố vào quyết định gần nhất",
      xaiEmpty: "Hãy phân tích một giao dịch để xem giải thích của mô hình.",
      xaiNote: "Giá trị SHAP chính xác cho mô hình tuyến tính: φᵢ = wᵢ·zᵢ (không gian logit), quy đổi thành tỷ trọng %.",
      sourcesTitle: "Nguồn rủi ro của Agent (phân rã noisy-OR chính xác)",
      sources: {
        qr: "Mật mã VietQR",
        velocity: "Hành vi & tốc độ ngoài thói quen",
        social: "Ngôn ngữ thao túng / Injection / Blacklist",
        ml: "Edge ML hành vi",
      } as Record<RiskSourceId, string>,
      featureTitle: "Yếu tố hành vi (SHAP)",
      probability: (pct: number): string => `Xác suất cưỡng ép: ${pct}%`,
      graphTitle: "Đồ thị mạng lưới tài khoản trung gian (Mule Graph)",
      graphHub: "STK trung chuyển",
      graphVictims: "Nguồn chuyển đến",
      graphMules: "Cụm STK liên quan",
      graphBlocked: "Đã chặn",
      graphLive: "Đang theo dõi",
      auditTitle: "Chuỗi Nhật ký Kiểm toán SHA-256",
      auditSubtitle: "Mỗi bản ghi chứa mã băm của bản ghi trước — sửa một dòng là chuỗi gãy.",
      auditVerify: "Xác minh tính toàn vẹn chuỗi Audit (SHA-256)",
      auditVerifying: "Đang băm lại toàn bộ chuỗi…",
      auditEmpty: "Chưa có bản ghi kiểm toán nào.",
      auditResult: (result: ChainVerification): string =>
        result.reason === "EMPTY"
          ? "Chuỗi rỗng."
          : result.ok
            ? `✅ Toàn vẹn — ${result.checked} bản ghi khớp mã băm.`
            : `⛔ Chuỗi bị sửa tại bản ghi #${result.brokenAt ?? "?"} (${result.reason}).`,
      kinds: {
        ANALYSIS: "Phân tích giao dịch",
        GUARDIAN: "Người giám hộ",
        OPS_BLOCK: "Ops chặn",
        OPS_APPROVE: "Ops duyệt",
        QR_INSPECT: "Soi mã QR",
        BANK_LINK: "Liên kết ngân hàng",
      } as Record<AuditKind, string>,
    },
  },
};

export type ExtR7Messages = typeof viExtR7;

export const enExtR7: ExtR7Messages = {
  pm: {
    agentTitle: "Fraud-investigation AI Agent — 4 steps",
    agentSubtitle: "Thought → Tool Call → Observation → Verdict, running on-device (works offline).",
    engine: (engine) => (engine === "LLM_FUSED" ? "Agent + LLM shield" : "Offline agent"),
    thought: "Thought",
    tool: "Tool",
    observation: "Observation",
    verdict: "Verdict",
    steps: enSteps,
    status: { pass: "Pass", warn: "Warning", fail: "Danger", skip: "Skipped" },
    finding: enFinding,
    scenario: enScenario,
    finalVerdict: (score, level) => `Verdict: ${score}/100 · ${level}`,
    replay: "Replay reasoning",
    mlTitle: "Edge ML · Coercion / anomaly probability",
    mlHint: "A standardised logistic-regression model runs on-device using only keystroke rhythm, paste ratio, flow speed, calls and amount deviation — no raw data leaves the device.",
    mlHigh: "High anomaly — extra biometric verification required.",
    mlLow: "Normal interaction behaviour.",
    feature: {
      keystrokeHesitationMs: "Hesitant keystroke rhythm",
      clipboardPasteRatio: "Clipboard paste ratio",
      flowVelocityScore: "Rushed interaction",
      activeCallRisk: "On a suspicious call",
      amountZScore: "Amount deviation from history",
    },
    cv: {
      title: "Check a receipt / bill for forgery (CV Forensics)",
      subtitle: "Error Level Analysis: re-compress as JPEG 0.85 and amplify differences ×15 to reveal spliced digits / names.",
      pick: "Choose a transfer screenshot",
      running: "Analysing every pixel…",
      score: (score) => `Tampering Score: ${score}/100`,
      verdict: (score) =>
        score >= 60
          ? "⛔ The image was very likely edited locally"
          : score >= 30
            ? "⚠️ Unusual compression regions — confirm with the bank"
            : "✅ No clear signs of splicing",
      blocks: (count, total) => `${count}/${total} 16×16 blocks with outlier compression error`,
      heatmap: "Forensic heatmap",
      original: "Original",
      overlay: "Heatmap overlay",
      failed: "Could not analyse this image.",
      note: "ELA is an indicative forensic test and does not replace confirming the transaction with the bank. The image stays in memory and is never uploaded.",
    },
    qrOverlay: (score) =>
      `⚠️ A straight border surrounds the QR code — possible sticker over the original (${score}/100). Check the account holder name before paying.`,
    qrOverlayOk: "QR border is clean — no overlay sticker detected.",
    ops: {
      title: "Data Science & Explainable AI",
      xaiTitle: "SHAP · Contribution of each factor to the latest decision",
      xaiEmpty: "Analyse a transaction to see the model explanation.",
      xaiNote: "Exact SHAP values for a linear model: φᵢ = wᵢ·zᵢ (logit space), shown as % shares.",
      sourcesTitle: "Agent risk sources (exact noisy-OR decomposition)",
      sources: {
        qr: "VietQR cryptography",
        velocity: "Off-habit behaviour & velocity",
        social: "Manipulative language / injection / Blacklist",
        ml: "Behavioural edge ML",
      },
      featureTitle: "Behavioural factors (SHAP)",
      probability: (pct) => `Coercion probability: ${pct}%`,
      graphTitle: "Mule account fraud graph",
      graphHub: "Hub account",
      graphVictims: "Inbound sources",
      graphMules: "Linked accounts",
      graphBlocked: "Blocked",
      graphLive: "Monitoring",
      auditTitle: "SHA-256 audit hash chain",
      auditSubtitle: "Every record holds the hash of the previous one — editing a line breaks the chain.",
      auditVerify: "Verify audit chain integrity (SHA-256)",
      auditVerifying: "Re-hashing the whole chain…",
      auditEmpty: "No audit records yet.",
      auditResult: (result) =>
        result.reason === "EMPTY"
          ? "The chain is empty."
          : result.ok
            ? `✅ Intact — ${result.checked} records match their hashes.`
            : `⛔ Chain tampered at record #${result.brokenAt ?? "?"} (${result.reason}).`,
      kinds: {
        ANALYSIS: "Transaction analysis",
        GUARDIAN: "Guardian",
        OPS_BLOCK: "Ops block",
        OPS_APPROVE: "Ops approve",
        QR_INSPECT: "QR inspection",
        BANK_LINK: "Bank linking",
      },
    },
  },
};

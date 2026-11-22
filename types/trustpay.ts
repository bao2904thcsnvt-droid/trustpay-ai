export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Danh mục chi tiêu.
 *
 * v1.1: bổ sung thành viên `'Hóa đơn'` (mở rộng union theo hướng cộng thêm) để Ví
 * theo dõi 4 danh mục `Ăn uống`, `Mua sắm`, `Hóa đơn`, `Khác`. Giá trị cũ
 * `'Di chuyển'` được giữ nguyên để tương thích ngược với API, bộ test và Lambda.
 */
export type CategoryName = 'Ăn uống' | 'Mua sắm' | 'Di chuyển' | 'Hóa đơn' | 'Khác';

export interface BudgetCategory {
  id: string;
  name: CategoryName;
  limit: number;
  spent: number;
}

export interface TransactionAnalysisRequest {
  commandText: string;
  imageBase64?: string;
  currentBudgets: BudgetCategory[];
  blacklist: string[];
}

export interface BudgetAlert {
  isExceeded: boolean;
  remainingAfter: number;
  message: string;
  suggestion: string;
}

export interface ScamReport {
  riskLevel: RiskLevel;
  riskScore: number;
  scamType: string;
  redFlags: string[];
  explanation: string;
}

export interface FintechOpsTicket {
  ticketId: string;
  timestamp: string;
  recipient: string;
  amount: number;
  riskLevel: RiskLevel;
  riskScore: number;
  summary: string;
  recommendedAction: string;
  evidenceImageBase64?: string;
  status: 'PENDING' | 'BLOCKED' | 'APPROVED';
}

export interface TransactionAnalysisResponse {
  parsedAmount: number;
  recipient: string;
  category: CategoryName;
  budgetAlert: BudgetAlert;
  scamReport: ScamReport;
  requireBiometric: boolean;
  fintechOpsTicket: FintechOpsTicket;
}

export interface VerifyFaceRequest {
  selfieBase64: string;
}

export interface VerifyFaceResponse {
  matched: boolean;
  similarity: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Mở rộng v1.1 — Ví Fintech thực tế (chỉ BỔ SUNG type mới).
// Hợp đồng JSON của /api/analyze và /api/verify-face trong API_CONTRACT.md giữ
// nguyên; các type dưới đây chỉ dùng cho trạng thái phía client (localStorage),
// telemetry qua HTTP header và các trợ lý AI chạy trên trình duyệt.
// ---------------------------------------------------------------------------

/** Ngôn ngữ giao diện. */
export type AppLanguage = 'vi' | 'en';

/** Kênh phát sinh giao dịch trong lịch sử ví. */
export type WalletTransactionChannel = 'TRANSFER' | 'SHOPPING' | 'BUDGET_REALLOCATION';

/** Trạng thái giao dịch trong lịch sử ví. `FROZEN` = đang tạm giữ (Hạ nhiệt / Người giám hộ). */
export type WalletTransactionStatus = 'COMPLETED' | 'FROZEN' | 'CANCELLED' | 'BLOCKED';

export interface WalletTransaction {
  id: string;
  timestamp: string;
  channel: WalletTransactionChannel;
  recipient: string;
  amount: number;
  category: CategoryName;
  riskLevel: RiskLevel;
  riskScore: number;
  status: WalletTransactionStatus;
  ticketId?: string;
  note?: string;
}

export type SubscriptionUsageLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED';

/** Khoản trừ tiền định kỳ hằng tháng (Subscription Guard). */
export interface RecurringSubscription {
  id: string;
  name: string;
  monthlyAmount: number;
  category: CategoryName;
  /** Ngày trừ tiền trong tháng (1–28). */
  billingDay: number;
  usageLevel: SubscriptionUsageLevel;
  /** Gói dùng thử sẽ tự gia hạn thành gói trả phí. */
  isTrial: boolean;
  status: SubscriptionStatus;
  cancelledAt?: string;
}

/** Người giám hộ tin cậy nhận cảnh báo và duyệt giao dịch rủi ro cao. */
export interface TrustedGuardian {
  name: string;
  phone: string;
}

export type AnomalyClusterStatus = 'DETECTED' | 'LOCKED';

/** Trạng thái cảnh báo bất thường toàn cục trên màn hình Ops. */
export interface AnomalyClusterState {
  status: AnomalyClusterStatus;
  lockedAt?: string;
  ticketId?: string;
}

/** Ảnh chụp toàn bộ dữ liệu Ví + Ops lưu bền vững trong localStorage. */
export interface TrustPayWalletState {
  schemaVersion: 1;
  balance: number;
  budgets: BudgetCategory[];
  blacklist: string[];
  transactions: WalletTransaction[];
  subscriptions: RecurringSubscription[];
  guardian: TrustedGuardian;
  tickets: FintechOpsTicket[];
  anomalyCluster: AnomalyClusterState;
  /** Ticket từng có ảnh bằng chứng (ảnh chỉ giữ trong RAM theo NĐ 13/2023). */
  redactedEvidenceTicketIds: string[];
}

/** Kế hoạch điều chuyển hạn mức giữa hai danh mục ngân sách. */
export interface BudgetReallocationPlan {
  from: CategoryName;
  to: CategoryName;
  amount: number;
  feasible: boolean;
  availableInSource: number;
}

/** Loại luồng công nghệ AWS hiển thị ở cuối thẻ kết quả. */
export type AwsPipelineKind = 'IMAGE_EVIDENCE' | 'CONTEXT_CHECK' | 'FACE_MATCH';

export type AwsEngineMode = 'AWS' | 'OFFLINE_HEURISTIC';

export type AwsPipelineStepId = 'rekognition' | 'bedrock' | 'biometric-policy' | 'blacklist';

export type AwsPipelineStepStatus = 'aws' | 'fallback' | 'local';

export interface AwsPipelineStep {
  id: AwsPipelineStepId;
  status: AwsPipelineStepStatus;
  latencyMs: number | null;
}

export interface AwsPipelineTrace {
  kind: AwsPipelineKind;
  engine: AwsEngineMode;
  /** Độ trễ khứ hồi thực tế đo trên trình duyệt (ms). */
  totalLatencyMs: number;
  steps: AwsPipelineStep[];
}

export type ShopTargetKind = 'URL' | 'STORE_NAME';

export type ShopSignalCode =
  | 'OFFICIAL_STORE'
  | 'NO_HTTPS'
  | 'SUSPICIOUS_TLD'
  | 'BRAND_IMPERSONATION'
  | 'LURE_KEYWORDS'
  | 'COMPLEX_HOSTNAME'
  | 'IP_HOST'
  | 'PUNYCODE'
  | 'URL_SHORTENER'
  | 'CREDENTIALS_IN_URL'
  | 'PRICE_TOO_GOOD'
  | 'UNVERIFIED_STORE'
  | 'BLACKLISTED'
  | 'SOCIAL_REFERRAL'
  | 'PREPAYMENT_PRESSURE'
  | 'INVALID_TARGET';

export interface ShopRiskSignal {
  code: ShopSignalCode;
  weight: number;
  detail?: string;
}

/** Kết quả phân tích cấu trúc URL / tên cửa hàng của Safe Shopping Agent. */
export interface ShopRiskReport {
  kind: ShopTargetKind;
  /** Hostname (URL) hoặc tên cửa hàng đã chuẩn hóa. */
  normalizedTarget: string;
  /** Hostname + đường dẫn rút gọn để hiển thị và đưa vào ngữ cảnh AI. */
  displayTarget: string;
  officialStoreName?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  signals: ShopRiskSignal[];
}

import type { BudgetCategory, CategoryName, RiskLevel } from "@/types/trustpay";

export const DEFAULT_BUDGETS: BudgetCategory[] = [
  { id: "b1", name: "Ăn uống", limit: 3_000_000, spent: 1_200_000 },
  { id: "b2", name: "Mua sắm", limit: 4_000_000, spent: 2_500_000 },
  { id: "b3", name: "Di chuyển", limit: 1_000_000, spent: 400_000 },
  { id: "b4", name: "Khác", limit: 2_000_000, spent: 500_000 },
];

export const DEFAULT_BLACKLIST: string[] = [
  "999988887777",
  "1903888999",
  "Cán bộ điều tra",
];

export interface DemoScenario {
  id: string;
  label: string;
  badge: string;
  description: string;
  commandText: string;
  expectedRiskLevel: RiskLevel;
  expectedCategory: CategoryName;
  expectedBudgetExceeded: boolean;
  expectedRequireBiometric: boolean;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "scenario-1",
    label: "Kịch bản 1: Giao dịch an toàn",
    badge: "An toàn",
    description: "Chi tiêu ăn uống thường ngày, rủi ro thấp và nằm trong ngân sách.",
    commandText: "Chuyển 45.000đ tiền bún bò cho Quán Cô Ba",
    expectedRiskLevel: "LOW",
    expectedCategory: "Ăn uống",
    expectedBudgetExceeded: false,
    expectedRequireBiometric: false,
  },
  {
    id: "scenario-2",
    label: "Kịch bản 2: Vượt ngân sách",
    badge: "Vượt hạn mức",
    description: "Giao dịch hợp lệ (Risk LOW) nhưng vượt hạn mức danh mục Mua sắm.",
    commandText: "Thanh toán 2.500.000đ mua giày sneaker tại Shop XYZ",
    expectedRiskLevel: "LOW",
    expectedCategory: "Mua sắm",
    expectedBudgetExceeded: true,
    expectedRequireBiometric: false,
  },
  {
    id: "scenario-3",
    label: "Kịch bản 3: Lừa đảo mạo danh & Blacklist",
    badge: "Nguy hiểm (95đ)",
    description: "Mạo danh cơ quan điều tra + STK nằm trong Blacklist -> Kích hoạt FaceID & đẩy Ticket Ops.",
    commandText:
      "Chuyển gấp 12.000.000đ cho Cán bộ điều tra STK 999988887777 để xác minh tài khoản",
    expectedRiskLevel: "HIGH",
    expectedCategory: "Khác",
    expectedBudgetExceeded: true,
    expectedRequireBiometric: true,
  },
  {
    id: "scenario-4",
    label: "Kịch bản 4: Bẫy trúng thưởng / Phí nhận quà",
    badge: "Nguy hiểm (88đ)",
    description: "Yêu cầu nộp phí nhận thưởng iPhone 16 Pro Max -> Cảnh báo đỏ & bắt buộc xác thực khuôn mặt.",
    commandText:
      "Chuyển 3.000.000đ phí nhận thưởng iPhone 16 Pro Max cho Trung tâm CSKH",
    expectedRiskLevel: "HIGH",
    expectedCategory: "Khác",
    expectedBudgetExceeded: true,
    expectedRequireBiometric: true,
  },
];

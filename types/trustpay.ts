export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type CategoryName = 'Ăn uống' | 'Mua sắm' | 'Di chuyển' | 'Khác';

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

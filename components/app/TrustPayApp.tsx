"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Gauge } from "lucide-react";
import type {
  AwsPipelineTrace,
  BudgetReallocationPlan,
  CategoryName,
  FintechOpsTicket,
  RecurringSubscription,
  TransactionAnalysisResponse,
  TrustedGuardian,
  VerifyFaceResponse,
  WalletTransaction,
} from "@/types/trustpay";
import { DEMO_SCENARIOS } from "@/lib/mock-scenarios";
import { decideBiometric, type BiometricDecision } from "@/lib/compliance/biometric-policy";
import { useWalletState, walletStore } from "@/lib/wallet/wallet-store";
import { setTourCollapsed, usePreferences } from "@/lib/preferences/preferences-store";
import {
  addBlacklistEntries,
  addSubscription,
  applyDebit,
  approveTicket,
  blockTicket,
  cancelSubscription,
  finalizeStaleHolds,
  lockAnomalyCluster,
  markEvidenceRedacted,
  patchTransaction,
  reallocateBudget,
  setSubscriptionUsage,
  updateGuardian,
  updateTicket,
  upsertTicket,
  upsertTransaction,
} from "@/lib/wallet/wallet-reducers";
import {
  computeDailyOutflow,
  createClientId,
  createTicketId,
  resolveWalletCategory,
} from "@/lib/wallet/ledger";
import { formatLatency, vnDatePart, vnDayKey } from "@/lib/wallet/format";
import { withStepLatency } from "@/lib/aws/pipeline-trace";
import {
  appendTicketNote,
  buildProtectionReport,
  guardianApprovedTicketNote,
  guardianBlockedTicketNote,
  HIGH_RISK_HOLD_SCORE,
} from "@/lib/guardian/guardian-alert";
import { downloadTextFile, sha256Hex } from "@/lib/browser/download-text";
import { ANOMALY_CLUSTER_PATTERN, buildClusterLockPlan } from "@/lib/ops/anomaly-cluster";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";
import {
  createSubscriptionFromDraft,
  isSubscriptionFlagged,
  type SubscriptionDraft,
} from "@/lib/agents/subscription-guard";
import type { Messages } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/I18nProvider";
import AppHeader, { type AppTab } from "@/components/layout/AppHeader";
import ToastNotice, { type ToastNotification } from "@/components/layout/ToastNotice";
import WalletSidebar from "@/components/user-wallet/WalletSidebar";
import AgentSwitcher, { type AgentTab } from "@/components/user-wallet/AgentSwitcher";
import TransactionInputPanel, { type TransactionAnalysisMeta } from "@/components/user-wallet/TransactionInputPanel";
import AiShieldResultPanel, { type TransferUiStatus } from "@/components/user-wallet/AiShieldResultPanel";
import SafeShoppingAgent, { type ShopCheckResult } from "@/components/user-wallet/SafeShoppingAgent";
import SubscriptionGuard from "@/components/user-wallet/SubscriptionGuard";
import TransactionHistory from "@/components/user-wallet/TransactionHistory";
import CoolingOffModal, { type CoolingOffOutcome } from "@/components/user-wallet/CoolingOffModal";
import BiometricModal from "@/components/BiometricModal";
import FraudOpsDashboard from "@/components/fintech-ops/FraudOpsDashboard";
import WelcomeOnboarding, { type OnboardingRole } from "@/components/onboarding/WelcomeOnboarding";
import QuickTour, { type TourStepIndex } from "@/components/onboarding/QuickTour";
import { markGuideSeen } from "@/lib/preferences/preferences-store";
import { endCallShield, featureStore, startCallShield } from "@/lib/features/feature-store";
import { applyCallShieldUplift, assessCallRisk, captionsRevealed } from "@/lib/call-shield/call-shield";
import { buildQrOpsTicket, QR_DATA_TEXT, qrRecipientLabel } from "@/lib/qr/vietqr-inspector";
import ThemeController from "@/components/theme/ThemeController";
import QuickTip from "@/components/guide/QuickTip";
import UserGuideModal, { type GuideTopicIndex } from "@/components/guide/UserGuideModal";
import PaymentCopilot from "@/components/user-wallet/PaymentCopilot";
import CallShieldBar from "@/components/user-wallet/CallShieldBar";
import QrInspector, { type QrCheckResult } from "@/components/user-wallet/QrInspector";
import SecurityFinOpsPanel from "@/components/finops/SecurityFinOpsPanel";

/** Ghi chú dữ liệu (lưu bằng tiếng Việt — lớp hiển thị tự dịch khi chọn EN). */
const HOLD_NOTE = "Đang tạm giữ — chờ Hạ nhiệt 15 giây, FaceID hoặc Người giám hộ duyệt";
const SUPERSEDED_NOTE = "Đã tạo lệnh mới — giao dịch tạm giữ trước đó bị hủy, tiền chưa bị trừ";
const USER_CANCEL_NOTE = "Người dùng hủy giao dịch — số dư giữ nguyên";
const FACE_VERIFIED_NOTE = "FaceID đã xác thực sau 15 giây hạ nhiệt — người dùng xác nhận chuyển";
const POLICY_NOTE = "Xác thực sinh trắc học theo TT 50 NHNN";
const OPS_BLOCK_NOTE = "Fintech Ops đã chặn & đưa người nhận vào Blacklist";

const SCENARIO_3 = DEMO_SCENARIOS.find((scenario) => scenario.id === "scenario-3");

interface TransferSession {
  id: string;
  analysis: TransactionAnalysisResponse;
  commandText: string;
  trace: AwsPipelineTrace;
  policy: BiometricDecision;
  requireBiometric: boolean;
  category: CategoryName;
  status: TransferUiStatus;
  biometricVerified: boolean;
  historyId: string | null;
  frozenAt: number | null;
  guardianSentAt: number | null;
  guardianDecidedAt: number | null;
  reportText: string | null;
  reallocation: { amount: number; from: CategoryName; to: CategoryName } | null;
}

type BiometricRequest =
  | { flow: "transfer"; amount: number; recipient: string; riskScore: number; reasons: string[] }
  | { flow: "shopping"; checkId: string; amount: number; recipient: string; riskScore: number; reasons: string[] }
  | { flow: "qr"; checkId: string; amount: number; recipient: string; riskScore: number; reasons: string[] };

type TourProgress = readonly [boolean, boolean, boolean];

// Đồng hồ ngày (giờ Việt Nam) cho hạn mức lũy kế — SSR trả "" để không gọi thời gian thực khi prerender.
const subscribeDayClock = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
};
const getDayKeySnapshot = () => vnDayKey(Date.now());
const getServerDayKeySnapshot = () => "";

function useTodayKey(): string {
  return useSyncExternalStore(subscribeDayClock, getDayKeySnapshot, getServerDayKeySnapshot);
}

function describePipeline(trace: AwsPipelineTrace, t: Messages): string {
  const labels = trace.steps.map((step) => {
    const label =
      step.id === "rekognition"
        ? t.pipeline.steps.rekognition
        : step.id === "bedrock"
          ? trace.kind === "IMAGE_EVIDENCE"
            ? t.pipeline.steps.bedrockImage
            : t.pipeline.steps.bedrockContext
          : step.id === "biometric-policy"
            ? t.pipeline.steps.policy
            : t.pipeline.steps.blacklist;
    return `${label.service} ${label.role}`;
  });
  const fallback = trace.engine === "OFFLINE_HEURISTIC" ? ` ${t.pipeline.fallbackLabel}` : "";
  return `${labels.join(" → ")} • ${formatLatency(trace.totalLatencyMs)}${fallback}`;
}

function nowIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Bộ điều phối chính của TrustPay AI: nối Ví Người Dùng, các trợ lý AI, cơ chế
 * Hạ nhiệt & Người giám hộ, và Fintech Ops trên CÙNG một store bền vững
 * (localStorage) để mọi thay đổi đồng bộ 2 chiều theo thời gian thực.
 */
export default function TrustPayApp() {
  const { t, lang, money, category, data } = useI18n();
  const wallet = useWalletState();
  const prefs = usePreferences();
  const todayKey = useTodayKey();

  const [activeTab, setActiveTab] = useState<AppTab>("user-wallet");
  const [activeAgent, setActiveAgent] = useState<AgentTab>("transfer");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [transfer, setTransfer] = useState<TransferSession | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [coolingOpen, setCoolingOpen] = useState(false);
  const [coolingOpenedAt, setCoolingOpenedAt] = useState(0);
  const [guardianApproveError, setGuardianApproveError] = useState<string | null>(null);
  const [biometricRequest, setBiometricRequest] = useState<BiometricRequest | null>(null);
  const [shopVerifiedCheckId, setShopVerifiedCheckId] = useState<string | null>(null);
  const [evidenceByTicket, setEvidenceByTicket] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [inputSeed, setInputSeed] = useState<{ nonce: number; text: string; scenarioId: string | null }>({
    nonce: 0,
    text: "",
    scenarioId: null,
  });
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const [tourDone, setTourDone] = useState<TourProgress>([false, false, false]);
  const [resetKey, setResetKey] = useState(0);
  const [guideTopic, setGuideTopic] = useState<GuideTopicIndex | null>(null);
  const [finopsOpen, setFinopsOpen] = useState(false);
  const [qrVerifiedCheckId, setQrVerifiedCheckId] = useState<string | null>(null);
  const [lastTrace, setLastTrace] = useState<AwsPipelineTrace | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const resetEpochRef = useRef(0);
  const analysisEpochRef = useRef(0);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const dailyOutflow = todayKey ? computeDailyOutflow(wallet.transactions, todayKey) : null;
  const pendingAlertsCount = wallet.tickets.filter((ticket) => ticket.status === "PENDING").length;
  const flaggedSubscriptions = wallet.subscriptions.filter(isSubscriptionFlagged).length;
  const ticketsWithEvidence: FintechOpsTicket[] = wallet.tickets.map((ticket) => {
    const evidence = evidenceByTicket[ticket.ticketId];
    return evidence ? { ...ticket, evidenceImageBase64: evidence } : ticket;
  });

  // ------------------------------------------------------------------ helpers

  const showToast = useCallback((next: ToastNotification) => {
    setToast(next);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4800);
  }, []);

  const markTourStep = (index: TourStepIndex) => {
    setTourDone((prev) => {
      if (prev[index]) return prev;
      const next: [boolean, boolean, boolean] = [prev[0], prev[1], prev[2]];
      next[index] = true;
      return next;
    });
  };

  const focusArea = (id: string) => {
    setHighlightTarget(id);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightTarget(null), 2800);
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };

  const seedScenario3 = () => {
    if (!SCENARIO_3) return;
    const scenario = SCENARIO_3;
    setInputSeed((prev) => ({ nonce: prev.nonce + 1, text: scenario.commandText, scenarioId: scenario.id }));
  };

  // --------------------------------------------------------- transfer flow

  const handleAnalyzingChange = (value: boolean) => {
    if (value) {
      analysisEpochRef.current = resetEpochRef.current;
    }
    setIsAnalyzing(value);
  };

  const handleAnalysisComplete = (rawResult: TransactionAnalysisResponse, meta: TransactionAnalysisMeta) => {
    if (analysisEpochRef.current !== resetEpochRef.current) {
      return; // Kết quả của phiên trước khi Reset Demo.
    }

    const nowMs = Date.now();
    // Active Call Shield: lệnh tạo ra khi đang nghe cuộc gọi lạ → chỉ NÂNG rủi ro (ADR-1),
    // sàn 82/100 vượt ngưỡng tạm giữ 70 → Hạ nhiệt 15 giây + Người giám hộ duyệt.
    const call = featureStore.getSnapshot().callShield;
    const callStartedMs = call.active && call.startedAt ? Date.parse(call.startedAt) : Number.NaN;
    const duringCall = Number.isFinite(callStartedMs);
    const result = duringCall
      ? applyCallShieldUplift(rawResult, {
          keywordIds: assessCallRisk(captionsRevealed(nowMs - callStartedMs), "vi").keywordIds,
        })
      : rawResult;
    setLastTrace(meta.trace);
    const snapshot = walletStore.getSnapshot();
    const dailyBefore = computeDailyOutflow(snapshot.transactions, vnDayKey(nowMs));
    const effectiveCategory = resolveWalletCategory(result.category, snapshot.budgets);

    // Chính sách sinh trắc học tập trung (TT 50 / QĐ 2345): không lấy quyết định từ AI.
    const policyStartedAt = performance.now();
    const policy = decideBiometric({
      parsedAmount: result.parsedAmount,
      riskLevel: result.scamReport.riskLevel,
      dailyCumulativeBefore: dailyBefore,
    });
    const policyMs = performance.now() - policyStartedAt;
    const trace = meta.trace.steps.some((step) => step.id === "biometric-policy")
      ? withStepLatency(meta.trace, "biometric-policy", policyMs)
      : meta.trace;

    const requireBiometric = result.requireBiometric || policy.requireBiometric;
    const highRiskHold = requireBiometric && result.scamReport.riskScore >= HIGH_RISK_HOLD_SCORE;
    const isRisky = result.scamReport.riskLevel !== "LOW";
    const ticketId = result.fintechOpsTicket.ticketId;
    const historyId = highRiskHold ? createClientId("TXN") : null;
    const evidence = meta.imageBase64;

    walletStore.setState((state) => {
      let next = finalizeStaleHolds(state, SUPERSEDED_NOTE);
      if (isRisky) {
        next = upsertTicket(next, { ...result.fintechOpsTicket, status: "PENDING" });
        if (evidence) {
          next = markEvidenceRedacted(next, ticketId);
        }
      }
      if (historyId) {
        next = upsertTransaction(next, {
          id: historyId,
          timestamp: nowIso(nowMs),
          channel: "TRANSFER",
          recipient: result.recipient,
          amount: result.parsedAmount,
          category: effectiveCategory,
          riskLevel: result.scamReport.riskLevel,
          riskScore: result.scamReport.riskScore,
          status: "FROZEN",
          ticketId,
          note: HOLD_NOTE,
        });
      }
      return next;
    });

    if (isRisky && evidence) {
      setEvidenceByTicket((prev) => ({ ...prev, [ticketId]: evidence }));
    }

    setTransfer({
      id: createClientId("SES"),
      analysis: result,
      commandText: meta.commandText,
      trace,
      policy,
      requireBiometric,
      category: effectiveCategory,
      status: highRiskHold ? "frozen" : "idle",
      biometricVerified: false,
      historyId,
      frozenAt: highRiskHold ? nowMs : null,
      guardianSentAt: null,
      guardianDecidedAt: null,
      reportText: null,
      reallocation: null,
    });
    setGuardianApproveError(null);
    setBiometricRequest(null);

    if (highRiskHold) {
      setCoolingOpenedAt(nowMs);
      setCoolingOpen(true);
      markTourStep(0);
      showToast(
        duringCall
          ? { type: "warning", title: t.toastExt.callHeld, description: t.toastExt.callHeldDesc }
          : { type: "warning", title: t.toast.frozenTitle, description: t.toast.frozenDesc },
      );
    } else if (isRisky) {
      showToast({
        type: "warning",
        title: t.toast.pushedToOps(result.scamReport.riskLevel, ticketId),
        description: t.toast.pushedToOpsDesc(money(result.parsedAmount)),
      });
    }
  };

  const handleConfirmTransfer = () => {
    if (!transfer || transfer.status !== "idle") return;
    if (transfer.requireBiometric && !transfer.biometricVerified) return;

    const session = transfer;
    const snapshot = walletStore.getSnapshot();
    const amount = session.analysis.parsedAmount;
    if (amount <= 0 || amount > snapshot.balance) {
      showToast({ type: "warning", title: t.toast.insufficient, description: t.toast.insufficientDesc });
      return;
    }

    const nowMs = Date.now();
    const isRisky = session.analysis.scamReport.riskLevel !== "LOW";
    const note = session.historyId ? FACE_VERIFIED_NOTE : session.requireBiometric ? POLICY_NOTE : undefined;
    const tx: WalletTransaction = {
      id: session.historyId ?? createClientId("TXN"),
      timestamp: nowIso(nowMs),
      channel: "TRANSFER",
      recipient: session.analysis.recipient,
      amount,
      category: session.category,
      riskLevel: session.analysis.scamReport.riskLevel,
      riskScore: session.analysis.scamReport.riskScore,
      status: "COMPLETED",
      ...(isRisky ? { ticketId: session.analysis.fintechOpsTicket.ticketId } : {}),
      ...(note ? { note } : {}),
    };

    walletStore.setState((state) => applyDebit(state, tx));
    setTransfer((prev) => (prev && prev.id === session.id ? { ...prev, status: "completed" } : prev));
    showToast({
      type: "success",
      title: t.toast.transferSuccess(money(amount)),
      description: t.toast.transferSuccessDesc(data(session.analysis.recipient), category(session.category)),
    });
  };

  const handleCancelTransfer = () => {
    if (!transfer || (transfer.status !== "idle" && transfer.status !== "frozen")) return;
    const session = transfer;
    if (session.historyId) {
      walletStore.setState((state) =>
        patchTransaction(state, session.historyId, { status: "CANCELLED", note: USER_CANCEL_NOTE }),
      );
    }
    setTransfer((prev) => (prev && prev.id === session.id ? { ...prev, status: "cancelled" } : prev));
    setCoolingOpen(false);
    setBiometricRequest(null);
    showToast({ type: "info", title: t.toast.cancelled, description: t.toast.cancelledDesc });
  };

  const handleRequestTransferBiometric = () => {
    if (!transfer) return;
    setBiometricRequest({
      flow: "transfer",
      amount: transfer.analysis.parsedAmount,
      recipient: transfer.analysis.recipient,
      riskScore: transfer.analysis.scamReport.riskScore,
      reasons: transfer.policy.reasons,
    });
  };

  const handleBiometricVerified = (result: VerifyFaceResponse) => {
    if (!result.matched || !biometricRequest) return;
    if (biometricRequest.flow === "transfer") {
      if (transfer?.status === "frozen") {
        markTourStep(1);
      }
      setTransfer((prev) =>
        prev && (prev.status === "idle" || prev.status === "frozen")
          ? { ...prev, status: "idle", biometricVerified: true }
          : prev,
      );
    } else if (biometricRequest.flow === "shopping") {
      setShopVerifiedCheckId(biometricRequest.checkId);
    } else {
      setQrVerifiedCheckId(biometricRequest.checkId);
    }
    setBiometricRequest(null);
    showToast({
      type: "success",
      title: t.toast.biometricSuccess,
      description: t.toast.biometricSuccessDesc(result.similarity),
    });
  };

  const handleBiometricCancel = () => {
    if (biometricRequest?.flow === "transfer") {
      handleCancelTransfer();
      return;
    }
    setBiometricRequest(null);
  };

  // ------------------------------------------- cooling-off & guardian flow

  const handleOpenCooling = () => {
    if (!transfer || transfer.frozenAt === null) return;
    setCoolingOpenedAt(Date.now());
    setCoolingOpen(true);
  };

  const handleCloseCooling = useCallback(() => setCoolingOpen(false), []);
  const closeGuide = useCallback(() => setGuideTopic(null), []);
  const closeFinops = useCallback(() => setFinopsOpen(false), []);

  const handleSendGuardianAlert = () => {
    if (!transfer || transfer.status !== "frozen" || transfer.guardianSentAt !== null) return;
    const sessionId = transfer.id;
    const sentAt = Date.now();
    setTransfer((prev) => (prev && prev.id === sessionId ? { ...prev, guardianSentAt: sentAt } : prev));
    showToast({
      type: "info",
      title: t.toast.guardianSent(wallet.guardian.name),
      description: t.toast.guardianSentDesc,
    });
  };

  const handleGuardianBlock = async () => {
    if (!transfer || transfer.status !== "frozen") return;
    const session = transfer;
    const decidedAt = Date.now();
    const guardian = walletStore.getSnapshot().guardian;
    const ticketId = session.analysis.fintechOpsTicket.ticketId;
    const ticketNote = guardianBlockedTicketNote(guardian.name, decidedAt);

    walletStore.setState((state) => {
      const withHistory = patchTransaction(state, session.historyId, {
        status: "BLOCKED",
        note: `Người giám hộ ${guardian.name} đã chặn & hủy giao dịch — số dư giữ nguyên`,
      });
      return updateTicket(
        withHistory,
        ticketId,
        (ticket) => ({
          ...ticket,
          summary: appendTicketNote(ticket.summary, ticketNote),
          status: ticket.status === "BLOCKED" ? "BLOCKED" : "PENDING",
        }),
        { fallback: { ...session.analysis.fintechOpsTicket, status: "PENDING" }, moveToTop: true },
      );
    });

    setTransfer((prev) =>
      prev && prev.id === session.id ? { ...prev, status: "guardian_blocked", guardianDecidedAt: decidedAt } : prev,
    );
    markTourStep(1);
    showToast({ type: "success", title: t.toast.guardianBlocked, description: t.toast.guardianBlockedDesc(ticketId) });

    // Biên bản .txt: chỉ chứa dữ liệu đã che PII + mã băm SHA-256 của lệnh (không lưu lệnh thô).
    const commandHash = await sha256Hex(session.commandText);
    const report = buildProtectionReport({
      lang,
      reportId: `BB-${vnDatePart(decidedAt)}-${ticketId.slice(-3)}`,
      createdAtIso: nowIso(decidedAt),
      ownerName: t.common.ownerName,
      guardian,
      analysis: session.analysis,
      category: session.category,
      balanceAfter: walletStore.getSnapshot().balance,
      ticketId,
      frozenAtMs: session.frozenAt ?? decidedAt,
      guardianSentAtMs: session.guardianSentAt,
      decidedAtMs: decidedAt,
      commandHash,
      pipelineLine: describePipeline(session.trace, t),
    });
    setTransfer((prev) => (prev && prev.id === session.id ? { ...prev, reportText: report } : prev));
  };

  const handleGuardianApprove = () => {
    if (!transfer || transfer.status !== "frozen") return;
    const session = transfer;
    const snapshot = walletStore.getSnapshot();
    const amount = session.analysis.parsedAmount;
    if (amount <= 0 || amount > snapshot.balance) {
      setGuardianApproveError(t.cooling.approveFailed);
      return;
    }

    const decidedAt = Date.now();
    const guardian = snapshot.guardian;
    const ticketId = session.analysis.fintechOpsTicket.ticketId;
    const tx: WalletTransaction = {
      id: session.historyId ?? createClientId("TXN"),
      timestamp: nowIso(decidedAt),
      channel: "TRANSFER",
      recipient: session.analysis.recipient,
      amount,
      category: session.category,
      riskLevel: session.analysis.scamReport.riskLevel,
      riskScore: session.analysis.scamReport.riskScore,
      status: "COMPLETED",
      ticketId,
      note: `Người giám hộ ${guardian.name} xác nhận an toàn — đã chuyển tiền`,
    };
    const ticketNote = guardianApprovedTicketNote(guardian.name, decidedAt);

    walletStore.setState((state) =>
      updateTicket(
        applyDebit(state, tx),
        ticketId,
        (ticket) => ({ ...ticket, summary: appendTicketNote(ticket.summary, ticketNote) }),
        { fallback: { ...session.analysis.fintechOpsTicket, status: "PENDING" }, moveToTop: true },
      ),
    );
    setTransfer((prev) =>
      prev && prev.id === session.id ? { ...prev, status: "completed", guardianDecidedAt: decidedAt } : prev,
    );
    setGuardianApproveError(null);
    markTourStep(1);
    showToast({
      type: "success",
      title: t.toast.guardianApproved(money(amount)),
      description: t.toast.guardianApprovedDesc,
    });
  };

  const handleCoolingFaceVerified = (result: VerifyFaceResponse) => {
    if (!result.matched) return;
    setTransfer((prev) =>
      prev && prev.status === "frozen" ? { ...prev, status: "idle", biometricVerified: true } : prev,
    );
    setCoolingOpen(false);
    markTourStep(1);
    showToast({
      type: "success",
      title: t.toast.biometricSuccess,
      description: t.toast.biometricSuccessDesc(result.similarity),
    });
  };

  const handleCoolingUseWebcam = () => {
    if (!transfer) return;
    setCoolingOpen(false);
    setBiometricRequest({
      flow: "transfer",
      amount: transfer.analysis.parsedAmount,
      recipient: transfer.analysis.recipient,
      riskScore: transfer.analysis.scamReport.riskScore,
      reasons: transfer.policy.reasons,
    });
  };

  const handleDownloadReport = () => {
    if (!transfer?.reportText) return;
    const ticketId = transfer.analysis.fintechOpsTicket.ticketId;
    const filename =
      lang === "en" ? `trustpay-protection-report-${ticketId}.txt` : `bien-ban-bao-ve-giao-dich-${ticketId}.txt`;
    downloadTextFile(filename, transfer.reportText);
    showToast({ type: "info", title: t.toast.reportDownloaded, description: filename });
  };

  // --------------------------------------------------- budget reallocation

  const handleReallocate = (plan: BudgetReallocationPlan, context: "transfer" | "shopping") => {
    const snapshot = walletStore.getSnapshot();
    const source = snapshot.budgets.find((budget) => budget.name === plan.from);
    if (!source || source.limit - source.spent < plan.amount || plan.amount <= 0) {
      return;
    }
    const nowMs = Date.now();
    const logEntry: WalletTransaction = {
      id: createClientId("BGT"),
      timestamp: nowIso(nowMs),
      channel: "BUDGET_REALLOCATION",
      recipient: `Trích hạn mức '${plan.from}' → '${plan.to}'`,
      amount: plan.amount,
      category: plan.to,
      riskLevel: "LOW",
      riskScore: 0,
      status: "COMPLETED",
      note: `Điều chuyển hạn mức từ '${plan.from}' sang '${plan.to}' để thanh toán`,
    };
    walletStore.setState((state) => reallocateBudget(state, plan, logEntry));

    if (context === "transfer") {
      setTransfer((prev) =>
        prev
          ? {
              ...prev,
              reallocation: {
                amount: plan.amount + (prev.reallocation?.amount ?? 0),
                from: plan.from,
                to: plan.to,
              },
            }
          : prev,
      );
    }
    showToast({
      type: "success",
      title: t.toast.reallocated(money(plan.amount), category(plan.from), category(plan.to)),
      description: t.toast.reallocatedDesc,
    });
  };

  // ------------------------------------------------------- shopping agent

  const getDailyOutflow = () =>
    computeDailyOutflow(walletStore.getSnapshot().transactions, vnDayKey(Date.now()));

  const handleShopCheckCompleted = (check: ShopCheckResult) => {
    setShopVerifiedCheckId(null);
    const ticket = check.ticket;
    if (ticket) {
      walletStore.setState((state) => upsertTicket(state, ticket));
      showToast({
        type: "warning",
        title: t.toast.shopFlagged(check.finalLevel),
        description: t.toast.shopFlaggedDesc(ticket.ticketId),
      });
    }
  };

  const handleShopPay = (check: ShopCheckResult): boolean => {
    const snapshot = walletStore.getSnapshot();
    const shopBudget = snapshot.budgets.find((budget) => budget.name === "Mua sắm");
    if (
      check.finalLevel === "HIGH" ||
      check.price <= 0 ||
      check.price > snapshot.balance ||
      !shopBudget ||
      shopBudget.limit - shopBudget.spent < check.price ||
      (check.policy.requireBiometric && shopVerifiedCheckId !== check.id)
    ) {
      return false;
    }

    const nowMs = Date.now();
    const store = check.report.normalizedTarget || check.report.displayTarget;
    const tx: WalletTransaction = {
      id: createClientId("SHP"),
      timestamp: nowIso(nowMs),
      channel: "SHOPPING",
      recipient: store,
      amount: check.price,
      category: "Mua sắm",
      riskLevel: check.finalLevel,
      riskScore: check.finalScore,
      status: "COMPLETED",
      ...(check.ticket ? { ticketId: check.ticket.ticketId } : {}),
      ...(check.productName ? { note: `Safe Shopping Agent — mua ${check.productName}` } : {}),
    };
    walletStore.setState((state) => applyDebit(state, tx));
    showToast({
      type: "success",
      title: t.toast.shopPaid(money(check.price)),
      description: t.toast.shopPaidDesc(store),
    });
    return true;
  };

  const handleShopRequestBiometric = (check: ShopCheckResult) => {
    setBiometricRequest({
      flow: "shopping",
      checkId: check.id,
      amount: check.price,
      recipient: check.report.normalizedTarget,
      riskScore: check.finalScore,
      reasons: check.policy.reasons,
    });
  };

  // ---------------------------------------------------- subscription guard

  const handleAddSubscription = (draft: SubscriptionDraft) => {
    const subscription = createSubscriptionFromDraft(createClientId("SUB"), draft);
    walletStore.setState((state) => addSubscription(state, subscription));
    showToast({
      type: "success",
      title: t.toast.subscriptionAdded(subscription.name),
      description: t.toast.subscriptionAddedDesc,
    });
  };

  const handleCancelSubscription = (subscription: RecurringSubscription) => {
    const cancelledAt = nowIso(Date.now());
    walletStore.setState((state) => cancelSubscription(state, subscription.id, cancelledAt));
    showToast({
      type: "success",
      title: t.toast.subscriptionCancelled(subscription.name),
      description: t.toast.subscriptionCancelledDesc(money(subscription.monthlyAmount)),
    });
  };

  const handleToggleLowUsage = (subscription: RecurringSubscription) => {
    const nextLevel = subscription.usageLevel === "LOW" ? "MEDIUM" : "LOW";
    walletStore.setState((state) => setSubscriptionUsage(state, subscription.id, nextLevel));
  };

  // ------------------------------------------------- wallet profile & list

  const handleSaveGuardian = (guardian: TrustedGuardian) => {
    walletStore.setState((state) => updateGuardian(state, guardian));
    showToast({
      type: "success",
      title: t.toast.guardianSaved(guardian.name),
      description: t.toast.guardianSavedDesc,
    });
  };

  const handleAddBlacklistEntry = (entry: string): boolean => {
    const exists = walletStore
      .getSnapshot()
      .blacklist.some((item) => item.trim().toLowerCase() === entry.trim().toLowerCase());
    if (exists) return false;
    walletStore.setState((state) => addBlacklistEntries(state, [entry]));
    showToast({ type: "warning", title: t.toast.blacklistAdded(entry), description: t.toast.blacklistAddedDesc });
    return true;
  };

  // -------------------------------------------------------------- Ops flow

  const handleBlockTicket = (ticketId: string, recipient: string) => {
    walletStore.setState((state) => blockTicket(state, ticketId, OPS_BLOCK_NOTE));
    markTourStep(2);

    const session = transfer;
    if (
      session &&
      session.analysis.fintechOpsTicket.ticketId === ticketId &&
      (session.status === "frozen" || session.status === "idle")
    ) {
      setTransfer((prev) => (prev && prev.id === session.id ? { ...prev, status: "ops_blocked" } : prev));
      setCoolingOpen(false);
      showToast({ type: "warning", title: t.toast.opsResolvedHold, description: t.toast.opsResolvedHoldDesc });
      return;
    }

    showToast({
      type: "warning",
      title: t.toast.blocked,
      description: t.toast.blockedDesc(maskRecipientForDisplay(data(recipient))),
    });
  };

  const handleApproveTicket = (ticketId: string) => {
    walletStore.setState((state) => approveTicket(state, ticketId));
    showToast({ type: "success", title: t.toast.approved(ticketId), description: t.toast.approvedDesc });
  };

  const handleLockCluster = () => {
    if (walletStore.getSnapshot().anomalyCluster.status === "LOCKED") return;
    const nowMs = Date.now();
    const plan = buildClusterLockPlan({
      ticketId: createTicketId(nowMs, vnDatePart(nowMs)),
      lockedAt: nowIso(nowMs),
    });
    walletStore.setState((state) =>
      lockAnomalyCluster(state, { entries: plan.entries, ticket: plan.ticket, lockedAt: plan.ticket.timestamp }),
    );
    markTourStep(2);
    showToast({
      type: "warning",
      title: t.toast.clusterLocked(ANOMALY_CLUSTER_PATTERN),
      description: t.toast.clusterLockedDesc(plan.entries.length),
    });
  };

  // ------------------------------------------------- VietQR Inspector

  const handleQrDanger = (check: QrCheckResult): string | null => {
    const nowMs = Date.now();
    const ticket = buildQrOpsTicket(check.report, {
      ticketId: createTicketId(nowMs, vnDatePart(nowMs)),
      timestamp: nowIso(nowMs),
      amount: check.amount,
      riskScore: check.finalScore,
    });
    walletStore.setState((state) => upsertTicket(state, ticket));
    showToast({ type: "warning", title: t.toastExt.qrBlocked(ticket.ticketId), description: t.toastExt.qrBlockedDesc });
    return ticket.ticketId;
  };

  const handleQrPay = (check: QrCheckResult): boolean => {
    const snapshot = walletStore.getSnapshot();
    if (
      check.verdict === "DANGER" ||
      check.amount <= 0 ||
      check.amount > snapshot.balance ||
      (check.policy.requireBiometric && qrVerifiedCheckId !== check.id)
    ) {
      return false;
    }
    const nowMs = Date.now();
    const recipient = qrRecipientLabel(check.report);
    const tx: WalletTransaction = {
      id: createClientId("QRP"),
      timestamp: nowIso(nowMs),
      channel: "TRANSFER",
      recipient,
      amount: check.amount,
      category: check.category,
      riskLevel: check.finalLevel,
      riskScore: check.finalScore,
      status: "COMPLETED",
      note: QR_DATA_TEXT.paidNote,
    };
    walletStore.setState((state) => applyDebit(state, tx));
    showToast({
      type: "success",
      title: t.toastExt.qrPaid(money(check.amount)),
      description: t.toastExt.qrPaidDesc(data(recipient)),
    });
    return true;
  };

  const handleQrRequestBiometric = (check: QrCheckResult) => {
    setBiometricRequest({
      flow: "qr",
      checkId: check.id,
      amount: check.amount,
      recipient: qrRecipientLabel(check.report),
      riskScore: check.finalScore,
      reasons: check.policy.reasons,
    });
  };

  // ------------------------------------------- Copilot & Active Call Shield

  const openAgent = (agent: AgentTab, areaId: string) => {
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    setActiveAgent(agent);
    focusArea(areaId);
  };

  const handleCopilotPrefill = (commandText: string) => {
    setInputSeed((prev) => ({ nonce: prev.nonce + 1, text: commandText, scenarioId: null }));
    openAgent("transfer", "tp-transfer-panel");
    showToast({ type: "info", title: t.toastExt.copilotPrefilled, description: t.toastExt.copilotPrefilledDesc });
  };

  const handleStartCall = () => {
    if (featureStore.getSnapshot().callShield.active) return;
    startCallShield(new Date().toISOString());
    showToast({ type: "warning", title: t.toastExt.callStarted, description: t.toastExt.callStartedDesc });
  };

  const handleEndCall = () => {
    if (!featureStore.getSnapshot().callShield.active) return;
    endCallShield();
    showToast({ type: "info", title: t.toastExt.callEnded, description: t.toastExt.callEndedDesc });
  };

  // --------------------------------------------- Hướng dẫn sử dụng & FinOps

  const handleOpenGuide = (topic: GuideTopicIndex = 0) => {
    setShowOnboarding(false);
    setGuideTopic(topic);
    markGuideSeen();
  };

  const handleGuideTryNow = (topic: GuideTopicIndex) => {
    setGuideTopic(null);
    if (topic === 0) {
      openAgent("transfer", "tp-copilot");
    } else if (topic === 1) {
      openAgent("qr", "tp-qr-inspector");
    } else if (topic === 2) {
      openAgent("shopping", "tp-agent-shopping");
    } else if (topic === 3) {
      handleStartCall();
      openAgent("transfer", "tp-call-shield");
    } else {
      setShowOnboarding(false);
      setActiveTab("fintech-ops");
      focusArea("tp-anomaly-banner");
    }
  };

  // --------------------------------------------- header, onboarding & tour

  const handleReset = () => {
    resetEpochRef.current += 1;
    walletStore.reset();
    featureStore.reset();
    setQrVerifiedCheckId(null);
    setLastTrace(null);
    setTransfer(null);
    setIsAnalyzing(false);
    setCoolingOpen(false);
    setBiometricRequest(null);
    setShopVerifiedCheckId(null);
    setEvidenceByTicket({});
    setGuardianApproveError(null);
    setInputSeed((prev) => ({ nonce: prev.nonce + 1, text: "", scenarioId: null }));
    setResetKey((prev) => prev + 1);
    setTourDone([false, false, false]);
    showToast({ type: "success", title: t.toast.resetDone, description: t.toast.resetDoneDesc });
  };

  const handleChooseRole = (role: OnboardingRole) => {
    setShowOnboarding(false);
    setActiveTab(role === "wallet" ? "user-wallet" : "fintech-ops");
    setTourCollapsed(false);
  };

  const handleTourStep = (step: TourStepIndex) => {
    setShowOnboarding(false);

    if (step === 0) {
      setActiveTab("user-wallet");
      setActiveAgent("transfer");
      seedScenario3();
      focusArea("tp-transfer-panel");
      return;
    }

    if (step === 1) {
      setActiveTab("user-wallet");
      setActiveAgent("transfer");
      const canReopenHold =
        transfer !== null &&
        transfer.frozenAt !== null &&
        (transfer.status === "frozen" ||
          transfer.status === "guardian_blocked" ||
          transfer.status === "ops_blocked" ||
          (transfer.status === "completed" && transfer.guardianDecidedAt !== null));
      if (canReopenHold) {
        setCoolingOpenedAt(Date.now());
        setCoolingOpen(true);
        return;
      }
      seedScenario3();
      focusArea("tp-guardian-card");
      showToast({ type: "info", title: t.tour.needHoldFirst, description: t.tour.needHoldFirstDesc });
      return;
    }

    setActiveTab("fintech-ops");
    focusArea("tp-anomaly-banner");
  };

  // ------------------------------------------------------------- render

  const coolingOutcome: CoolingOffOutcome = !transfer
    ? "pending"
    : transfer.status === "guardian_blocked"
      ? "guardian_blocked"
      : transfer.status === "ops_blocked"
        ? "ops_blocked"
        : transfer.status === "completed" && transfer.guardianDecidedAt !== null
          ? "guardian_approved"
          : "pending";

  const isTransferHighlighted = highlightTarget === "tp-transfer-panel";

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50">
      <ThemeController />
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingAlertsCount={pendingAlertsCount}
        onOpenOnboarding={() => setShowOnboarding(true)}
        onReset={handleReset}
        onOpenGuide={() => handleOpenGuide(0)}
        guideSeen={prefs.guideSeen}
        onOpenFinOps={() => setFinopsOpen(true)}
      />

      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 pb-28 sm:px-6 lg:px-8">
        {/* Tab 1 — Ví Người Dùng (giữ trạng thái khi chuyển tab) */}
        <section
          aria-label={t.header.walletTab}
          className={activeTab === "user-wallet" ? "grid grid-cols-1 items-start gap-6 lg:grid-cols-12" : "hidden"}
        >
          <div className="lg:col-span-4">
            <WalletSidebar
              walletBalance={wallet.balance}
              budgets={wallet.budgets}
              blacklist={wallet.blacklist}
              guardian={wallet.guardian}
              dailyOutflow={dailyOutflow}
              onSaveGuardian={handleSaveGuardian}
              onAddBlacklistEntry={handleAddBlacklistEntry}
              guardianHighlighted={highlightTarget === "tp-guardian-card"}
            />
          </div>

          <div className="flex flex-col gap-6 lg:col-span-8">
            <AgentSwitcher
              active={activeAgent}
              onChange={setActiveAgent}
              flaggedSubscriptions={flaggedSubscriptions}
            />

            <div className={activeAgent === "transfer" ? "flex flex-col gap-6" : "hidden"}>
              <QuickTip id="transfer" />
              <PaymentCopilot
                budgets={wallet.budgets}
                subscriptions={wallet.subscriptions}
                onPrefillTransfer={handleCopilotPrefill}
                onOpenSubscriptions={() => openAgent("subscriptions", "tp-agent-subscriptions")}
                onOpenQr={() => openAgent("qr", "tp-qr-inspector")}
                onOpenCallShield={() => openAgent("transfer", "tp-call-shield")}
                highlighted={highlightTarget === "tp-copilot"}
              />
              <div
                id="tp-transfer-panel"
                className={`flex flex-col gap-4 rounded-3xl ${isTransferHighlighted ? "tp-highlight" : ""}`}
              >
                <CallShieldBar
                  onStart={handleStartCall}
                  onEnd={handleEndCall}
                  highlighted={highlightTarget === "tp-call-shield"}
                />
                <TransactionInputPanel
                  key={`${resetKey}-${inputSeed.nonce}`}
                  budgets={wallet.budgets}
                  blacklist={wallet.blacklist}
                  onAnalysisComplete={handleAnalysisComplete}
                  onAnalyzingChange={handleAnalyzingChange}
                  initialCommandText={inputSeed.text}
                  initialScenarioId={inputSeed.scenarioId}
                  highlightScenarioId={
                    isTransferHighlighted && inputSeed.scenarioId === "scenario-3" ? "scenario-3" : null
                  }
                />
              </div>

              <AiShieldResultPanel
                analysis={transfer?.analysis ?? null}
                walletBalance={wallet.balance}
                isAnalyzing={isAnalyzing}
                transactionStatus={transfer?.status ?? "idle"}
                biometricVerified={transfer?.biometricVerified ?? false}
                onConfirmTransfer={handleConfirmTransfer}
                onRequestBiometric={handleRequestTransferBiometric}
                onCancelTransaction={handleCancelTransfer}
                trace={transfer?.trace ?? null}
                effectiveCategory={transfer?.category}
                requireBiometric={transfer?.requireBiometric}
                policy={transfer?.policy ?? null}
                budgets={wallet.budgets}
                reallocation={transfer?.reallocation ?? null}
                onReallocateBudget={(plan) => handleReallocate(plan, "transfer")}
                onOpenCoolingOff={handleOpenCooling}
                onDownloadReport={handleDownloadReport}
                reportReady={Boolean(transfer?.reportText)}
                guardianName={wallet.guardian.name}
              />
            </div>

            <div className={activeAgent === "qr" ? "flex flex-col gap-4" : "hidden"}>
              <QuickTip id="qr" />
              <div className={`rounded-3xl ${highlightTarget === "tp-qr-inspector" ? "tp-highlight" : ""}`}>
                <QrInspector
                  key={`qr-${resetKey}`}
                  budgets={wallet.budgets}
                  blacklist={wallet.blacklist}
                  walletBalance={wallet.balance}
                  getDailyOutflow={getDailyOutflow}
                  verifiedCheckId={qrVerifiedCheckId}
                  onDanger={handleQrDanger}
                  onPay={handleQrPay}
                  onRequestBiometric={handleQrRequestBiometric}
                />
              </div>
            </div>

            <div
              id="tp-agent-shopping"
              className={
                activeAgent === "shopping"
                  ? `flex flex-col gap-4 rounded-3xl ${highlightTarget === "tp-agent-shopping" ? "tp-highlight" : ""}`
                  : "hidden"
              }
            >
              <QuickTip id="shopping" />
              <SafeShoppingAgent
                key={`shop-${resetKey}`}
                budgets={wallet.budgets}
                blacklist={wallet.blacklist}
                walletBalance={wallet.balance}
                getDailyOutflow={getDailyOutflow}
                biometricVerifiedCheckId={shopVerifiedCheckId}
                onCheckCompleted={handleShopCheckCompleted}
                onReallocateBudget={(plan) => handleReallocate(plan, "shopping")}
                onRequestBiometric={handleShopRequestBiometric}
                onPay={handleShopPay}
              />
            </div>

            <div
              id="tp-agent-subscriptions"
              className={
                activeAgent === "subscriptions"
                  ? `flex flex-col gap-4 rounded-3xl ${highlightTarget === "tp-agent-subscriptions" ? "tp-highlight" : ""}`
                  : "hidden"
              }
            >
              <QuickTip id="subscriptions" />
              <SubscriptionGuard
                key={`sub-${resetKey}`}
                subscriptions={wallet.subscriptions}
                budgets={wallet.budgets}
                onAddSubscription={handleAddSubscription}
                onCancelSubscription={handleCancelSubscription}
                onToggleLowUsage={handleToggleLowUsage}
              />
            </div>

            <TransactionHistory transactions={wallet.transactions} />
          </div>
        </section>

        {/* Tab 2 — Fintech Future Workspace (Ops) */}
        <section
          aria-label={t.header.opsTab}
          className={activeTab === "fintech-ops" ? "flex min-w-0 flex-1 flex-col gap-4" : "hidden"}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <QuickTip id="ops" />
            </div>
            <button
              type="button"
              onClick={() => setFinopsOpen(true)}
              title={t.nav.finopsTitle}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-[#a50064] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110"
            >
              <Gauge className="h-4 w-4" />
              {t.nav.finops}
            </button>
          </div>
          <FraudOpsDashboard
            tickets={ticketsWithEvidence}
            blacklist={wallet.blacklist}
            onBlockTicket={handleBlockTicket}
            onApproveTicket={handleApproveTicket}
            anomalyCluster={wallet.anomalyCluster}
            onLockCluster={handleLockCluster}
            redactedEvidenceTicketIds={wallet.redactedEvidenceTicketIds}
            highlightBanner={highlightTarget === "tp-anomaly-banner"}
          />
        </section>
      </main>

      {!showOnboarding && (
        <QuickTour
          collapsed={prefs.tourCollapsed}
          onToggleCollapsed={() => setTourCollapsed(!prefs.tourCollapsed)}
          completed={tourDone}
          onStep={handleTourStep}
        />
      )}

      {coolingOpen && transfer && transfer.frozenAt !== null && (
        <CoolingOffModal
          analysis={transfer.analysis}
          guardian={wallet.guardian}
          frozenAt={transfer.frozenAt}
          openedAt={coolingOpenedAt}
          guardianSentAt={transfer.guardianSentAt}
          outcome={coolingOutcome}
          balance={wallet.balance}
          reportReady={Boolean(transfer.reportText)}
          approveError={guardianApproveError}
          onClose={handleCloseCooling}
          onSendGuardianAlert={handleSendGuardianAlert}
          onGuardianBlock={() => void handleGuardianBlock()}
          onGuardianApprove={handleGuardianApprove}
          onFaceVerified={handleCoolingFaceVerified}
          onUseWebcam={handleCoolingUseWebcam}
          onCancelTransaction={handleCancelTransfer}
          onDownloadReport={handleDownloadReport}
        />
      )}

      {biometricRequest && (
        <BiometricModal
          isOpen
          recipient={biometricRequest.recipient}
          amount={biometricRequest.amount}
          riskScore={biometricRequest.riskScore}
          policyReasons={biometricRequest.reasons}
          onClose={() => setBiometricRequest(null)}
          onVerified={handleBiometricVerified}
          onCancelTransaction={handleBiometricCancel}
        />
      )}

      {guideTopic !== null && (
        <UserGuideModal initialTopic={guideTopic} onClose={closeGuide} onTryNow={handleGuideTryNow} />
      )}

      {finopsOpen && <SecurityFinOpsPanel onClose={closeFinops} lastTrace={lastTrace ?? transfer?.trace ?? null} />}

      {showOnboarding && (
        <WelcomeOnboarding onChooseRole={handleChooseRole} onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}

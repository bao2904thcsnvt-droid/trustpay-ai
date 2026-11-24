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
import { markGuideSeen, preferencesStore, setEmbedMode } from "@/lib/preferences/preferences-store";
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
// Vòng 3 — Non-Custodial AI Security Layer: Real VietQR Handoff + MoMo SDK Embedded
import { findInstitution } from "@/lib/payments/banks";
import { derivePaymentMemo, type PayeeDetails } from "@/lib/payments/vietqr-builder";
import {
  createDecisionToken,
  createNonce,
  decisionFromRisk,
  reasonCodesFrom,
  type DecisionEngine,
  type SdkDecision,
  type SdkEventName,
  type SdkReasonCode,
} from "@/lib/sdk/decision-token";
import {
  buildHostCommandText,
  deliverDecisionToken,
  isEmbedRequested,
  parseHostTransferRequest,
  resolveHostOrigin,
  type HostTransferRequest,
} from "@/lib/sdk/host-bridge";
import RealPaymentHandoff, { type HandoffState } from "@/components/payments/RealPaymentHandoff";
import { EMPTY_PAYEE_DRAFT, type PayeeDraft } from "@/components/payments/PayeeFields";
import EmbeddedSdkShell, { type EmbeddedSdkTab } from "@/components/sdk/EmbeddedSdkShell";
import type { SdkEventRecord } from "@/components/sdk/SdkEventInspector";
// Vòng 4 — Trung tâm Thanh toán Hợp nhất: Easy/Pro, đa ngân hàng, Danh bạ Tin cậy, Paste-to-Pay,
// Ẩn số dư, Khóa sinh trắc học thiết bị, Chia tiền nhóm, Nhờ AI kiểm tra giúp, PWA.
import { buildTransferCommand } from "@/lib/copilot/payment-copilot";
import {
  hubStore,
  isTrustedPayeeSaved,
  setBalanceHidden,
  setUiMode,
  touchTrustedPayee,
  useHubState,
  type LinkedAccount,
  type TrustedPayee,
  type UiMode,
} from "@/lib/hub/hub-store";
import { buildPasteCommand, isPasteComplete, parsePaymentMessage, type PasteField } from "@/lib/hub/paste-to-pay";
import { appLockSession, QR_UNLOCK_WINDOW_MS, useUnlockedAt } from "@/lib/security/app-lock";
import type { PasteSummary } from "@/components/user-wallet/TransactionInputPanel";
import EasyHome, { type EasyPanel } from "@/components/hub/EasyHome";
import LinkedAccountsBar, { linkedAccountLabel } from "@/components/hub/LinkedAccountsBar";
import TrustedPayees from "@/components/hub/TrustedPayees";
import SplitBill from "@/components/hub/SplitBill";
import AiCheckHelper from "@/components/hub/AiCheckHelper";
import SaveTrustedPayeeCta from "@/components/hub/SaveTrustedPayeeCta";
import AppLockModal from "@/components/security/AppLockModal";
import AppLockSettings from "@/components/security/AppLockSettings";
import PwaRegister from "@/components/pwa/PwaRegister";
// Vòng 5 — Dark Cinematic Glassmorphism: Hero toàn màn hình + nền video sợi quang.
import { isStandaloneDisplay, shouldSkipHero, type HeroTarget } from "@/lib/cinematic/cinematic";
import { useMediaQuery, usePrefersReducedMotion } from "@/lib/hooks/use-media-query";
// Vòng 6 — Không gian Ứng dụng Di động: Tab Bar đáy, Chuyển/Rút liên ngân hàng, Liên kết ngân hàng.
import MobileTabBar, { type MobileTab } from "@/components/mobile/MobileTabBar";
import InterbankPanel from "@/components/mobile/InterbankPanel";
import BankLinkingPanel from "@/components/mobile/BankLinkingPanel";

// Vòng 7 — ProMax: AI Agent 4 bước, Edge ML hành vi, CV Forensics, XAI, chuỗi Audit SHA-256.
import { BehaviorTracker, predictCoercion, type CoercionPrediction } from "@/lib/behavioral-ml";
import { runInvestigation, type InvestigationReport } from "@/lib/investigation-agent";
import { amountBand, appendAudit, auditStore, type AuditKind, type AuditValue } from "@/lib/audit-chain";
import { sha256HexSync } from "@/lib/crypto/sha256";
import AgentTracePanel from "@/components/promax/AgentTracePanel";
import BehaviorRiskMeter from "@/components/promax/BehaviorRiskMeter";
import CvForensicsPanel from "@/components/promax/CvForensicsPanel";
import OpsAnalyticsPanel from "@/components/OpsAnalyticsPanel";

/** Điện thoại ≤768px hoặc PWA đã cài (standalone) → Không gian Ứng dụng Di động. */
const MOBILE_SHELL_QUERY = "(max-width: 768px), (display-mode: standalone)";

type ShieldTool = "check" | "call" | "shop" | "subs";
import { useResolvedTheme } from "@/components/theme/ThemeController";
import CinematicBackdrop from "@/components/cinematic/CinematicBackdrop";
import HeroLanding from "@/components/cinematic/HeroLanding";

/** Thời lượng hiệu ứng mở từ Hero xuống Không gian làm việc (khớp `.tp-cine` trong globals.css). */
const HERO_LEAVE_MS = 640;

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
  /** Vòng 3: người nhận thật đã được Lá chắn AI phân tích (khóa cho Real Payment Handoff). */
  payee: PayeeDetails | null;
  /** Vòng 4: nội dung chuyển khoản gợi ý từ Paste-to-Pay (null → suy ra từ câu lệnh). */
  memo: string | null;
  /** Vòng 7: mức rủi ro hợp nhất của AI Agent (chỉ nâng — dùng để khóa chuyển tiền thật). */
  agentLevel: TransactionAnalysisResponse["scamReport"]["riskLevel"];
}

/** Lệnh điền sẵn cho biểu mẫu chuyển tiền (panel remount theo `nonce`). */
interface InputSeed {
  nonce: number;
  text: string;
  scenarioId: string | null;
  /** Vòng 4: tự phân tích ngay (Danh bạ 1 chạm / Paste-to-Pay đủ thông tin). */
  autoSubmit?: boolean;
  paste?: PasteSummary | null;
  memo?: string;
}

const PASTE_REQUIRED_FIELDS: readonly PasteField[] = ["bank", "account", "amount"];

/** Tham chiếu người nhận trong Decision Token (BIN + STK; token chỉ chứa bản che + dấu vân tay). */
function payeeRefOf(payee: PayeeDetails | null): { bankBin: string; accountNumber: string } | null {
  const institution = payee ? findInstitution(payee.institutionCode) : undefined;
  return payee && institution ? { bankBin: institution.bin, accountNumber: payee.accountNumber } : null;
}

const MAX_SDK_EVENTS = 20;

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
  // Vòng 5: màn hình Hero thay vai trò thẻ chào mừng lúc mới vào; thẻ chọn vai trò vẫn mở
  // được bất cứ lúc nào từ menu phụ ("Giới thiệu").
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [transfer, setTransfer] = useState<TransferSession | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [coolingOpen, setCoolingOpen] = useState(false);
  const [coolingOpenedAt, setCoolingOpenedAt] = useState(0);
  const [guardianApproveError, setGuardianApproveError] = useState<string | null>(null);
  const [biometricRequest, setBiometricRequest] = useState<BiometricRequest | null>(null);
  const [shopVerifiedCheckId, setShopVerifiedCheckId] = useState<string | null>(null);
  const [evidenceByTicket, setEvidenceByTicket] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [inputSeed, setInputSeed] = useState<InputSeed>({
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
  // Vòng 3: người nhận thật (giữ ở đây để không mất khi biểu mẫu remount) + nhật ký Decision Token.
  const [payeeDraft, setPayeeDraft] = useState<PayeeDraft>(EMPTY_PAYEE_DRAFT);
  const [sdkEvents, setSdkEvents] = useState<SdkEventRecord[]>([]);
  const [urlEmbed, setUrlEmbed] = useState(false);
  const urlEmbedRef = useRef(false);
  const hostRequestHandlerRef = useRef<(request: HostTransferRequest) => void>(() => {});

  const toastTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const resetEpochRef = useRef(0);
  const analysisEpochRef = useRef(0);

  // Vòng 4 — Trung tâm Thanh toán Hợp nhất (store bền vững `trustpay-ai.hub.v1`).
  const hub = useHubState();
  const unlockedAt = useUnlockedAt();
  const [easyPanel, setEasyPanel] = useState<EasyPanel>("home");
  const [cameraRequest, setCameraRequest] = useState(0);
  const [qrExternal, setQrExternal] = useState<{ nonce: number; payload: string } | null>(null);
  const [qrGateOpen, setQrGateOpen] = useState(false);
  const [expiredUnlockAt, setExpiredUnlockAt] = useState<number | null>(null);
  const qrExternalNonceRef = useRef(0);
  const pendingHandoffFocusRef = useRef(false);

  // Vòng 5 — Hero toàn màn hình (mặc định hiện khi mới vào; máy chủ & lần hydrate đầu giống nhau).
  const [heroVisible, setHeroVisible] = useState(true);
  const [heroLeaving, setHeroLeaving] = useState(false);
  const heroTimerRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const resolvedTheme = useResolvedTheme();

  // Vòng 7 — ProMax: kết quả AI Agent + Edge ML của giao dịch gần nhất; bộ ghi hành vi (chỉ dấu
  // thời gian phím & số ký tự dán, không lưu nội dung).
  const [investigation, setInvestigation] = useState<InvestigationReport | null>(null);
  const [mlPrediction, setMlPrediction] = useState<CoercionPrediction | null>(null);
  const behaviorTrackerRef = useRef<BehaviorTracker | null>(null);
  const getBehaviorTracker = () => {
    if (behaviorTrackerRef.current === null) behaviorTrackerRef.current = new BehaviorTracker();
    return behaviorTrackerRef.current;
  };

  useEffect(() => {
    const inPanel = (target: EventTarget | null) =>
      target instanceof Element && target.closest("#tp-transfer-panel, #tp-payee-fields") !== null;
    const onKey = (event: KeyboardEvent) => {
      if (!inPanel(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length === 1 || event.key === "Backspace") getBehaviorTracker().key(performance.now());
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!inPanel(event.target)) return;
      getBehaviorTracker().paste(event.clipboardData?.getData("text/plain").length ?? 0, performance.now());
    };
    const onFocus = (event: FocusEvent) => {
      if (inPanel(event.target)) getBehaviorTracker().start(performance.now());
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("focusin", onFocus, true);
    };
  }, []);

  /** Ghi một quyết định bảo mật vào chuỗi Audit SHA-256 (không chứa PII thô). */
  const recordAudit = (kind: AuditKind, summary: Record<string, AuditValue>) => {
    void appendAudit(kind, summary, new Date().toISOString());
  };

  // Vòng 6 — Không gian Ứng dụng Di động (máy chủ & lần hydrate đầu luôn false).
  const mobileShell = useMediaQuery(MOBILE_SHELL_QUERY);
  const [mobileTab, setMobileTab] = useState<MobileTab>("home");
  const [shieldTool, setShieldTool] = useState<ShieldTool>("check");

  // iframe nhúng SDK (`?embed=momo`), lối tắt PWA (`?action=…`) và PWA đã cài (standalone) đi
  // thẳng vào Không gian làm việc.
  useEffect(() => {
    if (shouldSkipHero(window.location.search) || isStandaloneDisplay()) {
      setHeroVisible(false);
    }
  }, []);

  // Mở khóa chỉ có hiệu lực 2 phút cho việc tạo mã VietQR — hẹn giờ đánh dấu hết hạn (không gọi
  // thời gian thực khi render).
  useEffect(() => {
    if (unlockedAt === null) return;
    const remaining = unlockedAt + QR_UNLOCK_WINDOW_MS - Date.now();
    const timer = window.setTimeout(() => setExpiredUnlockAt(unlockedAt), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [unlockedAt]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      if (heroTimerRef.current !== null) window.clearTimeout(heroTimerRef.current);
    };
  }, []);

  // `?embed=momo` → bật giao diện nhúng SDK tinh gọn cho riêng phiên/iframe này (không ghi đè
  // tùy chọn đã lưu, để tab TrustPay đầy đủ đang mở song song không bị chuyển chế độ theo).
  useEffect(() => {
    if (isEmbedRequested(window.location.search)) {
      urlEmbedRef.current = true;
      setUrlEmbed(true);
    }
  }, []);

  // Vòng 4 — lối tắt PWA (manifest `shortcuts`): `/?action=scan` mở Camera quét QR, `/?action=split`
  // mở Chia tiền nhóm. Chạy trong hẹn giờ để Strict Mode (effect chạy 2 lần) không lặp hành động.
  useEffect(() => {
    if (isEmbedRequested(window.location.search)) return;
    const action = new URLSearchParams(window.location.search).get("action");
    if (action !== "scan" && action !== "split" && action !== "transfer") return;
    const timer = window.setTimeout(() => {
      setShowOnboarding(false);
      setActiveTab("user-wallet");
      if (action === "transfer") {
        setActiveAgent("transfer");
        setMobileTab("transfer");
        if (hubStore.getSnapshot().uiMode === "easy") {
          setEasyPanel("transfer");
        } else {
          focusArea("tp-transfer-panel");
        }
      } else if (action === "scan") {
        setActiveAgent("qr");
        setMobileTab("scan");
        setCameraRequest((prev) => prev + 1);
        if (hubStore.getSnapshot().uiMode === "easy") {
          setEasyPanel("scan");
        } else {
          focusArea("tp-qr-inspector");
        }
      } else {
        if (hubStore.getSnapshot().uiMode === "easy") {
          setUiMode("pro");
        }
        setMobileTab("banks");
        focusArea("tp-split-bill");
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      window.history.replaceState(window.history.state, "", url.toString());
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Host App → SDK: chỉ nhận từ iframe cha có origin đã khai báo (?hostOrigin= hoặc referrer).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (window.parent === window || event.source !== window.parent) return;
      const trustedOrigin = resolveHostOrigin(window.location.search, document.referrer);
      if (!trustedOrigin || event.origin !== trustedOrigin) return;
      const request = parseHostTransferRequest(event.data);
      if (request) {
        hostRequestHandlerRef.current(request);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
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

  // ------------------------------------------- TrustPay SDK Decision Token

  /**
   * Phát Decision Token (`ALLOW | HOLD_GUARDIAN | BLOCK`) cho Host App. Token luôn
   * được ghi vào Inspector; chỉ ở Chế độ Nhúng SDK mới gửi `postMessage` tới Host.
   */
  const emitDecision = (input: {
    event: SdkEventName;
    requestId: string;
    decision: SdkDecision;
    riskScore: number;
    riskLevel: TransactionAnalysisResponse["scamReport"]["riskLevel"];
    biometricRequired: boolean;
    reasons: SdkReasonCode[];
    amount: number;
    payee: { bankBin: string; accountNumber: string } | null;
    engine: DecisionEngine;
  }) => {
    const nowMs = Date.now();
    const token = createDecisionToken({ ...input, nowMs, nonce: createNonce() });
    const hostOrigin = resolveHostOrigin(window.location.search, document.referrer);
    const embedded = preferencesStore.getSnapshot().embedMode || urlEmbedRef.current;
    const delivery = embedded ? deliverDecisionToken(token, hostOrigin) : "NOT_EMBEDDED";
    setSdkEvents((prev) =>
      [
        { id: createClientId("EVT"), direction: "OUTBOUND" as const, at: nowMs, token, delivery, hostOrigin },
        ...prev,
      ].slice(0, MAX_SDK_EVENTS),
    );
  };

  /** Token cho các quyết định tiếp theo của cùng một phiên chuyển tiền. */
  const emitSessionDecision = (
    session: TransferSession,
    event: SdkEventName,
    decision: SdkDecision,
    reasons: SdkReasonCode[],
  ) => {
    emitDecision({
      event,
      requestId: session.id,
      decision,
      riskScore: session.analysis.scamReport.riskScore,
      riskLevel: session.analysis.scamReport.riskLevel,
      biometricRequired: session.requireBiometric,
      reasons,
      amount: session.analysis.parsedAmount,
      payee: payeeRefOf(session.payee),
      engine: session.trace.engine,
    });
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

    // Vòng 7 — Edge ML hành vi + AI Agent điều tra 4 bước. Cả hai chỉ được NÂNG rủi ro (ADR-1):
    // ngưỡng TT 50 vẫn do `decideBiometric` quyết định, Agent hợp nhất điểm LLM làm sàn.
    const historyAmounts = snapshot.transactions
      .filter((tx) => tx.status === "COMPLETED" && (tx.channel === "TRANSFER" || tx.channel === "SHOPPING"))
      .map((tx) => tx.amount);
    const tracker = getBehaviorTracker();
    const prediction = predictCoercion(
      tracker.snapshot(performance.now(), {
        callRisk: duringCall ? 1 : 0,
        amount: result.parsedAmount,
        historyAmounts,
      }),
    );
    tracker.reset();
    const payeeInstitution = meta.payee ? findInstitution(meta.payee.institutionCode) : undefined;
    const report = runInvestigation({
      commandText: meta.commandText,
      amount: result.parsedAmount,
      payee:
        meta.payee && payeeInstitution ? { bankBin: payeeInstitution.bin, accountNumber: meta.payee.accountNumber } : null,
      memo: meta.memo,
      history: snapshot.transactions,
      blacklist: snapshot.blacklist,
      nowMs,
      dailyOutflowBefore: dailyBefore,
      llm: { score: result.scamReport.riskScore, level: result.scamReport.riskLevel, engine: meta.trace.engine },
      mlProbability: prediction.probability,
    });
    setMlPrediction(prediction);
    setInvestigation(report);

    const requireBiometric = result.requireBiometric || policy.requireBiometric || report.requireBiometric;
    const highRiskHold =
      requireBiometric && Math.max(result.scamReport.riskScore, report.finalScore) >= HIGH_RISK_HOLD_SCORE;

    recordAudit("ANALYSIS", {
      decision: highRiskHold ? "HOLD_GUARDIAN" : report.finalLevel === "LOW" ? "ALLOW" : "REVIEW",
      riskLevel: report.finalLevel,
      score: report.finalScore,
      llmScore: result.scamReport.riskScore,
      mlPct: Math.round(prediction.probability * 100),
      biometric: requireBiometric,
      amountBand: amountBand(result.parsedAmount),
      engine: meta.trace.engine,
      commandSha256: sha256HexSync(meta.commandText),
    });
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

    const sessionId = createClientId("SES");
    const payee = meta.payee ?? null;
    setTransfer({
      id: sessionId,
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
      payee,
      memo: meta.memo ?? null,
      agentLevel: report.finalLevel,
    });
    setGuardianApproveError(null);
    setBiometricRequest(null);

    // TrustPay SDK `onBeforeTransferConfirm` → Decision Token cho Host App.
    const reasonCodes = reasonCodesFrom({
      redFlags: result.scamReport.redFlags,
      policyReasons: policy.reasons,
      riskLevel: result.scamReport.riskLevel,
    });
    emitDecision({
      event: "onBeforeTransferConfirm",
      requestId: sessionId,
      decision: decisionFromRisk({ riskLevel: result.scamReport.riskLevel, held: highRiskHold }),
      riskScore: result.scamReport.riskScore,
      riskLevel: result.scamReport.riskLevel,
      biometricRequired: requireBiometric,
      reasons: highRiskHold ? [...reasonCodes, "COOLING_OFF_15S"] : reasonCodes,
      amount: result.parsedAmount,
      payee: payeeRefOf(payee),
      engine: meta.trace.engine,
    });

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

    // Vòng 4: Paste-to-Pay / Danh bạ 1 chạm → AN TOÀN thì cuộn thẳng tới mã VietQR thật.
    if (pendingHandoffFocusRef.current) {
      pendingHandoffFocusRef.current = false;
      if (!isRisky && !highRiskHold && payee) {
        focusArea("tp-real-handoff");
      }
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
    emitSessionDecision(
      session,
      "onTransferConfirm",
      "ALLOW",
      session.frozenAt !== null ? ["USER_CONFIRMED", "USER_BIOMETRIC_OVERRIDE"] : ["USER_CONFIRMED"],
    );
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
    emitSessionDecision(session, "onTransferCancel", "BLOCK", ["USER_CANCELLED"]);
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
    emitSessionDecision(session, "onGuardianDecision", "BLOCK", ["GUARDIAN_BLOCKED"]);
    recordAudit("GUARDIAN", { decision: "BLOCK", ticketId, amountBand: amountBand(session.analysis.parsedAmount) });
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
    emitSessionDecision(session, "onGuardianDecision", "ALLOW", ["GUARDIAN_APPROVED"]);
    recordAudit("GUARDIAN", { decision: "ALLOW", ticketId, amountBand: amountBand(amount) });
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
    recordAudit("OPS_BLOCK", { ticketId, recipientSha256: sha256HexSync(recipient) });
    markTourStep(2);

    const session = transfer;
    if (
      session &&
      session.analysis.fintechOpsTicket.ticketId === ticketId &&
      (session.status === "frozen" || session.status === "idle")
    ) {
      setTransfer((prev) => (prev && prev.id === session.id ? { ...prev, status: "ops_blocked" } : prev));
      emitSessionDecision(session, "onOpsBlock", "BLOCK", ["OPS_BLOCKED"]);
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
    recordAudit("OPS_APPROVE", { ticketId });
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
    const decodedQr = check.report.decoded;
    emitDecision({
      event: "onTransferConfirm",
      requestId: check.id,
      decision: "ALLOW",
      riskScore: check.finalScore,
      riskLevel: check.finalLevel,
      biometricRequired: check.policy.requireBiometric,
      reasons: ["QR_VERIFIED", "USER_CONFIRMED"],
      amount: check.amount,
      payee:
        decodedQr?.bankBin && decodedQr.accountNumber
          ? { bankBin: decodedQr.bankBin, accountNumber: decodedQr.accountNumber }
          : null,
      engine: "LOCAL_RULES",
    });
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

  /** Soi mã VietQR xong → Decision Token `onQrInspected` (SAFE/WARNING → ALLOW, DANGER → BLOCK). */
  const handleQrInspected = (check: QrCheckResult) => {
    const decoded = check.report.decoded;
    recordAudit("QR_INSPECT", {
      verdict: check.verdict,
      score: check.finalScore,
      crcValid: decoded?.crc.valid ?? false,
      amountBand: amountBand(check.amount),
    });
    const reasons: SdkReasonCode[] =
      check.verdict === "DANGER" ? ["QR_DANGER"] : check.verdict === "WARNING" ? ["QR_WARNING"] : ["QR_VERIFIED"];
    if (check.report.blacklistMatches.length > 0) reasons.push("BLACKLIST_MATCH");
    if (check.policy.requireBiometric && check.amount > 10_000_000) reasons.push("AMOUNT_OVER_10M_TT50");
    emitDecision({
      event: "onQrInspected",
      requestId: check.id,
      decision: check.verdict === "DANGER" ? "BLOCK" : "ALLOW",
      riskScore: check.finalScore,
      riskLevel: check.finalLevel,
      biometricRequired: check.policy.requireBiometric,
      reasons,
      amount: check.amount,
      payee:
        decoded?.bankBin && decoded.accountNumber ? { bankBin: decoded.bankBin, accountNumber: decoded.accountNumber } : null,
      engine: "LOCAL_RULES",
    });
  };

  // ------------------------------------------------- Host App ↔ SDK (embed)

  const exitEmbedMode = () => {
    setEmbedMode(false);
    urlEmbedRef.current = false;
    setUrlEmbed(false);
    if (isEmbedRequested(window.location.search)) {
      // Bỏ `?embed=momo` khỏi URL để lần tải lại không tự bật lại.
      const url = new URL(window.location.href);
      url.searchParams.delete("embed");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  };

  const handleToggleEmbed = () => {
    const next = !(preferencesStore.getSnapshot().embedMode || urlEmbedRef.current);
    setShowOnboarding(false);
    if (next) {
      setEmbedMode(true);
      setActiveTab("user-wallet");
      setActiveAgent((current) => (current === "qr" ? "qr" : "transfer"));
    } else {
      exitEmbedMode();
    }
    showToast(
      next
        ? { type: "info", title: t.toastR3.embedOn, description: t.toastR3.embedOnDesc }
        : { type: "info", title: t.toastR3.embedOff, description: t.toastR3.embedOffDesc },
    );
  };

  /** Host gửi `TRUSTPAY_HOST_TRANSFER_REQUEST` → điền sẵn lệnh + người nhận để Lá chắn AI kiểm duyệt. */
  const handleHostRequest = (request: HostTransferRequest) => {
    const institution = findInstitution(request.institutionCode);
    setPayeeDraft({
      institutionCode: request.institutionCode,
      accountNumber: request.accountNumber,
      accountName: request.accountName,
    });
    setInputSeed((prev) => ({ nonce: prev.nonce + 1, text: buildHostCommandText(request), scenarioId: null }));
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    setActiveAgent("transfer");
    setSdkEvents((prev) =>
      [
        {
          id: createClientId("EVT"),
          direction: "INBOUND" as const,
          at: Date.now(),
          summary: t.sdk.hostRequestLine(money(request.amount), institution?.shortName ?? request.institutionCode),
          payload: {
            type: "TRUSTPAY_HOST_TRANSFER_REQUEST",
            requestId: request.requestId,
            transfer: {
              amount: request.amount,
              bankBin: institution?.bin ?? null,
              accountNumberMasked: maskRecipientForDisplay(request.accountNumber),
              memo: request.memo,
            },
          },
        },
        ...prev,
      ].slice(0, MAX_SDK_EVENTS),
    );
    focusArea("tp-transfer-panel");
    showToast({ type: "info", title: t.toastR3.hostRequest, description: t.toastR3.hostRequestDesc });
  };

  useEffect(() => {
    hostRequestHandlerRef.current = handleHostRequest;
  });

  // ------------------------------------------- Copilot & Active Call Shield

  /** Đồng bộ trợ lý AI đang chọn với Tab Bar đáy của Không gian Ứng dụng Di động. */
  const syncMobileTab = (agent: AgentTab) => {
    if (agent === "transfer") {
      setMobileTab("transfer");
    } else if (agent === "qr") {
      setMobileTab("scan");
    } else {
      setMobileTab("shield");
      setShieldTool(agent === "shopping" ? "shop" : "subs");
    }
  };

  const openAgent = (agent: AgentTab, areaId: string) => {
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    setActiveAgent(agent);
    syncMobileTab(agent);
    focusArea(areaId);
  };

  /** Chạm một tab trên thanh App Bar đáy (nút giữa = mở thẳng camera quét QR). */
  const selectMobileTab = (tab: MobileTab) => {
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    setMobileTab(tab);
    setCameraRequest((prev) => (tab === "scan" ? prev + 1 : 0));
    if (tab === "scan") setActiveAgent("qr");
    else if (tab === "transfer") setActiveAgent("transfer");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  // ------------------------------- Vòng 4 — Trung tâm Thanh toán Hợp nhất

  /** "✨ Chế độ Đơn giản (Easy Mode)" | "⚡ Chế độ Đầy đủ (Pro Mode)". */
  const handleModeChange = (mode: UiMode) => {
    if (mode === hubStore.getSnapshot().uiMode) return;
    setUiMode(mode);
    setShowOnboarding(false);
    setEasyPanel("home");
    setCameraRequest(0);
    if (mode === "easy") {
      if (preferencesStore.getSnapshot().embedMode || urlEmbedRef.current) {
        exitEmbedMode();
      }
      setActiveTab("user-wallet");
      setFinopsOpen(false);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(
      mode === "easy"
        ? { type: "info", title: t.toastR4.modeEasy, description: t.toastR4.modeEasyDesc }
        : { type: "info", title: t.toastR4.modePro, description: t.toastR4.modeProDesc },
    );
  };

  const handleToggleBalance = () => setBalanceHidden(!hubStore.getSnapshot().balanceHidden);

  /** Easy Mode: 3 nút khổng lồ. */
  const handleEasySelect = (panel: Exclude<EasyPanel, "home">) => {
    setEasyPanel(panel);
    if (panel === "scan") {
      setActiveAgent("qr");
      setCameraRequest((prev) => prev + 1);
    } else if (panel === "transfer") {
      setActiveAgent("transfer");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEasyBack = () => {
    setEasyPanel("home");
    setCameraRequest(0);
  };

  /**
   * "📋 Dán tin nhắn / Ảnh để tự điền (Paste-to-Pay)": bóc tách Ngân hàng + STK + Số tiền + Tên
   * + Nội dung → điền sẵn biểu mẫu và tự phân tích khi đủ thông tin. Lệnh gửi Lá chắn AI luôn kèm
   * "Tin nhắn gốc" nên mọi dấu hiệu lừa đảo trong tin nhắn vẫn được soát (không hạ rủi ro).
   */
  const handlePasteToPay = (raw: string): boolean => {
    const parsed = parsePaymentMessage(raw);
    if (parsed.accountNumber === null && parsed.amount === null) {
      return false;
    }
    const complete = isPasteComplete(parsed);
    setPayeeDraft({
      institutionCode: parsed.institutionCode ?? "",
      accountNumber: parsed.accountNumber ?? "",
      accountName: parsed.accountName ?? "",
    });
    setInputSeed((prev) => ({
      nonce: prev.nonce + 1,
      text: buildPasteCommand(parsed, raw),
      scenarioId: null,
      autoSubmit: complete,
      paste: { found: parsed.found, missing: PASTE_REQUIRED_FIELDS.filter((field) => !parsed.found.includes(field)) },
      memo: parsed.memo ?? derivePaymentMemo(""),
    }));
    pendingHandoffFocusRef.current = complete;
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    setActiveAgent("transfer");
    if (hubStore.getSnapshot().uiMode === "easy") {
      setEasyPanel("transfer");
    }
    focusArea("tp-transfer-panel");
    showToast({ type: "info", title: t.toastR4.pasteFilled, description: t.toastR4.pasteFilledDesc });
    return true;
  };

  /** Ảnh dán có mã VietQR → chuyển sang "Soi mã VietQR" và soi ngay chuỗi mã. */
  const handlePasteQr = (payload: string) => {
    qrExternalNonceRef.current += 1;
    setQrExternal({ nonce: qrExternalNonceRef.current, payload });
    setCameraRequest(0);
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    setActiveAgent("qr");
    setMobileTab("scan");
    if (hubStore.getSnapshot().uiMode === "easy") {
      setEasyPanel("scan");
    }
    focusArea("tp-qr-inspector");
    showToast({ type: "info", title: t.toastR4.pasteFilled, description: t.paste.imageQr });
  };

  /** Danh bạ Tin cậy — chuyển 1 chạm: điền sẵn Ngân hàng + STK + tên, Lá chắn AI vẫn soát trước. */
  const handlePickPayee = (payee: TrustedPayee, amount: number | null, memo: string, autoSubmit: boolean) => {
    const runNow = autoSubmit && amount !== null;
    setPayeeDraft({
      institutionCode: payee.institutionCode,
      accountNumber: payee.accountNumber,
      accountName: payee.accountName,
    });
    setInputSeed((prev) => ({
      nonce: prev.nonce + 1,
      text: amount !== null ? buildTransferCommand(amount, payee.label, memo) : "",
      scenarioId: null,
      autoSubmit: runNow,
    }));
    pendingHandoffFocusRef.current = runNow;
    touchTrustedPayee(payee.id, new Date().toISOString());
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    setActiveAgent("transfer");
    setMobileTab("transfer");
    focusArea("tp-transfer-panel");
    showToast({ type: "info", title: t.toastR4.payeeFilled(payee.label), description: t.toastR4.payeeFilledDesc });
  };

  // ------------------------------- Vòng 5 — Cinematic Hero ↔ Không gian làm việc

  /** Mở mượt mà từ Hero xuống Không gian làm việc (giảm chuyển động → chuyển ngay). */
  const dismissHero = () => {
    if (heroTimerRef.current !== null) {
      window.clearTimeout(heroTimerRef.current);
      heroTimerRef.current = null;
    }
    if (reducedMotion) {
      setHeroLeaving(false);
      setHeroVisible(false);
      return;
    }
    setHeroLeaving(true);
    heroTimerRef.current = window.setTimeout(() => {
      heroTimerRef.current = null;
      setHeroVisible(false);
      setHeroLeaving(false);
    }, HERO_LEAVE_MS);
  };

  /** Bấm logo TRUSTPAY AI → quay lại màn hình Hero (trạng thái Ví được giữ nguyên). */
  const handleReturnToHero = () => {
    if (heroTimerRef.current !== null) {
      window.clearTimeout(heroTimerRef.current);
      heroTimerRef.current = null;
    }
    setHeroLeaving(false);
    setHeroVisible(true);
  };

  /** Mục điều hướng, CTA và 4 trụ cột tính năng trên Hero → đúng khu vực trong Không gian làm việc. */
  const handleHeroNavigate = (target: HeroTarget) => {
    dismissHero();
    setShowOnboarding(false);
    setActiveTab("user-wallet");
    const easy = hubStore.getSnapshot().uiMode === "easy";
    // Màn hình chờ Hero mở ra: đợi một nhịp để khu vực đích hiển thị rồi mới cuộn tới.
    const scrollTop = () => window.scrollTo({ top: 0 });

    if (target === "scan") {
      // "Quét QR" (nav / Hero): mở thẳng camera sau của điện thoại.
      setActiveAgent("qr");
      setMobileTab("scan");
      setCameraRequest((prev) => prev + 1);
      if (easy) {
        setEasyPanel("scan");
        scrollTop();
      } else if (!mobileShell) {
        focusArea("tp-qr-inspector");
      } else {
        scrollTop();
      }
      return;
    }

    setCameraRequest(0);
    setActiveAgent("transfer");

    if (target === "wallet") {
      // "Ví & Ngân hàng": quản lý liên kết thẻ & tài khoản ngân hàng.
      setMobileTab("banks");
      if (easy) {
        setEasyPanel("home");
        scrollTop();
      } else if (!mobileShell) {
        focusArea("tp-linked-accounts");
      } else {
        scrollTop();
      }
    } else if (target === "shield") {
      // "Lá chắn AI": soi tin nhắn / link, cuộc gọi đáng ngờ.
      setMobileTab("shield");
      setShieldTool("check");
      if (easy) {
        setEasyPanel("check");
        scrollTop();
      } else if (!mobileShell) {
        focusArea("tp-call-shield");
      } else {
        scrollTop();
      }
    } else if (target === "start") {
      // CTA "Bắt đầu chuyển & quét QR": vào biểu mẫu Chuyển/Rút liên ngân hàng.
      setMobileTab("transfer");
      if (easy) {
        setEasyPanel("transfer");
        scrollTop();
      } else if (!mobileShell) {
        focusArea("tp-transfer-panel");
      } else {
        scrollTop();
      }
    } else {
      // "Trang chủ" / "Mở App / Đăng nhập".
      setMobileTab("home");
      if (easy) setEasyPanel("home");
      scrollTop();
    }
  };

  /**
   * Rút tiền về ngân hàng liên kết (non-custodial): điền sẵn STK chính chủ + lệnh rút, Lá chắn AI
   * quét ngay; khi AN TOÀN, hộp Real Payment Handoff sinh mã VietQR EMVCo (CRC-16) + Deep Link
   * mở app ngân hàng. TrustPay không giữ tiền nên không tự trừ / cộng số dư thật.
   */
  const handleWithdraw = (account: LinkedAccount, amount: number) => {
    const institution = findInstitution(account.institutionCode);
    if (!institution || !account.accountNumber || amount <= 0) return;
    setPayeeDraft({
      institutionCode: account.institutionCode,
      accountNumber: account.accountNumber,
      accountName: account.holderName,
    });
    setInputSeed((prev) => ({
      nonce: prev.nonce + 1,
      text: buildTransferCommand(amount, institution.shortName, "rút tiền về ngân hàng liên kết"),
      scenarioId: null,
      autoSubmit: true,
      memo: "Rut tien ve ngan hang",
    }));
    pendingHandoffFocusRef.current = true;
    setActiveTab("user-wallet");
    setActiveAgent("transfer");
    setMobileTab("transfer");
    focusArea("tp-transfer-panel");
    showToast({
      type: "info",
      title: t.mob.xfer.toastTitle(institution.shortName),
      description: t.mob.xfer.toastDesc,
    });
  };

  // --------------------------------------------- Hướng dẫn sử dụng & FinOps

  const handleOpenGuide = (topic: GuideTopicIndex = 0) => {
    setShowOnboarding(false);
    setGuideTopic(topic);
    markGuideSeen();
  };

  const handleGuideTryNow = (topic: GuideTopicIndex) => {
    setGuideTopic(null);
    // Mở hướng dẫn từ Hero → "Dùng thử ngay" đưa thẳng xuống Không gian làm việc.
    if (heroVisible) {
      dismissHero();
    }
    // Các bài hướng dẫn trỏ tới bảng của Chế độ Đầy đủ (Copilot, Soi mã, Safe Shopping, Ops).
    if (hubStore.getSnapshot().uiMode === "easy") {
      setUiMode("pro");
      setEasyPanel("home");
      setCameraRequest(0);
    }
    // Chế độ nhúng chỉ có luồng Chuyển tiền (Call Shield) và Soi mã VietQR → các chủ đề khác cần giao diện đầy đủ.
    if ((preferencesStore.getSnapshot().embedMode || urlEmbedRef.current) && topic !== 1 && topic !== 3) {
      exitEmbedMode();
    }
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
    // Vòng 7: xóa chuỗi Audit, kết quả AI Agent / Edge ML và bộ ghi hành vi.
    auditStore.reset();
    setInvestigation(null);
    setMlPrediction(null);
    getBehaviorTracker().reset();
    // Vòng 4: xóa tài khoản liên kết, danh bạ tin cậy, cấu hình khóa, ẩn số dư — giữ chế độ Easy/Pro đang dùng.
    const keepMode = hubStore.getSnapshot().uiMode;
    hubStore.reset();
    setUiMode(keepMode);
    appLockSession.lock();
    setQrGateOpen(false);
    setQrExternal(null);
    setCameraRequest(0);
    setEasyPanel("home");
    pendingHandoffFocusRef.current = false;
    setQrVerifiedCheckId(null);
    setLastTrace(null);
    setSdkEvents([]);
    setPayeeDraft(EMPTY_PAYEE_DRAFT);
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
  const embedMode = prefs.embedMode || urlEmbed;

  // Vòng 5 — Hero chỉ hiện ngoài chế độ nhúng SDK. Khi Hero phủ màn hình, Không gian làm việc
  // được ẩn (vẫn gắn trong DOM → giữ nguyên mọi trạng thái) và trang không cuộn.
  const heroShown = heroVisible && !embedMode;
  const workspaceHidden = heroShown && !heroLeaving;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("tp-hero-open", workspaceHidden);
    if (!heroShown) {
      // React đã nắm quyền hiển thị → bỏ lớp ẩn Hero do script khởi động đặt (để logo mở lại được Hero).
      root.classList.remove("tp-skip-hero");
    }
  }, [workspaceHidden, heroShown]);

  // Vòng 3 — chỉ mở chuyển tiền THẬT khi AN TOÀN (đã qua sinh trắc nếu bắt buộc) hoặc Người giám hộ cho phép.
  const handoffState: HandoffState = (() => {
    if (!transfer || transfer.status === "cancelled") return { kind: "hidden" };
    if (transfer.status === "guardian_blocked" || transfer.status === "ops_blocked") {
      return { kind: "locked", reason: "blocked" };
    }
    const guardianApproved = transfer.status === "completed" && transfer.guardianDecidedAt !== null;
    const assessedSafe =
      transfer.analysis.scamReport.riskLevel === "LOW" &&
      transfer.agentLevel === "LOW" &&
      (transfer.status === "idle" || transfer.status === "completed");
    if (!guardianApproved && !assessedSafe) return { kind: "locked", reason: "risk" };
    if (!guardianApproved && transfer.requireBiometric && !transfer.biometricVerified && transfer.status !== "completed") {
      return { kind: "locked", reason: "biometric" };
    }
    if (!transfer.payee) return { kind: "need-payee" };
    return { kind: "ready", via: guardianApproved ? "guardian" : "safe", guardianName: wallet.guardian.name };
  })();

  const latestToken = sdkEvents.find((record) => record.direction === "OUTBOUND");
  const latestDecisionToken = latestToken && latestToken.direction === "OUTBOUND" ? latestToken.token : null;
  const hostSettlementRef =
    latestDecisionToken &&
    latestDecisionToken.decision === "ALLOW" &&
    (latestDecisionToken.event === "onTransferConfirm" ||
      (latestDecisionToken.event === "onGuardianDecision" && transfer?.status === "completed"))
      ? `NAPAS-${latestDecisionToken.nonce.slice(0, 8).toUpperCase()}`
      : null;

  // Vòng 4 — Easy/Pro (chế độ nhúng SDK luôn ưu tiên), nguồn tiền mặc định, khóa sinh trắc học, người nhận mẫu.
  const easyMode = hub.uiMode === "easy" && !embedMode;
  const defaultSource =
    hub.linkedAccounts.find((account) => account.id === hub.defaultSourceId) ?? hub.linkedAccounts[0];
  const sourceLabel = defaultSource ? linkedAccountLabel(defaultSource, t.hub.masked) : "";
  const lockEnabled = hub.appLock.enabled;
  const appLocked = lockEnabled && unlockedAt === null;
  const qrUnlockFresh = unlockedAt !== null && expiredUnlockAt !== unlockedAt;
  const qrNeedsUnlock = lockEnabled && !qrUnlockFresh;
  const sessionPayee = transfer?.payee ?? null;
  const sessionPayeeKey = sessionPayee ? `${sessionPayee.institutionCode}:${sessionPayee.accountNumber}` : null;
  const samplePayee =
    sessionPayeeKey !== null &&
    hub.trustedPayees.some((item) => item.demo && `${item.institutionCode}:${item.accountNumber}` === sessionPayeeKey);
  const showSavePayee =
    !embedMode &&
    handoffState.kind === "ready" &&
    sessionPayee !== null &&
    !samplePayee &&
    !isTrustedPayeeSaved(hub, sessionPayee.institutionCode, sessionPayee.accountNumber);

  const showUnlockedToast = () =>
    showToast({ type: "success", title: t.toastR4.unlocked, description: t.toastR4.unlockedDesc });

  const transferPanel = (
    <div
      id="tp-transfer-panel"
      className={`flex flex-col gap-4 rounded-3xl ${isTransferHighlighted ? "tp-highlight" : ""}`}
    >
      <CallShieldBar onStart={handleStartCall} onEnd={handleEndCall} highlighted={highlightTarget === "tp-call-shield"} />
      <TransactionInputPanel
        key={`${resetKey}-${inputSeed.nonce}`}
        budgets={wallet.budgets}
        blacklist={wallet.blacklist}
        onAnalysisComplete={handleAnalysisComplete}
        onAnalyzingChange={handleAnalyzingChange}
        initialCommandText={inputSeed.text}
        initialScenarioId={inputSeed.scenarioId}
        highlightScenarioId={isTransferHighlighted && inputSeed.scenarioId === "scenario-3" ? "scenario-3" : null}
        payeeDraft={payeeDraft}
        onPayeeDraftChange={setPayeeDraft}
        initialAutoSubmit={inputSeed.autoSubmit ?? false}
        initialPasteSummary={inputSeed.paste ?? null}
        initialMemo={inputSeed.memo}
        onPasteToPay={handlePasteToPay}
        onPasteQr={handlePasteQr}
      />
    </div>
  );

  // Vòng 7: thanh đo Edge ML + chuỗi suy luận AI Agent ngay dưới thẻ kết quả kiểm tra.
  const promaxPanels =
    transfer && investigation && !isAnalyzing ? (
      <div className="flex flex-col gap-4">
        {mlPrediction && <BehaviorRiskMeter prediction={mlPrediction} />}
        <AgentTracePanel key={transfer.id} report={investigation} />
      </div>
    ) : null;

  const resultPanel = (
    <>
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
    {promaxPanels}
    </>
  );

  const handoffPanel = (
    <>
      <RealPaymentHandoff
        key={transfer?.id ?? "no-session"}
        state={handoffState}
        payee={transfer?.payee ?? null}
        amount={transfer?.analysis.parsedAmount ?? 0}
        defaultMemo={transfer ? (transfer.memo ?? derivePaymentMemo(transfer.commandText)) : ""}
        onRequestPayee={() => focusArea("tp-payee-fields")}
        onCopied={(ok) =>
          showToast(
            ok
              ? { type: "success", title: t.toastR3.handoffCopied, description: t.toastR3.handoffCopiedDesc }
              : { type: "warning", title: t.toastR3.copyFailed, description: t.toastR3.copyFailedDesc },
          )
        }
        onPngSaved={() => showToast({ type: "info", title: t.toastR3.pngSaved, description: t.toastR3.pngSavedDesc })}
        highlighted={highlightTarget === "tp-real-handoff"}
        locked={qrNeedsUnlock}
        onRequestUnlock={() => setQrGateOpen(true)}
        preferredPayerApp={defaultSource?.institutionCode ?? null}
        samplePayee={samplePayee}
      />
      {showSavePayee && sessionPayee && (
        <SaveTrustedPayeeCta
          key={`save-${transfer?.id ?? "none"}`}
          payee={sessionPayee}
          suggestedLabel={
            sessionPayee.accountName || data(transfer?.analysis.recipient ?? "").replace(/\s*\([^)]*\)\s*$/, "")
          }
          onSaved={(label) =>
            showToast({ type: "success", title: t.toastR4.payeeSaved(label), description: t.toastR4.payeeSavedDesc })
          }
        />
      )}
    </>
  );

  const qrPanel = (
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
        onInspected={handleQrInspected}
        cameraRequest={cameraRequest}
        externalPayload={qrExternal}
        onExternalPayloadHandled={() => setQrExternal(null)}
      />
    </div>
  );

  // Tab Ops (dùng chung cho giao diện laptop và Không gian Ứng dụng Di động).
  const opsSection = (
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
      <OpsAnalyticsPanel
        prediction={mlPrediction}
        report={investigation}
        clusterLocked={wallet.anomalyCluster.status === "LOCKED"}
        blacklist={wallet.blacklist}
      />
    </section>
  );

  const shieldTools: { id: ShieldTool; label: string }[] = [
    { id: "check", label: t.mob.shield.check },
    { id: "call", label: t.mob.shield.call },
    { id: "shop", label: t.mob.shield.shop },
    { id: "subs", label: t.mob.shield.subs },
  ];

  // Không gian Ứng dụng Di động — nội dung từng tab của thanh App Bar đáy.
  const mobileContent = (
    <>
      <div className={activeTab === "user-wallet" ? "flex min-w-0 flex-col gap-5" : "hidden"}>
        {mobileTab === "home" && (
          <>
            <WalletSidebar
              walletBalance={wallet.balance}
              budgets={wallet.budgets}
              blacklist={wallet.blacklist}
              guardian={wallet.guardian}
              dailyOutflow={dailyOutflow}
              onSaveGuardian={handleSaveGuardian}
              onAddBlacklistEntry={handleAddBlacklistEntry}
              guardianHighlighted={highlightTarget === "tp-guardian-card"}
              balanceHidden={hub.balanceHidden}
              onToggleBalance={handleToggleBalance}
            />
            <section
              aria-label={t.mob.home.alertsTitle}
              className={`rounded-3xl border bg-white p-4 shadow-xs ${
                pendingAlertsCount > 0 ? "border-rose-300" : "border-slate-200"
              }`}
            >
              <h2 className="text-sm font-bold text-slate-900">{t.mob.home.alertsTitle}</h2>
              <p className={`mt-1 text-xs ${pendingAlertsCount > 0 ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                {t.mob.home.alerts(pendingAlertsCount)}
              </p>
            </section>
            <TransactionHistory transactions={wallet.transactions} />
          </>
        )}

        {mobileTab === "transfer" && (
          <InterbankPanel
            accounts={hub.linkedAccounts}
            defaultSourceId={hub.defaultSourceId}
            balance={wallet.balance}
            balanceHidden={hub.balanceHidden}
            onWithdraw={handleWithdraw}
            transferExtras={
              <>
                <PaymentCopilot
                  budgets={wallet.budgets}
                  subscriptions={wallet.subscriptions}
                  onPrefillTransfer={handleCopilotPrefill}
                  onOpenSubscriptions={() => openAgent("subscriptions", "tp-agent-subscriptions")}
                  onOpenQr={() => selectMobileTab("scan")}
                  onOpenCallShield={() => openAgent("transfer", "tp-call-shield")}
                  highlighted={highlightTarget === "tp-copilot"}
                />
                <TrustedPayees
                  payees={hub.trustedPayees}
                  onPick={handlePickPayee}
                  highlighted={highlightTarget === "tp-trusted-payees"}
                />
              </>
            }
          >
            {transferPanel}
            {resultPanel}
            {handoffPanel}
          </InterbankPanel>
        )}

        {mobileTab === "scan" && (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-xs">
              <h2 className="text-base font-bold text-slate-900">{t.mob.scan.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.mob.scan.hint}</p>
              <button
                type="button"
                onClick={() => setCameraRequest((prev) => prev + 1)}
                className="mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-black shadow-[0_0_22px_rgba(255,255,255,0.28)]"
                style={{ backgroundColor: "#ffffff", color: "#000000" }}
              >
                {t.mob.scan.open}
              </button>
            </section>
            {qrPanel}
          </>
        )}

        {mobileTab === "banks" && (
          <>
            <BankLinkingPanel balance={wallet.balance} onToast={showToast} />
            <div className={`rounded-3xl ${highlightTarget === "tp-split-bill" ? "tp-highlight" : ""}`}>
              <SplitBill
                key={`split-${resetKey}`}
                accounts={hub.linkedAccounts}
                defaultSourceId={hub.defaultSourceId}
                requireUnlock={qrNeedsUnlock}
                onRequestUnlock={() => setQrGateOpen(true)}
                onCopied={(ok) =>
                  showToast(
                    ok
                      ? { type: "success", title: t.toastR4.splitCopied, description: t.toastR4.splitCopiedDesc }
                      : { type: "warning", title: t.toastR3.copyFailed, description: t.toastR3.copyFailedDesc },
                  )
                }
                onPngSaved={() => showToast({ type: "info", title: t.toastR3.pngSaved, description: t.toastR3.pngSavedDesc })}
              />
            </div>
            <AppLockSettings onToast={showToast} />
          </>
        )}

        {mobileTab === "shield" && (
          <>
            <div
              role="tablist"
              aria-label={t.mob.shield.tabsLabel}
              className="tp-scroll-x flex snap-x gap-1.5 rounded-2xl bg-slate-100 p-1"
            >
              {shieldTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  role="tab"
                  aria-selected={shieldTool === tool.id}
                  onClick={() => setShieldTool(tool.id)}
                  className={`min-h-11 shrink-0 cursor-pointer snap-start rounded-xl px-3.5 text-xs font-semibold whitespace-nowrap transition-all ${
                    shieldTool === tool.id
                      ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm"
                      : "text-slate-600 hover:bg-white/70"
                  }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>

            {shieldTool === "check" && (
              <>
                <AiCheckHelper budgets={wallet.budgets} blacklist={wallet.blacklist} />
                <CvForensicsPanel />
              </>
            )}
            {shieldTool === "call" && (
              <CallShieldBar
                onStart={handleStartCall}
                onEnd={handleEndCall}
                highlighted={highlightTarget === "tp-call-shield"}
              />
            )}
            {shieldTool === "shop" && (
              <div
                id="tp-agent-shopping"
                className={`flex flex-col gap-4 rounded-3xl ${highlightTarget === "tp-agent-shopping" ? "tp-highlight" : ""}`}
              >
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
            )}
            {shieldTool === "subs" && (
              <div
                id="tp-agent-subscriptions"
                className={`flex flex-col gap-4 rounded-3xl ${highlightTarget === "tp-agent-subscriptions" ? "tp-highlight" : ""}`}
              >
                <SubscriptionGuard
                  key={`sub-${resetKey}`}
                  subscriptions={wallet.subscriptions}
                  budgets={wallet.budgets}
                  onAddSubscription={handleAddSubscription}
                  onCancelSubscription={handleCancelSubscription}
                  onToggleLowUsage={handleToggleLowUsage}
                />
              </div>
            )}
          </>
        )}
      </div>
      {opsSection}
    </>
  );

  return (
    <div className="tp-shell flex min-h-screen flex-col overflow-x-clip bg-slate-50">
      <ThemeController />
      <PwaRegister />

      {/* Vòng 5 — nền video sợi quang cố định phía sau (không dùng trong iframe nhúng SDK). */}
      {!embedMode && (
        <CinematicBackdrop
          mode={workspaceHidden ? "hero" : "workspace"}
          playing={heroShown || resolvedTheme === "dark"}
        />
      )}

      {/* Không gian làm việc: ẩn & khóa tương tác khi Hero phủ màn hình (vẫn giữ trạng thái). */}
      <div
        className="tp-workspace flex min-h-screen flex-1 flex-col"
        data-hidden={workspaceHidden ? "true" : "false"}
        inert={workspaceHidden}
      >
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingAlertsCount={pendingAlertsCount}
        onOpenOnboarding={() => setShowOnboarding(true)}
        onReset={handleReset}
        onOpenGuide={() => handleOpenGuide(0)}
        guideSeen={prefs.guideSeen}
        onOpenFinOps={() => setFinopsOpen(true)}
        embedMode={embedMode}
        onToggleEmbed={handleToggleEmbed}
        uiMode={embedMode ? "pro" : hub.uiMode}
        onModeChange={embedMode ? undefined : handleModeChange}
        onAppInstalled={() =>
          showToast({ type: "success", title: t.toastR4.installed, description: t.toastR4.installedDesc })
        }
        onLogoClick={embedMode ? undefined : handleReturnToHero}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 pb-28 sm:px-6 lg:px-8">
        {easyMode ? (
          /* Vòng 4 — ✨ Chế độ Đơn giản (Easy Mode): chữ to, 3 nút hành động khổng lồ */
          <EasyHome
            balance={wallet.balance}
            balanceHidden={hub.balanceHidden}
            onToggleBalance={handleToggleBalance}
            sourceLabel={sourceLabel}
            panel={easyPanel}
            onSelectPanel={handleEasySelect}
            onBack={handleEasyBack}
          >
            {easyPanel === "scan" && qrPanel}
            {easyPanel === "transfer" && (
              <div className="flex flex-col gap-5">
                <TrustedPayees
                  payees={hub.trustedPayees}
                  onPick={handlePickPayee}
                  highlighted={highlightTarget === "tp-trusted-payees"}
                />
                <p className="text-center text-base font-bold text-slate-600">{t.easy.normalTransfer}</p>
                {transferPanel}
                {resultPanel}
                {handoffPanel}
              </div>
            )}
            {easyPanel === "check" && (
              <div className="flex flex-col gap-5">
                <AiCheckHelper budgets={wallet.budgets} blacklist={wallet.blacklist} />
                <CvForensicsPanel />
              </div>
            )}
          </EasyHome>
        ) : embedMode ? (
          /* Vòng 3 — 🔌 Chế độ Nhúng SDK (MoMo Embedded): Host App bao bọc TrustPay AI SDK */
          <EmbeddedSdkShell
            balance={wallet.balance}
            latestToken={latestDecisionToken}
            hostSettlementRef={hostSettlementRef}
            sdkTab={activeAgent === "qr" ? "qr" : "transfer"}
            onSdkTabChange={(tab: EmbeddedSdkTab) => setActiveAgent(tab === "qr" ? "qr" : "transfer")}
            events={sdkEvents}
            onClearEvents={() => setSdkEvents([])}
          >
            {activeAgent === "qr" ? (
              qrPanel
            ) : (
              <>
                {transferPanel}
                {resultPanel}
                {handoffPanel}
              </>
            )}
          </EmbeddedSdkShell>
        ) : mobileShell ? (
          /* Vòng 6 — Không gian Ứng dụng Thanh toán Di động (≤768px hoặc PWA standalone) */
          mobileContent
        ) : (
          <>
        {/* Tab 1 — Ví Người Dùng (giữ trạng thái khi chuyển tab) */}
        <section
          aria-label={t.header.walletTab}
          className={activeTab === "user-wallet" ? "grid grid-cols-1 items-start gap-6 lg:grid-cols-12" : "hidden"}
        >
          {/* Vòng 4: thanh thẻ ngang "Tài khoản & Ví liên kết" ở đầu Ví */}
          <div className="min-w-0 lg:col-span-12">
            <LinkedAccountsBar
              accounts={hub.linkedAccounts}
              defaultSourceId={hub.defaultSourceId}
              onSourceChanged={(label) =>
                showToast({ type: "success", title: t.toastR4.sourceChanged(label), description: t.toastR4.sourceChangedDesc })
              }
              onAccountAdded={(label) =>
                showToast({ type: "success", title: t.toastR4.accountAdded(label), description: t.toastR4.accountAddedDesc })
              }
            />
          </div>

          <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
            <WalletSidebar
              walletBalance={wallet.balance}
              budgets={wallet.budgets}
              blacklist={wallet.blacklist}
              guardian={wallet.guardian}
              dailyOutflow={dailyOutflow}
              onSaveGuardian={handleSaveGuardian}
              onAddBlacklistEntry={handleAddBlacklistEntry}
              guardianHighlighted={highlightTarget === "tp-guardian-card"}
              balanceHidden={hub.balanceHidden}
              onToggleBalance={handleToggleBalance}
            />
            <div className={`rounded-3xl ${highlightTarget === "tp-split-bill" ? "tp-highlight" : ""}`}>
              <SplitBill
                key={`split-${resetKey}`}
                accounts={hub.linkedAccounts}
                defaultSourceId={hub.defaultSourceId}
                requireUnlock={qrNeedsUnlock}
                onRequestUnlock={() => setQrGateOpen(true)}
                onCopied={(ok) =>
                  showToast(
                    ok
                      ? { type: "success", title: t.toastR4.splitCopied, description: t.toastR4.splitCopiedDesc }
                      : { type: "warning", title: t.toastR3.copyFailed, description: t.toastR3.copyFailedDesc },
                  )
                }
                onPngSaved={() => showToast({ type: "info", title: t.toastR3.pngSaved, description: t.toastR3.pngSavedDesc })}
              />
            </div>
            <AppLockSettings onToast={showToast} />
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
              <TrustedPayees
                payees={hub.trustedPayees}
                onPick={handlePickPayee}
                highlighted={highlightTarget === "tp-trusted-payees"}
              />
              {transferPanel}
              {resultPanel}
              {handoffPanel}
            </div>

            <div className={activeAgent === "qr" ? "flex flex-col gap-4" : "hidden"}>
              <QuickTip id="qr" />
              {qrPanel}
              <CvForensicsPanel />
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
        {opsSection}
          </>
        )}
      </main>

      {/* Vòng 6 — Thanh Tab Bar kiểu app ngân hàng cố định ở đáy (điện thoại / PWA). */}
      {mobileShell && !embedMode && !easyMode && (
        <MobileTabBar active={activeTab === "fintech-ops" ? null : mobileTab} onSelect={selectMobileTab} />
      )}

      {!showOnboarding && !embedMode && !easyMode && !heroShown && !mobileShell && (
        <QuickTour
          collapsed={prefs.tourCollapsed}
          onToggleCollapsed={() => setTourCollapsed(!prefs.tourCollapsed)}
          completed={tourDone}
          onStep={handleTourStep}
        />
      )}
      </div>

      <ToastNotice toast={toast} onDismiss={() => setToast(null)} />

      {/* Vòng 5 — Tầng 1: màn hình chào Cinematic Hero toàn khung nhìn. */}
      {heroShown && (
        <HeroLanding
          leaving={heroLeaving}
          easyMode={hub.uiMode === "easy"}
          onNavigate={handleHeroNavigate}
          onToggleEasy={() => handleModeChange(hub.uiMode === "easy" ? "pro" : "easy")}
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
          onOpenRealHandoff={() => {
            setCoolingOpen(false);
            focusArea("tp-real-handoff");
          }}
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

      {finopsOpen && !easyMode && (
        <SecurityFinOpsPanel onClose={closeFinops} lastTrace={lastTrace ?? transfer?.trace ?? null} />
      )}

      {showOnboarding && !embedMode && !easyMode && !appLocked && (
        <WelcomeOnboarding onChooseRole={handleChooseRole} onClose={() => setShowOnboarding(false)} />
      )}

      {/* Vòng 4 — Xác thực trước khi tạo mã VietQR (mở khóa còn hiệu lực 2 phút). */}
      {qrGateOpen && !appLocked && (
        <AppLockModal
          purpose="qr"
          onUnlocked={() => {
            setQrGateOpen(false);
            showUnlockedToast();
          }}
          onCancel={() => setQrGateOpen(false)}
        />
      )}

      {/* Vòng 4 — Khóa ứng dụng bằng Vân tay / FaceID thiết bị (phiên mở khóa chỉ nằm trong bộ nhớ). */}
      {appLocked && <AppLockModal purpose="app" onUnlocked={showUnlockedToast} />}
    </div>
  );
}

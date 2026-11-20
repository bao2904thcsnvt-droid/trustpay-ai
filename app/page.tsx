"use client";

import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Cloud,
  Wallet,
  ShieldAlert,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Lock,
  X,
  AlertTriangle,
} from "lucide-react";
import { DEFAULT_BLACKLIST, DEFAULT_BUDGETS } from "@/lib/mock-scenarios";
import WalletSidebar from "@/components/user-wallet/WalletSidebar";
import TransactionInputPanel from "@/components/user-wallet/TransactionInputPanel";
import AiShieldResultPanel from "@/components/user-wallet/AiShieldResultPanel";
import BiometricModal from "@/components/BiometricModal";
import FraudOpsDashboard from "@/components/fintech-ops/FraudOpsDashboard";
import type {
  BudgetCategory,
  FintechOpsTicket,
  TransactionAnalysisResponse,
  VerifyFaceResponse,
} from "@/types/trustpay";

const DEFAULT_WALLET_BALANCE = 15_000_000;

const DEFAULT_OPS_TICKETS: FintechOpsTicket[] = [
  {
    ticketId: "TCK-20261120-001",
    timestamp: "2026-11-20T14:38:00.000Z",
    recipient: "1903888999",
    amount: 5_000_000,
    riskLevel: "HIGH",
    riskScore: 95,
    summary:
      "Phát hiện giao dịch chuyển 5.000.000đ tới tài khoản Blacklist với dấu hiệu lừa đảo phí hải quan.",
    recommendedAction:
      "Tạm khóa giao dịch, yêu cầu xác thực sinh trắc học khuôn mặt và cảnh báo khách hàng.",
    status: "PENDING",
  },
];

type ActiveTab = "user-wallet" | "fintech-ops";
type TransactionStatus = "idle" | "completed" | "cancelled";

interface ToastNotification {
  type: "success" | "warning" | "info";
  title: string;
  description: string;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + "đ";
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("user-wallet");

  // Các state dùng chung giữa Tab 1, Modal Sinh trắc học và Tab 2
  const [balance, setBalance] = useState<number>(DEFAULT_WALLET_BALANCE);
  const [budgets, setBudgets] = useState<BudgetCategory[]>(() =>
    DEFAULT_BUDGETS.map((b) => ({ ...b }))
  );
  const [blacklist, setBlacklist] = useState<string[]>([...DEFAULT_BLACKLIST]);
  const [analysisResult, setAnalysisResult] =
    useState<TransactionAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [transactionStatus, setTransactionStatus] =
    useState<TransactionStatus>("idle");
  const [isBiometricOpen, setIsBiometricOpen] = useState<boolean>(false);
  const [isBiometricVerified, setIsBiometricVerified] =
    useState<boolean>(false);
  const [opsTickets, setOpsTickets] = useState<FintechOpsTicket[]>(() =>
    DEFAULT_OPS_TICKETS.map((t) => ({ ...t }))
  );

  const [resetDone, setResetDone] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (nextToast: ToastNotification) => {
    setToast(nextToast);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const pendingAlertsCount = opsTickets.filter(
    (ticket) => ticket.status === "PENDING"
  ).length;

  const handleAnalysisComplete = (
    result: TransactionAnalysisResponse,
    meta: { commandText: string; imageBase64?: string }
  ) => {
    setAnalysisResult(result);
    setIsBiometricVerified(false);
    setTransactionStatus("idle");

    if (
      result.scamReport.riskLevel === "MEDIUM" ||
      result.scamReport.riskLevel === "HIGH"
    ) {
      const newTicket: FintechOpsTicket = {
        ...result.fintechOpsTicket,
        evidenceImageBase64:
          meta.imageBase64 ?? result.fintechOpsTicket.evidenceImageBase64,
        status: "PENDING",
      };

      setOpsTickets((prev) => [
        newTicket,
        ...prev.filter((t) => t.ticketId !== newTicket.ticketId),
      ]);

      showToast({
        type: "warning",
        title: `Đã đẩy cảnh báo ${result.scamReport.riskLevel} sang Fintech Ops`,
        description: `Ticket ${newTicket.ticketId} (${formatVND(
          newTicket.amount
        )}) đã được đồng bộ thời gian thực sang Tab 2.`,
      });
    }
  };

  const handleRequestBiometric = () => {
    setIsBiometricOpen(true);
  };

  const handleBiometricVerified = (verifyResult: VerifyFaceResponse) => {
    if (verifyResult.matched) {
      setIsBiometricVerified(true);
      setIsBiometricOpen(false);
      showToast({
        type: "success",
        title: "Xác thực khuôn mặt thành công",
        description: `Độ khớp ${verifyResult.similarity}%. Bạn có thể xác nhận chuyển tiền ngay bây giờ.`,
      });
    }
  };

  const handleConfirmTransfer = (analysis: TransactionAnalysisResponse) => {
    if (analysis.parsedAmount <= 0 || analysis.parsedAmount > balance) {
      return;
    }

    setBalance((prev) => Math.max(0, prev - analysis.parsedAmount));
    setBudgets((prev) =>
      prev.map((budget) =>
        budget.name === analysis.category
          ? { ...budget, spent: budget.spent + analysis.parsedAmount }
          : budget
      )
    );
    setTransactionStatus("completed");
    setIsBiometricOpen(false);

    showToast({
      type: "success",
      title: `Chuyển tiền thành công ${formatVND(analysis.parsedAmount)}`,
      description: `Đã chuyển tới ${analysis.recipient} • Cập nhật ngân sách "${analysis.category}".`,
    });
  };

  const handleCancelTransaction = () => {
    setTransactionStatus("cancelled");
    setIsBiometricOpen(false);
    setIsBiometricVerified(false);
    showToast({
      type: "info",
      title: "Giao dịch đã được hủy an toàn",
      description: "Số dư ví và ngân sách của bạn vẫn được giữ nguyên.",
    });
  };

  const handleBlockTicket = (ticketId: string, recipient: string) => {
    setOpsTickets((prev) =>
      prev.map((ticket) =>
        ticket.ticketId === ticketId ? { ...ticket, status: "BLOCKED" } : ticket
      )
    );

    const normalizedRecipient = recipient.trim();
    if (normalizedRecipient) {
      setBlacklist((prev) => {
        const exists = prev.some(
          (item) =>
            item.trim().toLowerCase() === normalizedRecipient.toLowerCase()
        );
        return exists ? prev : [normalizedRecipient, ...prev];
      });
    }

    showToast({
      type: "warning",
      title: "Đã chặn giao dịch & cập nhật Blacklist",
      description: `Đối tượng "${normalizedRecipient}" đã được đưa vào danh sách đen thời gian thực ở cả Tab 1 và Tab 2.`,
    });
  };

  const handleApproveTicket = (ticketId: string) => {
    setOpsTickets((prev) =>
      prev.map((ticket) =>
        ticket.ticketId === ticketId
          ? { ...ticket, status: "APPROVED" }
          : ticket
      )
    );

    showToast({
      type: "success",
      title: `Đã phê duyệt an toàn (${ticketId})`,
      description: "Ticket cảnh báo đã được đánh dấu là giao dịch hợp lệ.",
    });
  };

  const handleResetDemo = () => {
    setBalance(DEFAULT_WALLET_BALANCE);
    setBudgets(DEFAULT_BUDGETS.map((b) => ({ ...b })));
    setBlacklist([...DEFAULT_BLACKLIST]);
    setAnalysisResult(null);
    setIsAnalyzing(false);
    setTransactionStatus("idle");
    setIsBiometricOpen(false);
    setIsBiometricVerified(false);
    setOpsTickets(DEFAULT_OPS_TICKETS.map((t) => ({ ...t })));
    setResetKey((prev) => prev + 1);
    setToast(null);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2200);
  };

  // 1. Màn hình đăng nhập nhanh (mặc định khi mới mở trang)
  if (!isLoggedIn) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#fdf2f8] via-white to-slate-100 px-4 py-12">
        {/* Hiệu ứng nền nhẹ nhàng tông tím hồng MoMo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#d82d8b]/12 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-[#a50064]/10 blur-3xl"
        />

        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-pink-100 bg-white/95 p-8 shadow-xl shadow-[#a50064]/8 backdrop-blur-md sm:p-10">
          {/* Badge AWS */}
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-200/80 bg-pink-50 px-3.5 py-1 text-xs font-semibold text-[#a50064]">
              <Cloud className="h-3.5 w-3.5" />
              AWS Serverless Powered
            </span>
          </div>

          {/* Logo TrustPay AI */}
          <div className="flex flex-col items-center text-center">
            <div className="mb-5 flex h-18 w-18 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-lg shadow-[#a50064]/30">
              <ShieldCheck className="h-10 w-10" strokeWidth={2.2} />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              TrustPay{" "}
              <span className="bg-gradient-to-r from-[#a50064] to-[#d82d8b] bg-clip-text text-transparent">
                AI
              </span>
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Ví thanh toán thông minh tích hợp Lá chắn AI chống lừa đảo thời
              gian thực.
            </p>
          </div>

          {/* Thông tin nhanh tài khoản Demo */}
          <div className="mt-7 grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-[#a50064]">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <p className="text-slate-500">Số dư Demo</p>
                <p className="font-mono font-semibold text-slate-900">
                  {formatVND(DEFAULT_WALLET_BALANCE)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-100 text-[#a50064]">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-slate-500">Chế độ trải nghiệm</p>
                <p className="font-semibold text-slate-900">User &amp; Ops</p>
              </div>
            </div>
          </div>

          {/* Nút đăng nhập nhanh */}
          <button
            type="button"
            onClick={() => setIsLoggedIn(true)}
            className="group mt-7 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-6 py-4 text-base font-semibold text-white shadow-lg shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99]"
          >
            <Sparkles className="h-5 w-5 shrink-0" />
            <span>Đăng nhập nhanh bằng Tài khoản Demo (Ban Giám Khảo)</span>
            <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
          </button>

          <p className="mt-5 text-center text-xs text-slate-400">
            Không cần mật khẩu • Dữ liệu giả lập an toàn có thể Reset bất cứ lúc
            nào
          </p>
        </div>
      </div>
    );
  }

  // 2. Giao diện ứng dụng chính sau khi đăng nhập
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header cố định */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Trái: Logo + Tên hệ thống + Badge AWS */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
              <ShieldCheck className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  TrustPay <span className="text-[#a50064]">AI</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-0.5 text-[11px] font-semibold text-[#a50064]">
                  <Cloud className="h-3 w-3" />
                  AWS Serverless Powered
                </span>
              </div>
              <span className="text-xs text-slate-500">
                Tài khoản Demo • Ban Giám Khảo
              </span>
            </div>
          </div>

          {/* Giữa: Thanh chuyển đổi nhanh 2 Tab */}
          <nav
            aria-label="Chuyển đổi phân hệ"
            className="order-3 flex w-full items-center justify-center rounded-2xl bg-slate-100 p-1 lg:order-2 lg:w-auto"
          >
            <button
              type="button"
              onClick={() => setActiveTab("user-wallet")}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all lg:flex-initial ${
                activeTab === "user-wallet"
                  ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              <Wallet className="h-4 w-4 shrink-0" />
              <span>Ví Người Dùng &amp; Lá Chắn AI</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("fintech-ops")}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all lg:flex-initial ${
                activeTab === "fintech-ops"
                  ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
              }`}
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Fintech Future Workspace (Ops)</span>
              <span
                title={`${pendingAlertsCount} cảnh báo đang chờ xử lý`}
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-xs font-bold ${
                  activeTab === "fintech-ops"
                    ? "bg-white text-[#a50064]"
                    : pendingAlertsCount > 0
                      ? "bg-rose-600 text-white"
                      : "bg-slate-200 text-slate-600"
                }`}
              >
                {pendingAlertsCount}
              </span>
            </button>
          </nav>

          {/* Phải: Nút Reset dữ liệu Demo */}
          <div className="order-2 flex items-center gap-2 lg:order-3">
            <button
              type="button"
              onClick={handleResetDemo}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all sm:text-sm ${
                resetDone
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-700 hover:border-pink-300 hover:bg-pink-50 hover:text-[#a50064]"
              }`}
            >
              {resetDone ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Đã khôi phục!</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset dữ liệu Demo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Thông báo Toast thời gian thực */}
      {toast && (
        <div className="fixed right-4 bottom-4 z-50 w-full max-w-sm">
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-md ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
                : toast.type === "warning"
                  ? "border-rose-200 bg-rose-50/95 text-rose-900"
                  : "border-slate-200 bg-white/95 text-slate-800"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : toast.type === "warning" ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            ) : (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#a50064]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">{toast.title}</p>
              <p className="mt-0.5 text-xs opacity-85">{toast.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Đóng thông báo"
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg opacity-60 hover:bg-black/5 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Nội dung chính: Tab 1 (Ví Người Dùng) & Tab 2 (Fintech Ops) */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === "user-wallet" ? (
          <section
            aria-label="Ví Người Dùng & Lá Chắn AI"
            className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12"
          >
            {/* Cột trái: Số dư ví, Ngân sách & Blacklist */}
            <div className="lg:col-span-4">
              <WalletSidebar
                walletBalance={balance}
                budgets={budgets}
                blacklist={blacklist}
              />
            </div>

            {/* Cột phải: Nhập lệnh chuyển tiền & Báo cáo Lá chắn AI */}
            <div className="flex flex-col gap-6 lg:col-span-8">
              <TransactionInputPanel
                key={resetKey}
                budgets={budgets}
                blacklist={blacklist}
                onAnalysisComplete={handleAnalysisComplete}
                onAnalyzingChange={setIsAnalyzing}
              />

              <AiShieldResultPanel
                analysis={analysisResult}
                walletBalance={balance}
                isAnalyzing={isAnalyzing}
                transactionStatus={transactionStatus}
                biometricVerified={isBiometricVerified}
                onConfirmTransfer={handleConfirmTransfer}
                onRequestBiometric={handleRequestBiometric}
                onCancelTransaction={handleCancelTransaction}
              />
            </div>
          </section>
        ) : (
          <section
            aria-label="Fintech Future Workspace (Ops)"
            className="flex flex-1 flex-col"
          >
            <FraudOpsDashboard
              tickets={opsTickets}
              blacklist={blacklist}
              onBlockTicket={handleBlockTicket}
              onApproveTicket={handleApproveTicket}
            />
          </section>
        )}
      </main>

      {/* Modal xác thực Sinh trắc học Khuôn mặt */}
      <BiometricModal
        isOpen={isBiometricOpen}
        recipient={analysisResult?.recipient}
        amount={analysisResult?.parsedAmount}
        riskScore={analysisResult?.scamReport.riskScore}
        onClose={() => setIsBiometricOpen(false)}
        onVerified={handleBiometricVerified}
        onCancelTransaction={handleCancelTransaction}
      />
    </div>
  );
}

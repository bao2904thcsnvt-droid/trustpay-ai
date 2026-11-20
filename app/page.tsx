"use client";

import { useState } from "react";
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
  Layers,
  Activity,
} from "lucide-react";
import type { BudgetCategory, FintechOpsTicket } from "@/types/trustpay";

const DEFAULT_WALLET_BALANCE = 15_000_000;

const DEFAULT_BUDGETS: BudgetCategory[] = [
  { id: "b1", name: "Ăn uống", limit: 3_000_000, spent: 1_200_000 },
  { id: "b2", name: "Mua sắm", limit: 4_000_000, spent: 2_500_000 },
  { id: "b3", name: "Di chuyển", limit: 1_000_000, spent: 400_000 },
  { id: "b4", name: "Khác", limit: 2_000_000, spent: 500_000 },
];

const DEFAULT_BLACKLIST: string[] = ["1903888999", "0912345678"];

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

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + "đ";
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("user-wallet");

  // Trạng thái cốt lõi của ứng dụng Demo (sẵn sàng truyền xuống các component con)
  const [walletBalance, setWalletBalance] = useState<number>(
    DEFAULT_WALLET_BALANCE
  );
  const [budgets, setBudgets] = useState<BudgetCategory[]>(() =>
    DEFAULT_BUDGETS.map((b) => ({ ...b }))
  );
  const [blacklist, setBlacklist] = useState<string[]>([...DEFAULT_BLACKLIST]);
  const [opsTickets, setOpsTickets] = useState<FintechOpsTicket[]>(() =>
    DEFAULT_OPS_TICKETS.map((t) => ({ ...t }))
  );
  const [resetDone, setResetDone] = useState(false);

  const pendingAlertsCount = opsTickets.filter(
    (ticket) => ticket.status === "PENDING"
  ).length;

  const totalBudgetLimit = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalBudgetSpent = budgets.reduce((sum, b) => sum + b.spent, 0);

  const handleResetDemo = () => {
    setWalletBalance(DEFAULT_WALLET_BALANCE);
    setBudgets(DEFAULT_BUDGETS.map((b) => ({ ...b })));
    setBlacklist([...DEFAULT_BLACKLIST]);
    setOpsTickets(DEFAULT_OPS_TICKETS.map((t) => ({ ...t })));
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
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {/* Trái: Logo + Tên hệ thống + Badge AWS */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
              <ShieldCheck className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-slate-900">
                  TrustPay{" "}
                  <span className="text-[#a50064]">AI</span>
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

      {/* 3. Nội dung chính: 2 khung placeholder sạch sẽ cho Tab 1 & Tab 2 */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === "user-wallet" ? (
          <section
            aria-label="Ví Người Dùng & Lá Chắn AI"
            className="flex flex-1 flex-col gap-6"
          >
            {/* Thanh tóm tắt nhanh trạng thái ví hiện tại */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] p-5 text-white shadow-md shadow-[#a50064]/15">
                <p className="text-xs font-medium text-pink-100">
                  Số dư Ví TrustPay
                </p>
                <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight">
                  {formatVND(walletBalance)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <p className="text-xs font-medium text-slate-500">
                  Ngân sách đã chi / Tổng hạn mức
                </p>
                <p className="mt-1.5 font-mono text-xl font-bold text-slate-900">
                  {formatVND(totalBudgetSpent)}{" "}
                  <span className="text-sm font-normal text-slate-400">
                    / {formatVND(totalBudgetLimit)}
                  </span>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <p className="text-xs font-medium text-slate-500">
                  Trạng thái Lá chắn AI
                </p>
                <p className="mt-1.5 flex items-center gap-2 text-base font-semibold text-emerald-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Đang bảo vệ thời gian thực
                </p>
              </div>
            </div>

            {/* Khung Placeholder cho các component con của Tab 1 */}
            <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-pink-200 bg-white/80 p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
                <Layers className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Khung Ví Người Dùng &amp; Lá Chắn AI
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Khu vực sẵn sàng để tích hợp các component con:{" "}
                <span className="font-medium text-slate-700">
                  Quản lý ngân sách ({budgets.length} danh mục)
                </span>
                ,{" "}
                <span className="font-medium text-slate-700">
                  Chuyển tiền bằng ngôn ngữ tự nhiên &amp; Ảnh hóa đơn
                </span>
                , và{" "}
                <span className="font-medium text-slate-700">
                  Xác thực khuôn mặt sinh trắc học
                </span>
                .
              </p>
            </div>
          </section>
        ) : (
          <section
            aria-label="Fintech Future Workspace (Ops)"
            className="flex flex-1 flex-col gap-6"
          >
            {/* Thanh tóm tắt nhanh trạng thái Ops */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
                <p className="text-xs font-medium text-rose-700">
                  Cảnh báo đang chờ xử lý (PENDING)
                </p>
                <p className="mt-1.5 font-mono text-2xl font-bold text-rose-700">
                  {pendingAlertsCount}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <p className="text-xs font-medium text-slate-500">
                  Tổng số Ticket giám sát
                </p>
                <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900">
                  {opsTickets.length}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <p className="text-xs font-medium text-slate-500">
                  Tài khoản trong Blacklist
                </p>
                <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900">
                  {blacklist.length}
                </p>
              </div>
            </div>

            {/* Khung Placeholder cho các component con của Tab 2 */}
            <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white/80 p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
                <Activity className="h-7 w-7" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Khung Fintech Future Workspace (Ops)
              </h2>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Khu vực sẵn sàng để tích hợp các component vận hành rủi ro:{" "}
                <span className="font-medium text-slate-700">
                  Danh sách Ticket cảnh báo AI
                </span>
                ,{" "}
                <span className="font-medium text-slate-700">
                  Phê duyệt / Chặn giao dịch nghi ngờ
                </span>
                , và{" "}
                <span className="font-medium text-slate-700">
                  Quản trị danh sách đen (Blacklist)
                </span>
                .
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

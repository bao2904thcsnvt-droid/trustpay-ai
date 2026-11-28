"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { findInstitution } from "@/lib/payments/banks";
import type { StoredLinkedAccount } from "@/lib/hub/hub-store";
import type { BankSyncEvent, BankSyncGetResponse, BankSyncProvider } from "@/lib/banking/bank-sync";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useI18n } from "@/components/i18n/I18nProvider";

/** Khóa lưu SePay API Token trên trình duyệt người dùng để tự động kéo số dư thật mỗi 10 giây. */
export const SEPAY_API_TOKEN_STORAGE_KEY = "trustpay-ai.sepay-token.v1";

export function readSavedSepayToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SEPAY_API_TOKEN_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveSepayToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const clean = token.trim();
    if (clean) {
      window.localStorage.setItem(SEPAY_API_TOKEN_STORAGE_KEY, clean);
    } else {
      window.localStorage.removeItem(SEPAY_API_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Bỏ qua nếu trình duyệt chặn storage.
  }
}

export interface BankSyncModalProps {
  account: StoredLinkedAccount;
  onClose: () => void;
  /** Gọi ngay sau khi kéo số dư thật từ SePay API hoặc reset số dư thử nghiệm. */
  onSynced: (newBalance: number | null, event: BankSyncEvent | null) => void;
}

const PROVIDER_META: Record<
  BankSyncProvider,
  {
    name: string;
    shortName: string;
    desc: string;
    dashboardUrl: string;
    dashboardLabel: string;
    signupUrl: string;
    docsUrl: string;
    steps: string;
  }
> = {
  sepay: {
    name: "SePay (Miễn phí 0đ)",
    shortName: "SePay",
    desc: "Hỗ trợ VietinBank, VCB, MB, TCB, BIDV, ACB, TPB…",
    dashboardUrl: "https://my.sepay.vn/webhooks",
    dashboardLabel: "Mở Webhooks SePay",
    signupUrl: "https://sepay.vn",
    docsUrl: "https://docs.sepay.vn",
    steps: "Đăng nhập my.sepay.vn → Tích hợp WebHooks → Thêm Webhook → chọn 'Cả hai' (tiền vào/ra), TẮT 'Chỉ gửi khi có mã thanh toán'.",
  },
  casso: {
    name: "Casso (Miễn phí 0đ)",
    shortName: "Casso",
    desc: "Nhận biến động giao dịch chuẩn mảng data[]",
    dashboardUrl: "https://my.casso.vn",
    dashboardLabel: "Mở my.casso.vn",
    signupUrl: "https://casso.vn",
    docsUrl: "https://developer.casso.vn",
    steps: "Đăng nhập my.casso.vn → Kết nối / Tích hợp → Thêm Webhook → dán URL bên trên và điền mã bảo mật vào 'secure-token'.",
  },
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback phía dưới
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Màn hình kết nối Đồng bộ số dư thật 1 chạm (SePay API kéo trực tiếp + Webhook SePay / Casso).
 * Dùng màu hex tường minh trên bề mặt tối `#090D16` để luôn sắc nét ở cả Dark & Light mode.
 */
export default function BankSyncModal({ account, onClose, onSynced }: BankSyncModalProps) {
  const hasMounted = useHasMounted();
  const { money } = useI18n();
  const institution = findInstitution(account.institutionCode);

  const [provider, setProvider] = useState<BankSyncProvider>("sepay");
  const [sepayApiToken, setSepayApiToken] = useState(() => readSavedSepayToken());
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [webhookToken, setWebhookToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);

  const webhookUrl = hasMounted ? `${window.location.origin}/api/bank/sync` : "/api/bank/sync";
  const currentMeta = PROVIDER_META[provider];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopyUrl = async () => {
    const ok = await copyToClipboard(webhookUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  /** Kéo trực tiếp số dư thật từ SePay API — hiển thị đúng số dư thật ngay lập tức (không cần đợi giao dịch mới). */
  const handlePullRealSepayBalance = async () => {
    const token = sepayApiToken.trim();
    if (!token) {
      setPullResult({
        ok: false,
        message: "Hãy tạo API Token tại my.sepay.vn/companyapi (+ Thêm API) rồi dán vào ô trên.",
      });
      return;
    }
    setPulling(true);
    setPullResult(null);
    saveSepayToken(token);
    try {
      const res = await fetch(
        `/api/bank/sync?accountNumber=${encodeURIComponent(account.accountNumber)}&pull=sepay`,
        {
          headers: { "x-sepay-api-token": token },
          cache: "no-store",
        },
      );
      const data = (await res.json()) as Partial<BankSyncGetResponse> & { message?: string };
      if (!res.ok || !data.ok || !data.synced || typeof data.newBalance !== "number") {
        setPullResult({
          ok: false,
          message: data.message ?? "Không kéo được số dư từ SePay API. Kiểm tra lại API Token và STK đã liên kết.",
        });
      } else {
        setPullResult({
          ok: true,
          message: `Đã đồng bộ số dư thật từ SePay: ${money(data.newBalance)}! Từ giờ thẻ sẽ tự cập nhật mỗi 10 giây.`,
        });
        onSynced(data.newBalance, data.latestEvent ?? null);
      }
    } catch {
      setPullResult({
        ok: false,
        message: "Lỗi kết nối khi gọi /api/bank/sync. Vui lòng thử lại.",
      });
    } finally {
      setPulling(false);
    }
  };

  /** Test Ping ở chế độ dryRun: kiểm tra đường truyền Webhook OK mà KHÔNG ghi đè số dư giả lên thẻ thật. */
  const handleTestPing = async () => {
    if (pinging) return;
    setPinging(true);
    setPingResult(null);

    const bankName = institution?.shortName ?? account.institutionCode;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const sepayDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const refId = `TP-PING-${now.getTime().toString().slice(-6)}`;

    const body =
      provider === "sepay"
        ? {
            dryRun: true,
            gateway: bankName,
            transactionDate: sepayDate,
            accountNumber: account.accountNumber,
            transferType: "in",
            transferAmount: 1_000,
            accumulated: account.referenceBalance ?? 0,
            content: `TRUSTPAY TEST PING ${bankName}`,
            referenceCode: refId,
          }
        : {
            dryRun: true,
            error: 0,
            bankName,
            data: [
              {
                tid: refId,
                description: `TRUSTPAY TEST PING ${bankName}`,
                amount: 1_000,
                cusum_balance: account.referenceBalance ?? 0,
                when: now.toISOString(),
                bankSubAccId: account.accountNumber,
                bankName,
              },
            ],
          };

    const headers: Record<string, string> = { "content-type": "application/json" };
    const cleanToken = webhookToken.trim();
    if (cleanToken) {
      if (provider === "sepay") {
        headers["Authorization"] = `Apikey ${cleanToken}`;
      } else {
        headers["secure-token"] = cleanToken;
      }
    }

    try {
      const res = await fetch("/api/bank/sync", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; bankCode?: string };
      if (!res.ok || !data.ok) {
        setPingResult({
          ok: false,
          message: data.message ?? `Máy chủ trả lỗi HTTP ${res.status}. Kiểm tra lại Webhook Token.`,
        });
      } else {
        setPingResult({
          ok: true,
          message: `Đường truyền Webhook ${currentMeta.shortName} hoạt động tốt (HTTP 200 OK · ${data.bankCode ?? bankName} · ${refId}). Không ghi đè số dư thật của bạn.`,
        });
      }
    } catch {
      setPingResult({
        ok: false,
        message: "Không gọi được /api/bank/sync. Kiểm tra kết nối mạng rồi thử lại.",
      });
    } finally {
      setPinging(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-bank-sync-title"
      className="fixed inset-0 z-[85] flex items-end justify-center bg-[rgba(2,6,23,0.8)] p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-[rgba(255,255,255,0.14)] bg-[#090D16] text-[#F8FAFC] shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 border-b border-[rgba(255,255,255,0.12)] px-5 py-4"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #3b0764 55%, #831843 100%)" }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(16,185,129,0.2)] text-[#6EE7B7] ring-1 ring-[rgba(52,211,153,0.35)]">
              <RefreshCw className="h-5 w-5" />
            </span>
            <div>
              <h2 id="tp-bank-sync-title" className="text-base font-extrabold text-[#FFFFFF]">
                Đồng bộ số dư thật tự động
              </h2>
              <p className="mt-0.5 text-xs text-[#E2E8F0]">
                {institution?.shortName ?? account.institutionCode} •{" "}
                <span className="font-mono text-[#FBCFE8]">•••• {account.last4}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng đồng bộ"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[rgba(255,255,255,0.12)] text-[#FFFFFF] transition-colors hover:bg-[rgba(255,255,255,0.22)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[82vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* CÁCH NHANH NHẤT: Kéo số dư thật trực tiếp từ SePay API (không cần đợi giao dịch mới) */}
          <div className="space-y-2.5 rounded-2xl border border-[rgba(56,189,248,0.4)] bg-[rgba(14,165,233,0.12)] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#BAE6FD]">
                <Zap className="h-4 w-4 text-[#38BDF8]" />
                Kéo số dư thật ngay lập tức (SePay API)
              </span>
              <a
                href="https://my.sepay.vn/companyapi"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-[#38BDF8] px-2.5 py-1 text-[11px] font-extrabold text-[#090D16] hover:opacity-90"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Lấy API Token ↗</span>
              </a>
            </div>
            <p className="text-[11px] leading-relaxed text-[#E2E8F0]">
              Vào <strong>my.sepay.vn/companyapi</strong> → bấm <strong>+ Thêm API</strong> → copy Token dán vào đây để đọc
              đúng số dư thật của STK <code className="font-mono text-[#7DD3FC]">{account.accountNumber}</code> ngay lập
              tức (tự cập nhật mỗi 10 giây, không cần đợi phát sinh giao dịch mới).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={sepayApiToken}
                type="password"
                autoComplete="off"
                onChange={(e) => setSepayApiToken(e.target.value)}
                placeholder="Dán SePay API Token tại đây…"
                className="min-w-0 flex-1 rounded-xl border border-[rgba(255,255,255,0.2)] bg-[#020617] px-3 py-2 font-mono text-xs text-[#FFFFFF] placeholder:text-[#94A3B8] focus:border-[#38BDF8] focus:outline-none"
              />
              <button
                type="button"
                disabled={pulling}
                onClick={() => void handlePullRealSepayBalance()}
                className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#38BDF8] px-3.5 py-2 text-xs font-extrabold text-[#090D16] transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>{pulling ? "Đang kéo…" : "Kéo số dư thật"}</span>
              </button>
            </div>
            {pullResult && (
              <div
                role="status"
                className={`rounded-xl border p-2.5 text-xs font-semibold leading-relaxed ${
                  pullResult.ok
                    ? "border-[rgba(52,211,153,0.5)] bg-[rgba(6,95,70,0.65)] text-[#ECFDF5]"
                    : "border-[rgba(251,113,133,0.5)] bg-[rgba(136,19,55,0.65)] text-[#FFF1F2]"
                }`}
              >
                {pullResult.message}
              </div>
            )}
            {account.referenceBalance !== null && (
              <button
                type="button"
                onClick={() => {
                  saveSepayToken("");
                  setSepayApiToken("");
                  onSynced(null, null);
                  setPullResult({ ok: true, message: "Đã xóa số dư cũ trên thẻ." });
                }}
                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#FDA4AF] underline-offset-2 hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                <span>Xóa số dư đang hiển thị trên thẻ ({money(account.referenceBalance)})</span>
              </button>
            )}
          </div>

          {/* 1. Chọn cổng Webhook */}
          <div>
            <p className="mb-2 text-xs font-bold text-[#E2E8F0]">1. Hoặc cấu hình Webhook nhận biến động tức thì</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["sepay", "casso"] as const).map((id) => {
                const item = PROVIDER_META[id];
                const active = provider === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setProvider(id);
                      setPingResult(null);
                    }}
                    className={`cursor-pointer rounded-2xl border p-3 text-left transition-all ${
                      active
                        ? "border-[#F472B6] bg-[rgba(216,45,139,0.18)] ring-2 ring-[rgba(244,114,182,0.3)]"
                        : "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#FFFFFF]">{item.name}</span>
                      {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#34D399]" />}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#CBD5E1]">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Đường link Webhook đầy đủ + link mở trực tiếp SePay / Casso */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#E2E8F0]">
              2. Dán URL Webhook này vào trang quản trị {currentMeta.shortName}
            </p>
            <div className="flex items-center gap-2 rounded-2xl border border-[rgba(255,255,255,0.16)] bg-[#020617] p-2">
              <code className="min-w-0 flex-1 truncate px-2 font-mono text-xs text-[#38BDF8]">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => void handleCopyUrl()}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#FFFFFF] px-3 py-2 text-xs font-extrabold text-[#0F172A] transition-colors hover:bg-[#FCE7F3]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#059669]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Đã chép" : "Sao chép"}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <a
                href={currentMeta.dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#38BDF8] px-3 py-1.5 text-xs font-extrabold text-[#090D16] transition-opacity hover:opacity-90"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span>{currentMeta.dashboardLabel}</span>
              </a>
              <a
                href={currentMeta.signupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs font-bold text-[#F8FAFC] transition-colors hover:bg-[rgba(255,255,255,0.16)]"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#F472B6]" />
                <span>Đăng ký {currentMeta.shortName} miễn phí</span>
              </a>
              <a
                href={currentMeta.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-semibold text-[#CBD5E1] transition-colors hover:bg-[rgba(255,255,255,0.12)] hover:text-[#FFFFFF]"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#6EE7B7]" />
                <span>Hướng dẫn Webhook</span>
              </a>
            </div>

            <p className="text-[11px] leading-relaxed text-[#CBD5E1]">{currentMeta.steps}</p>
          </div>

          {/* 3. Mã Webhook Token (tùy chọn) */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#E2E8F0]">
              <KeyRound className="h-3.5 w-3.5 text-[#F472B6]" />
              <span>3. Mã Webhook Token (tùy chọn — khớp WEBHOOK_SECRET_KEY trên máy chủ)</span>
            </span>
            <input
              value={webhookToken}
              type="password"
              autoComplete="off"
              onChange={(e) => setWebhookToken(e.target.value)}
              placeholder="Để trống nếu chưa cấu hình WEBHOOK_SECRET_KEY trong .env.local"
              className="w-full rounded-2xl border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.07)] px-3.5 py-2.5 font-mono text-xs text-[#FFFFFF] placeholder:text-[#94A3B8] focus:border-[#F472B6] focus:outline-none"
            />
          </label>

          {/* 4. Bắn thử tín hiệu Webhook (Test Ping — dryRun không ghi đè số dư thật) */}
          <div className="rounded-2xl border border-[rgba(52,211,153,0.35)] bg-[rgba(16,185,129,0.12)] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#A7F3D0]">
                <Radio className="h-4 w-4 text-[#34D399]" />
                Kiểm tra đường truyền Webhook
              </span>
              <span className="rounded-full bg-[rgba(52,211,153,0.22)] px-2 py-0.5 font-mono text-[10px] font-bold text-[#A7F3D0]">
                Poll tự động 10s
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#E2E8F0]">
              Kiểm tra endpoint <code className="font-mono font-semibold text-[#6EE7B7]">/api/bank/sync</code> nhận chuẩn{" "}
              {currentMeta.shortName} (chế độ <code className="font-mono">dryRun</code> — không ghi đè số dư thật).
            </p>

            <button
              type="button"
              disabled={pinging}
              onClick={() => void handleTestPing()}
              style={{ background: "linear-gradient(90deg, #a50064 0%, #d82d8b 100%)" }}
              className="mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold text-[#FFFFFF] shadow-md transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{pinging ? "Đang gửi tín hiệu Webhook…" : "Bắn thử tín hiệu Webhook (Test Ping)"}</span>
            </button>

            {pingResult && (
              <div
                role="status"
                className={`mt-3 rounded-xl border p-2.5 text-xs font-semibold leading-relaxed ${
                  pingResult.ok
                    ? "border-[rgba(52,211,153,0.5)] bg-[rgba(6,95,70,0.65)] text-[#ECFDF5]"
                    : "border-[rgba(251,113,133,0.5)] bg-[rgba(136,19,55,0.65)] text-[#FFF1F2]"
                }`}
              >
                {pingResult.message}
              </div>
            )}
          </div>

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[#CBD5E1]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#34D399]" />
            <span>
              Non-Custodial: TrustPay AI chỉ nhận tín hiệu biến động chỉ-đọc từ SePay/Casso để hiển thị số dư thật, tuyệt
              đối không yêu cầu mật khẩu đăng nhập hay quyền trích tiền từ ngân hàng của bạn.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

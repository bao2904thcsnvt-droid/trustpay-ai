"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { findInstitution } from "@/lib/payments/banks";
import type { StoredLinkedAccount } from "@/lib/hub/hub-store";
import type { BankSyncEvent, BankSyncProvider } from "@/lib/banking/bank-sync";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface BankSyncModalProps {
  account: StoredLinkedAccount;
  onClose: () => void;
  /** Gọi ngay sau khi Test Ping hoặc đồng bộ trả về số dư thật mới nhất. */
  onSynced: (newBalance: number | null, event: BankSyncEvent | null) => void;
}

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
 * Màn hình kết nối Đồng bộ số dư thật 1 chạm qua Webhook (SePay / Casso).
 * - Hiển thị URL Webhook đầy đủ của trang web hiện tại + nút Sao chép 1 chạm.
 * - Chọn cổng SePay (Miễn phí 0đ) hoặc Casso (Miễn phí 0đ), nhập Webhook Token (tùy chọn).
 * - Nút "Bắn thử tín hiệu Webhook (Test Ping)" gọi thật tới POST /api/bank/sync để kiểm tra tức thì.
 */
export default function BankSyncModal({ account, onClose, onSynced }: BankSyncModalProps) {
  const hasMounted = useHasMounted();
  const { money } = useI18n();
  const institution = findInstitution(account.institutionCode);

  const [provider, setProvider] = useState<BankSyncProvider>("sepay");
  const [webhookToken, setWebhookToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<
    | { ok: true; message: string; event: BankSyncEvent | null; newBalance: number | null }
    | { ok: false; message: string }
    | null
  >(null);

  const webhookUrl = hasMounted ? `${window.location.origin}/api/bank/sync` : "/api/bank/sync";

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

  const handleTestPing = async () => {
    if (pinging) return;
    setPinging(true);
    setPingResult(null);

    const bankName = institution?.shortName ?? account.institutionCode;
    const baseBalance = account.referenceBalance !== null ? account.referenceBalance : 10_000_000;
    const delta = 50_000;
    const simulatedBalance = baseBalance + delta;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const sepayDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const refId = `TP-PING-${now.getTime().toString().slice(-6)}`;

    const body =
      provider === "sepay"
        ? {
            gateway: bankName,
            transactionDate: sepayDate,
            accountNumber: account.accountNumber,
            transferType: "in",
            transferAmount: delta,
            accumulated: simulatedBalance,
            content: `TRUSTPAY TEST PING ${bankName}`,
            referenceCode: refId,
          }
        : {
            error: 0,
            bankName,
            data: [
              {
                tid: refId,
                description: `TRUSTPAY TEST PING ${bankName}`,
                amount: delta,
                cusum_balance: simulatedBalance,
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
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        newBalance?: number | null;
        latestEvent?: BankSyncEvent | null;
      };
      if (!res.ok || !data.ok) {
        setPingResult({
          ok: false,
          message: data.message ?? `Máy chủ trả lỗi HTTP ${res.status}. Kiểm tra lại Webhook Token.`,
        });
      } else {
        const nextBalance = typeof data.newBalance === "number" ? data.newBalance : null;
        const latestEvent = data.latestEvent ?? null;
        setPingResult({
          ok: true,
          message: `Tín hiệu ${provider === "sepay" ? "SePay" : "Casso"} đã khớp! Số dư đồng bộ tức thời: ${
            nextBalance !== null ? money(nextBalance) : "—"
          } (${refId}).`,
          event: latestEvent,
          newBalance: nextBalance,
        });
        onSynced(nextBalance, latestEvent);
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
      className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-slate-700/60 bg-[#090D16] text-slate-100 shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#0f172a] via-[#2e1065]/60 to-[#831843]/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
              <RefreshCw className="h-5 w-5" />
            </span>
            <div>
              <h2 id="tp-bank-sync-title" className="text-base font-extrabold text-white">
                Đồng bộ số dư thật tự động
              </h2>
              <p className="mt-0.5 text-xs text-slate-300">
                {institution?.shortName ?? account.institutionCode} •{" "}
                <span className="font-mono text-pink-200">•••• {account.last4}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng đồng bộ"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-slate-200 transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[82vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* 1. Chọn cổng kết nối */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-300">1. Chọn cổng Webhook nhận biến động số dư</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    id: "sepay",
                    name: "SePay (Miễn phí 0đ)",
                    desc: "Hỗ trợ VietinBank, VCB, MB, TCB, BIDV, ACB, TPB…",
                  },
                  {
                    id: "casso",
                    name: "Casso (Miễn phí 0đ)",
                    desc: "Nhận biến động giao dịch chuẩn mảng data[]",
                  },
                ] as const
              ).map((item) => {
                const active = provider === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setProvider(item.id);
                      setPingResult(null);
                    }}
                    className={`cursor-pointer rounded-2xl border p-3 text-left transition-all ${
                      active
                        ? "border-pink-400 bg-pink-500/15 ring-2 ring-pink-400/30"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-white">{item.name}</span>
                      {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Đường link Webhook đầy đủ + sao chép 1 chạm */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-300">
              2. Dán URL Webhook này vào trang quản trị {provider === "sepay" ? "SePay" : "Casso"}
            </p>
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/40 p-2">
              <code className="min-w-0 flex-1 truncate px-2 font-mono text-xs text-sky-300">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => void handleCopyUrl()}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-slate-900 transition-colors hover:bg-pink-50"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Đã chép" : "Sao chép"}</span>
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              {provider === "sepay"
                ? "Trên my.sepay.vn → Webhooks → Thêm Webhook → chọn Sự kiện 'Có tiền vào/ra', Kiểu xác thực 'API Key' (Authorization: Apikey <token>)."
                : "Trên my.casso.vn → Tích hợp Webhook → dán URL trên và điền mã bảo mật vào trường 'secure-token'."}
            </p>
          </div>

          {/* 3. Mã Webhook Token (tùy chọn) */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <KeyRound className="h-3.5 w-3.5 text-pink-300" />
              <span>3. Mã Webhook Token (tùy chọn — khớp WEBHOOK_SECRET_KEY trên máy chủ)</span>
            </span>
            <input
              value={webhookToken}
              type="password"
              autoComplete="off"
              onChange={(e) => setWebhookToken(e.target.value)}
              placeholder="Để trống nếu chưa cấu hình WEBHOOK_SECRET_KEY trong .env.local"
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-slate-500 focus:border-pink-400 focus:outline-none"
            />
          </label>

          {/* 4. Bắn thử tín hiệu Webhook (Test Ping) */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-200">
                <Radio className="h-4 w-4 text-emerald-400" />
                Kiểm tra đường truyền trực tiếp
              </span>
              <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200">
                Poll tự động 10s
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
              Bấm nút dưới để gửi 1 gói Webhook chuẩn {provider === "sepay" ? "SePay" : "Casso"} thật tới{" "}
              <code className="font-mono text-emerald-200">/api/bank/sync</code> và xem số dư trên thẻ tự cập nhật ngay.
            </p>

            <button
              type="button"
              disabled={pinging}
              onClick={() => void handleTestPing()}
              className="mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>{pinging ? "Đang gửi tín hiệu Webhook…" : "Bắn thử tín hiệu Webhook (Test Ping)"}</span>
            </button>

            {pingResult && (
              <div
                role="status"
                className={`mt-3 rounded-xl border p-2.5 text-xs leading-relaxed ${
                  pingResult.ok
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : "border-rose-400/40 bg-rose-500/15 text-rose-100"
                }`}
              >
                {pingResult.message}
              </div>
            )}
          </div>

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
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

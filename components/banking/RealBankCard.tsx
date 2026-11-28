"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Landmark,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  findInstitution,
  type PayeeInstitutionCode,
} from "@/lib/payments/banks";
import {
  buildPayeeVietQr,
  normalizeAccountNumber,
  sanitizeAccountName,
  sanitizeMemo,
  validatePayeeAccount,
} from "@/lib/payments/vietqr-builder";
import {
  addLinkedAccount,
  setDefaultSource,
  updateLinkedAccountBalance,
  type StoredLinkedAccount,
} from "@/lib/hub/hub-store";
import type { BankSyncEvent, BankSyncGetResponse } from "@/lib/banking/bank-sync";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { createClientId } from "@/lib/wallet/ledger";
import { parseMoneyInput } from "@/lib/wallet/format";
import {
  BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND,
  BIOMETRIC_SINGLE_TXN_THRESHOLD_VND,
} from "@/lib/compliance/biometric-policy";
import { useI18n } from "@/components/i18n/I18nProvider";
import QrCodeSvg, { downloadQrPng, useQrMatrix } from "@/components/payments/QrCodeSvg";
import BankSyncModal from "@/components/BankSyncModal";

/** 11 ngân hàng & ví phổ biến hiển thị chọn nhanh 1 chạm (đã gồm VietinBank BIN 970415). */
const QUICK_BANKS: readonly { code: PayeeInstitutionCode; label: string }[] = [
  { code: "ICB", label: "VietinBank" },
  { code: "PVCB", label: "PVcomBank" },
  { code: "VCB", label: "Vietcombank" },
  { code: "MB", label: "MBBank" },
  { code: "TCB", label: "Techcombank" },
  { code: "BIDV", label: "BIDV" },
  { code: "ACB", label: "ACB" },
  { code: "TPB", label: "TPBank" },
  { code: "VBA", label: "Agribank" },
  { code: "VPB", label: "VPBank" },
  { code: "MOMO", label: "Ví MoMo" },
];

/** Chu kỳ tự động poll số dư thật từ /api/bank/sync khi tab đang mở (10 giây). */
const BANK_SYNC_POLL_MS = 10_000;

function formatAccountNumberSpaced(raw: string): string {
  return raw.replace(/(.{4})(?=.)/g, "$1 ").trim();
}

export interface RealBankCardProps {
  accounts: StoredLinkedAccount[];
  defaultSourceId: string;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  dailyOutflow: number | null;
  monthlySpent: number;
  monthlyLimit: number;
  demoMode?: boolean;
  demoWalletBalance?: number;
  onStartTransfer: () => void;
  onAccountLinked?: (label: string) => void;
  onSourceChanged?: (label: string) => void;
}

/**
 * Thẻ Ngân hàng Liên kết Thật (Real Non-Custodial Banking Card + SePay / Casso Live Sync):
 * - Không dùng số dư ví ảo mặc định, không bắt người dùng gõ tay số dư.
 * - Tích hợp nút "🔄 Đồng bộ tự động (SePay / Casso)" mở BankSyncModal + tự động poll 10s/lần.
 * - An toàn SSR (`useHasMounted`).
 */
export default function RealBankCard({
  accounts,
  defaultSourceId,
  balanceHidden,
  onToggleBalance,
  dailyOutflow,
  monthlySpent,
  monthlyLimit,
  demoMode = false,
  demoWalletBalance = 0,
  onStartTransfer,
  onAccountLinked,
  onSourceChanged,
}: RealBankCardProps) {
  const hasMounted = useHasMounted();
  const { t, money } = useI18n();

  const realAccounts = useMemo(
    () => accounts.filter((item) => !item.demo && item.accountNumber !== ""),
    [accounts],
  );
  const activeReal = useMemo(
    () => realAccounts.find((item) => item.id === defaultSourceId) ?? realAccounts[0] ?? null,
    [realAccounts, defaultSourceId],
  );

  const [linkOpen, setLinkOpen] = useState(false);
  const [bankCode, setBankCode] = useState<PayeeInstitutionCode>("ICB");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncMetaByAccount, setSyncMetaByAccount] = useState<
    Record<string, { event: BankSyncEvent | null; updatedAt: string }>
  >({});

  const [qrOpen, setQrOpen] = useState(false);
  const [qrAmountText, setQrAmountText] = useState("");
  const [qrMemoText, setQrMemoText] = useState("");

  const activeAccountId = activeReal?.id ?? null;
  const activeAccountNumber = activeReal?.accountNumber ?? null;

  const pollRealBalance = useCallback(
    async (manual = false) => {
      if (!activeAccountId || !activeAccountNumber) return;
      if (manual) setSyncingNow(true);
      try {
        const res = await fetch(`/api/bank/sync?accountNumber=${encodeURIComponent(activeAccountNumber)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as BankSyncGetResponse;
        if (data.ok && data.synced) {
          if (typeof data.newBalance === "number") {
            updateLinkedAccountBalance(activeAccountId, data.newBalance);
          }
          setSyncMetaByAccount((prev) => ({
            ...prev,
            [activeAccountNumber]: {
              event: data.latestEvent,
              updatedAt: data.updatedAt ?? new Date().toISOString(),
            },
          }));
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời trong chu kỳ poll nền.
      } finally {
        if (manual) setSyncingNow(false);
      }
    },
    [activeAccountId, activeAccountNumber],
  );

  // Tự động gọi GET /api/bank/sync định kỳ mỗi 10 giây khi tab đang mở (chỉ chạy sau khi hydrate).
  useEffect(() => {
    if (!hasMounted || !activeAccountId || !activeAccountNumber) return;
    const initial = window.setTimeout(() => {
      void pollRealBalance(false);
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void pollRealBalance(false);
      }
    }, BANK_SYNC_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void pollRealBalance(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasMounted, activeAccountId, activeAccountNumber, pollRealBalance]);

  const daily = dailyOutflow ?? 0;
  const dailyPct = Math.min(100, Math.round((daily / BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND) * 100));
  const monthlyPct = monthlyLimit > 0 ? Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100)) : 0;

  const activeInstitution = activeReal ? findInstitution(activeReal.institutionCode) : undefined;
  const activeSyncMeta = activeAccountNumber ? syncMetaByAccount[activeAccountNumber] : undefined;

  const qrAmount = parseMoneyInput(qrAmountText);
  const qrPayload = useMemo(() => {
    if (!qrOpen || !activeReal) return null;
    try {
      return buildPayeeVietQr(
        {
          institutionCode: activeReal.institutionCode,
          accountNumber: activeReal.accountNumber,
          accountName: activeReal.holderName,
        },
        qrAmount > 0 ? Math.round(qrAmount) : null,
        sanitizeMemo(qrMemoText),
      );
    } catch {
      return null;
    }
  }, [qrOpen, activeReal, qrAmount, qrMemoText]);
  const qrMatrix = useQrMatrix(qrPayload ?? "");

  const handleSubmitLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const institution = findInstitution(bankCode);
    const normalized = normalizeAccountNumber(accountNumber);
    if (!institution || validatePayeeAccount(normalized, institution) !== "OK") {
      setLinkError(
        bankCode === "MOMO"
          ? "Vui lòng nhập số điện thoại Ví MoMo hợp lệ (10 chữ số bắt đầu bằng 0)."
          : "Vui lòng nhập số tài khoản hợp lệ (6–19 ký tự chữ số/chữ in hoa).",
      );
      return;
    }
    const cleanHolder = sanitizeAccountName(holderName);
    if (!cleanHolder) {
      setLinkError("Vui lòng nhập tên chủ tài khoản (VD: NGUYEN VAN A).");
      return;
    }
    const newId = createClientId("ACC");
    const addedId = addLinkedAccount(
      {
        id: newId,
        institutionCode: institution.code,
        accountNumber: normalized,
        last4: normalized.slice(-4),
        holderName: cleanHolder,
        demo: false,
        referenceBalance: null,
      },
      true,
    );
    if (!addedId) {
      setLinkError("Không thể thêm tài khoản (đã đạt giới hạn tối đa 12 tài khoản).");
      return;
    }
    onAccountLinked?.(`${institution.shortName} •••• ${normalized.slice(-4)}`);
    setLinkOpen(false);
    setAccountNumber("");
    setHolderName("");
    setLinkError(null);
  };

  const handleDownloadMyQr = () => {
    if (!activeReal || !activeInstitution || !qrMatrix) return;
    downloadQrPng(qrMatrix, `trustpay-my-vietqr-${activeInstitution.code.toLowerCase()}-${activeReal.last4}.png`);
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#090D16] via-[#2e1065] to-[#a50064] p-5 text-white shadow-lg shadow-[#a50064]/20 sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-pink-400/20 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-sky-400/15 blur-2xl"
        />

        <div className="relative z-10">
          {/* Thanh trạng thái trên cùng của thẻ */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-xs">
                <Landmark className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  {activeReal
                    ? `${activeInstitution?.shortName ?? activeReal.institutionCode} • Tài khoản thật`
                    : demoMode
                      ? "Chế độ dữ liệu mẫu (Demo)"
                      : "Tài khoản Ngân hàng Liên kết"}
                </p>
                <p className="text-[11px] text-pink-100/85">
                  {activeReal && activeInstitution
                    ? `Non-Custodial • BIN NAPAS ${activeInstitution.bin}`
                    : "Non-Custodial • Không giữ tiền hộ"}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              {t.wallet.shieldOn}
            </span>
          </div>

          {/* Nội dung chính: Đã liên kết ngân hàng thật vs Chưa liên kết */}
          {activeReal && activeInstitution ? (
            <div className="mt-4 space-y-3.5">
              {/* Chuyển đổi nhanh giữa các ngân hàng thật đã liên kết */}
              <div className="flex flex-wrap items-center gap-1.5">
                {realAccounts.map((acc) => {
                  const inst = findInstitution(acc.institutionCode);
                  const selected = acc.id === activeReal.id;
                  const label = `${inst?.shortName ?? acc.institutionCode} •••• ${acc.last4}`;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        if (!selected) {
                          setDefaultSource(acc.id);
                          setQrOpen(false);
                          onSourceChanged?.(label);
                        }
                      }}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all ${
                        selected
                          ? "bg-white text-[#a50064] shadow-xs"
                          : "bg-white/15 text-white/90 hover:bg-white/25"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      <span>{inst?.shortName ?? acc.institutionCode}</span>
                      <span className="font-mono opacity-80">••{acc.last4}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setLinkOpen((prev) => !prev);
                    setLinkError(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-white/40 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/20"
                >
                  <Plus className="h-3 w-3" />
                  <span>Thêm NH</span>
                </button>
              </div>

              {/* STK thật + Ẩn/hiện 👁️ + Đồng bộ số dư thật qua SePay / Casso */}
              <div className="rounded-2xl bg-black/25 p-3.5 backdrop-blur-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-wider text-pink-200/90 uppercase">
                      Số tài khoản thật
                    </p>
                    <p
                      className="tp-code mt-0.5 truncate text-xl font-extrabold tracking-wider text-white sm:text-2xl"
                      aria-live="polite"
                    >
                      {balanceHidden
                        ? `•••• •••• ${activeReal.last4}`
                        : formatAccountNumberSpaced(activeReal.accountNumber)}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-pink-100">
                      Chủ TK: <span className="text-white">{activeReal.holderName || "Chưa cập nhật"}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleBalance}
                    aria-pressed={balanceHidden}
                    aria-label={balanceHidden ? t.privacy.show : t.privacy.hide}
                    title={balanceHidden ? "Hiện STK & số dư" : "Ẩn STK & số dư"}
                    className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25"
                  >
                    {balanceHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                </div>

                {/* Số dư thật đồng bộ tự động (SePay / Casso) */}
                <div className="mt-3 space-y-2.5 border-t border-white/15 pt-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[10px] font-medium text-pink-200/85">
                        <span>Số dư thật (Webhook)</span>
                        {activeSyncMeta && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                            {activeSyncMeta.event?.provider === "casso" ? "Casso Live" : "SePay Live"}
                          </span>
                        )}
                      </p>
                      {activeReal.referenceBalance !== null ? (
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                          <p className="tp-num text-lg font-extrabold text-white">
                            {balanceHidden ? t.privacy.hidden : money(activeReal.referenceBalance)}
                          </p>
                          {activeSyncMeta?.event && !balanceHidden && (
                            <span
                              className={`tp-num rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                activeSyncMeta.event.deltaAmount >= 0
                                  ? "bg-emerald-400/20 text-emerald-200"
                                  : "bg-rose-400/20 text-rose-200"
                              }`}
                            >
                              {activeSyncMeta.event.deltaAmount >= 0 ? "+" : "−"}
                              {money(Math.abs(activeSyncMeta.event.deltaAmount))}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-0.5 text-xs font-semibold text-emerald-200">
                          Số dư quản lý trực tiếp trên App Ngân hàng
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={syncingNow}
                      onClick={() => void pollRealBalance(true)}
                      aria-label="Làm mới số dư từ Webhook"
                      title="Làm mới số dư ngay"
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncingNow ? "animate-spin" : ""}`} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSyncModalOpen(true)}
                    className="inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-300/40 bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-100 transition-colors hover:bg-emerald-500/30"
                  >
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    <span>🔄 Đồng bộ tự động (SePay / Casso)</span>
                  </button>
                </div>
              </div>

              {/* 2 nút hành động ngay trên thẻ */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onStartTransfer}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-xs font-extrabold text-[#a50064] shadow-sm transition-all hover:bg-pink-50 active:scale-[0.99]"
                >
                  <ArrowUpRight className="h-4 w-4 shrink-0" />
                  <span>Chuyển / Rút tiền thật</span>
                </button>
                <button
                  type="button"
                  aria-expanded={qrOpen}
                  onClick={() => setQrOpen((prev) => !prev)}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-3.5 py-2.5 text-xs font-bold text-white transition-all hover:bg-white/25 active:scale-[0.99]"
                >
                  <QrCode className="h-4 w-4 shrink-0" />
                  <span>Mã QR nhận tiền của tôi</span>
                </button>
              </div>

              {/* Khung Mã QR nhận tiền cá nhân (VietQR chuẩn EMVCo CRC-16) */}
              {qrOpen && qrPayload && (
                <div className="rounded-2xl bg-white p-4 text-slate-900 shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">
                        Mã VietQR nhận tiền — {activeInstitution.shortName}
                      </p>
                      <p className="tp-code text-[11px] text-slate-600">
                        {activeReal.accountNumber} · {activeReal.holderName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQrOpen(false)}
                      aria-label="Đóng mã QR nhận tiền"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-col items-center gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-2">
                      <QrCodeSvg value={qrPayload} size={184} title="Mã VietQR nhận tiền cá nhân" />
                    </div>
                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={qrAmountText}
                        inputMode="numeric"
                        onChange={(e) => setQrAmountText(e.target.value)}
                        placeholder="Số tiền cần nhận (tùy chọn)"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:outline-none"
                      />
                      <input
                        value={qrMemoText}
                        maxLength={25}
                        onChange={(e) => setQrMemoText(e.target.value)}
                        placeholder="Lời nhắn (tùy chọn)"
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!qrMatrix}
                      onClick={handleDownloadMyQr}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-3 py-2 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Tải ảnh mã VietQR (.PNG)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Trạng thái CHƯA liên kết ngân hàng thật */
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/20 bg-black/25 p-4 backdrop-blur-xs">
                <div className="flex items-start gap-2.5">
                  <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-pink-200" />
                  <div>
                    <p className="text-base font-extrabold text-white">Chưa liên kết tài khoản ngân hàng thật</p>
                    <p className="mt-1 text-xs leading-relaxed text-pink-100/90">
                      TrustPay AI không giữ tiền hộ — tiền nằm trực tiếp tại ngân hàng của bạn. Liên kết tài khoản (VietinBank,
                      Vietcombank, PVcomBank, MBBank…) để đồng bộ số dư tự động qua SePay/Casso và sinh VietQR thật.
                    </p>
                  </div>
                </div>

                {demoMode && demoWalletBalance > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-400/20 px-3 py-2 text-xs">
                    <span className="font-semibold text-amber-200">Số dư mẫu (Demo Mode):</span>
                    <span className="tp-num font-bold text-white">
                      {balanceHidden ? t.privacy.hidden : money(demoWalletBalance)}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setLinkOpen((prev) => !prev);
                    setLinkError(null);
                  }}
                  className="mt-3.5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-[#a50064] shadow-md transition-all hover:bg-pink-50 active:scale-[0.99]"
                >
                  <Plus className="h-5 w-5 shrink-0" />
                  <span>+ Liên kết tài khoản ngân hàng ngay</span>
                </button>
              </div>
            </div>
          )}

          {/* Biểu mẫu liên kết nhanh 1 chạm ngay trên thẻ */}
          {linkOpen && (
            <form onSubmit={handleSubmitLink} className="mt-3.5 space-y-3 rounded-2xl bg-white p-4 text-slate-900 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-slate-900">Liên kết tài khoản ngân hàng thật (Non-Custodial)</p>
                <button
                  type="button"
                  onClick={() => setLinkOpen(false)}
                  aria-label="Đóng biểu mẫu liên kết"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Chọn ngân hàng / ví</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_BANKS.map((bank) => {
                    const selected = bankCode === bank.code;
                    return (
                      <button
                        key={bank.code}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setBankCode(bank.code);
                          setLinkError(null);
                        }}
                        className={`cursor-pointer rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                          selected
                            ? "border-[#a50064] bg-pink-50 text-[#a50064]"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {bank.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    {bankCode === "MOMO" ? "Số điện thoại Ví MoMo *" : "Số tài khoản thật *"}
                  </span>
                  <input
                    value={accountNumber}
                    maxLength={19}
                    autoComplete="off"
                    onChange={(e) => {
                      setAccountNumber(e.target.value);
                      setLinkError(null);
                    }}
                    placeholder={bankCode === "MOMO" ? "0909123456" : "VD: 108870123456"}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Tên chủ tài khoản *</span>
                  <input
                    value={holderName}
                    maxLength={50}
                    autoComplete="name"
                    onChange={(e) => {
                      setHolderName(e.target.value);
                      setLinkError(null);
                    }}
                    placeholder="VD: NGUYEN VAN A"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 uppercase focus:border-[#d82d8b] focus:bg-white focus:outline-none"
                  />
                </label>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500">
                Sau khi liên kết, bấm <strong>🔄 Đồng bộ tự động (SePay / Casso)</strong> để cập nhật số dư thật theo thời
                gian thực mà không cần nhập tay.
              </p>

              {linkError && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {linkError}
                </p>
              )}

              <button
                type="submit"
                className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:brightness-110"
              >
                <Check className="h-4 w-4" />
                <span>Lưu & liên kết tài khoản thật</span>
              </button>
            </form>
          )}

          {/* Chỉ số sạch: Lũy kế chi hôm nay (TT 50 NHNN) & Tổng chi tiêu tháng */}
          <div className="mt-4 space-y-2.5 rounded-2xl bg-white/10 p-3.5 backdrop-blur-xs">
            <div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 font-semibold text-pink-50">
                  <Gauge className="h-3.5 w-3.5" />
                  Lũy kế chi hôm nay (TT 50 NHNN)
                </span>
                <span className="tp-num font-mono font-bold text-white">
                  {money(daily)} / {money(BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    dailyPct >= 100 ? "bg-amber-300" : "bg-emerald-300"
                  }`}
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-pink-100/85">
                {t.wallet.dailyHint(
                  money(BIOMETRIC_SINGLE_TXN_THRESHOLD_VND),
                  money(BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND),
                )}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-white/15 pt-2 text-[11px]">
              <span className="font-semibold text-pink-50">Tổng chi tiêu tháng</span>
              <span className="tp-num font-mono font-bold text-white">
                {money(monthlySpent)}
                {monthlyLimit > 0 ? ` / ${money(monthlyLimit)} (${monthlyPct}%)` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {syncModalOpen && activeReal && (
        <BankSyncModal
          account={activeReal}
          onClose={() => setSyncModalOpen(false)}
          onSynced={(newBalance, event) => {
            if (typeof newBalance === "number") {
              updateLinkedAccountBalance(activeReal.id, newBalance);
            }
            setSyncMetaByAccount((prev) => ({
              ...prev,
              [activeReal.accountNumber]: {
                event,
                updatedAt: new Date().toISOString(),
              },
            }));
          }}
        />
      )}
    </>
  );
}

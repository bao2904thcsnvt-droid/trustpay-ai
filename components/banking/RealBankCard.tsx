"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Landmark,
  Pencil,
  Plus,
  QrCode,
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
import { createClientId } from "@/lib/wallet/ledger";
import { parseMoneyInput } from "@/lib/wallet/format";
import {
  BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND,
  BIOMETRIC_SINGLE_TXN_THRESHOLD_VND,
} from "@/lib/compliance/biometric-policy";
import { useI18n } from "@/components/i18n/I18nProvider";
import QrCodeSvg, { downloadQrPng, useQrMatrix } from "@/components/payments/QrCodeSvg";

/** 9 ngân hàng & ví phổ biến hiển thị chọn nhanh 1 chạm khi liên kết. */
const QUICK_BANKS: readonly { code: PayeeInstitutionCode; label: string }[] = [
  { code: "PVCB", label: "PVcomBank" },
  { code: "VCB", label: "Vietcombank" },
  { code: "MB", label: "MBBank" },
  { code: "TCB", label: "Techcombank" },
  { code: "BIDV", label: "BIDV" },
  { code: "ACB", label: "ACB" },
  { code: "TPB", label: "TPBank" },
  { code: "VBA", label: "Agribank" },
  { code: "MOMO", label: "Ví MoMo" },
];

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
 * Thẻ Ngân hàng Liên kết Thật (Real Non-Custodial Banking Card):
 * - Thay thế hoàn toàn thẻ số dư ví ảo 14.800.000đ.
 * - Khi chưa liên kết: hiển thị trạng thái chưa liên kết + nút "+ Liên kết tài khoản ngân hàng ngay".
 * - Khi đã liên kết: hiển thị Tên ngân hàng thật, STK thật (ẩn/hiện 👁️), Tên chủ TK,
 *   số dư tham chiếu (hoặc quản lý trực tiếp trên App Ngân hàng), chuyển đổi nhanh giữa các ngân hàng,
 *   nút "Chuyển / Rút tiền thật" và "Mã QR nhận tiền của tôi", kèm Lũy kế TT 50 NHNN & Chi tiêu tháng.
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
  const { t, money } = useI18n();

  // Chỉ coi tài khoản có STK đầy đủ (không phải mẫu) là tài khoản ngân hàng thật đã liên kết.
  const realAccounts = useMemo(
    () => accounts.filter((item) => !item.demo && item.accountNumber !== ""),
    [accounts],
  );
  const activeReal = useMemo(
    () => realAccounts.find((item) => item.id === defaultSourceId) ?? realAccounts[0] ?? null,
    [realAccounts, defaultSourceId],
  );

  const [linkOpen, setLinkOpen] = useState(false);
  const [bankCode, setBankCode] = useState<PayeeInstitutionCode>("VCB");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [refBalanceInput, setRefBalanceInput] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [editingBalance, setEditingBalance] = useState(false);
  const [editBalanceText, setEditBalanceText] = useState("");

  const [qrOpen, setQrOpen] = useState(false);
  const [qrAmountText, setQrAmountText] = useState("");
  const [qrMemoText, setQrMemoText] = useState("");

  const daily = dailyOutflow ?? 0;
  const dailyPct = Math.min(100, Math.round((daily / BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND) * 100));
  const monthlyPct = monthlyLimit > 0 ? Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100)) : 0;

  const activeInstitution = activeReal ? findInstitution(activeReal.institutionCode) : undefined;
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
    const parsedRefBalance = refBalanceInput.trim() ? parseMoneyInput(refBalanceInput) : null;
    const refBal = parsedRefBalance !== null && parsedRefBalance >= 0 && refBalanceInput.trim() !== "" ? parsedRefBalance : null;
    const newId = createClientId("ACC");
    const addedId = addLinkedAccount(
      {
        id: newId,
        institutionCode: institution.code,
        accountNumber: normalized,
        last4: normalized.slice(-4),
        holderName: cleanHolder,
        demo: false,
        referenceBalance: refBal,
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
    setRefBalanceInput("");
    setLinkError(null);
  };

  const handleSaveRefBalance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeReal) return;
    if (!editBalanceText.trim()) {
      updateLinkedAccountBalance(activeReal.id, null);
    } else {
      const parsed = parseMoneyInput(editBalanceText);
      updateLinkedAccountBalance(activeReal.id, Math.max(0, parsed));
    }
    setEditingBalance(false);
  };

  const handleDownloadMyQr = () => {
    if (!activeReal || !activeInstitution || !qrMatrix) return;
    downloadQrPng(qrMatrix, `trustpay-my-vietqr-${activeInstitution.code.toLowerCase()}-${activeReal.last4}.png`);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#4a044e] to-[#a50064] p-5 text-white shadow-lg shadow-[#a50064]/20 sm:p-6">
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
                        setEditingBalance(false);
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

            {/* STK thật + Ẩn/hiện 👁️ + Tên chủ tài khoản */}
            <div className="rounded-2xl bg-black/20 p-3.5 backdrop-blur-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wider text-pink-200/90 uppercase">
                    Số tài khoản thật
                  </p>
                  <p className="tp-code mt-0.5 truncate text-xl font-extrabold tracking-wider text-white sm:text-2xl" aria-live="polite">
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

              {/* Số dư tham chiếu thực tế hoặc Quản lý trực tiếp trên App Ngân hàng */}
              <div className="mt-3 border-t border-white/15 pt-2.5">
                {editingBalance ? (
                  <form onSubmit={handleSaveRefBalance} className="space-y-2">
                    <label className="block text-[11px] font-semibold text-pink-100">
                      Số dư tham chiếu (VNĐ — để trống nếu quản lý trên App Ngân hàng)
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={editBalanceText}
                        inputMode="numeric"
                        onChange={(e) => setEditBalanceText(e.target.value)}
                        placeholder="VD: 12000000"
                        className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 font-mono text-sm text-white placeholder:text-white/50 focus:border-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="cursor-pointer rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#a50064] hover:bg-pink-50"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingBalance(false)}
                        className="cursor-pointer rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-pink-200/85">Số dư tài khoản</p>
                      {activeReal.referenceBalance !== null ? (
                        <p className="tp-num text-base font-bold text-white">
                          {balanceHidden ? t.privacy.hidden : money(activeReal.referenceBalance)}
                          <span className="ml-1.5 text-[10px] font-normal text-pink-200/85">(tham chiếu)</span>
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-emerald-200">
                          Số dư quản lý trực tiếp trên App Ngân hàng
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditBalanceText(activeReal.referenceBalance !== null ? String(activeReal.referenceBalance) : "");
                        setEditingBalance(true);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-white/25"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>{activeReal.referenceBalance !== null ? "Cập nhật" : "Nhập số dư"}</span>
                    </button>
                  </div>
                )}
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
            <div className="rounded-2xl border border-white/20 bg-black/20 p-4 backdrop-blur-xs">
              <div className="flex items-start gap-2.5">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-pink-200" />
                <div>
                  <p className="text-base font-extrabold text-white">Chưa liên kết tài khoản ngân hàng thật</p>
                  <p className="mt-1 text-xs leading-relaxed text-pink-100/90">
                    TrustPay AI không giữ tiền hộ — tiền nằm trực tiếp tại ngân hàng của bạn. Liên kết tài khoản để chuyển/rút
                    tiền thật qua VietQR chuẩn EMVCo và nhận tiền 1 chạm.
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
                  placeholder={bankCode === "MOMO" ? "0909123456" : "VD: 0071001234567"}
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

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Số dư tham chiếu (tùy chọn — để trống sẽ quản lý trực tiếp trên App Ngân hàng)
              </span>
              <input
                value={refBalanceInput}
                inputMode="numeric"
                onChange={(e) => setRefBalanceInput(e.target.value)}
                placeholder="Để trống nếu không cần nhập"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#d82d8b] focus:bg-white focus:outline-none"
              />
            </label>

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
  );
}

"use client";

import { useMemo, useState } from "react";
import { Download, Lock, Minus, Plus, Share2 } from "lucide-react";
import { findInstitution } from "@/lib/payments/banks";
import {
  buildVietQrImageUrl,
  buildVietQrPayload,
  normalizeAccountNumber,
  validatePayeeAccount,
} from "@/lib/payments/vietqr-builder";
import { buildSplitMemo, splitBill, SPLIT_MAX_PEOPLE, SPLIT_MIN_PEOPLE } from "@/lib/hub/bill-split";
import { completeLinkedAccount, type LinkedAccount } from "@/lib/hub/hub-store";
import { parseMoneyInput } from "@/lib/wallet/format";
import { useI18n } from "@/components/i18n/I18nProvider";
import QrCodeSvg, { downloadQrPng, useQrMatrix } from "@/components/payments/QrCodeSvg";
import { linkedAccountLabel } from "@/components/hub/LinkedAccountsBar";

export interface SplitBillProps {
  accounts: LinkedAccount[];
  defaultSourceId: string;
  /** Khóa sinh trắc học đang bật và chưa mở khóa gần đây → ẩn mã QR. */
  requireUnlock: boolean;
  onRequestUnlock: () => void;
  onCopied: (ok: boolean) => void;
  onPngSaved: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Rơi xuống cách dự phòng.
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

/** "🍕 Chia tiền nhóm (Split Bill)": chia đều hóa đơn + mã VietQR thu tiền thật vào tài khoản của bạn. */
export default function SplitBill({
  accounts,
  defaultSourceId,
  requireUnlock,
  onRequestUnlock,
  onCopied,
  onPngSaved,
}: SplitBillProps) {
  const { t, money } = useI18n();
  const [totalText, setTotalText] = useState("1.200.000");
  const [people, setPeople] = useState(4);
  const [accountId, setAccountId] = useState(defaultSourceId);
  const [note, setNote] = useState("");
  const [fullNumber, setFullNumber] = useState("");
  const [fullError, setFullError] = useState(false);

  const account = accounts.find((item) => item.id === accountId) ?? accounts.find((item) => item.id === defaultSourceId) ?? accounts[0];
  const institution = account ? findInstitution(account.institutionCode) : undefined;
  const split = splitBill(parseMoneyInput(totalText), people);
  const memo = buildSplitMemo(note);
  const ready = Boolean(split && account && institution && account.accountNumber);

  // Đã mở khóa và hiện mã một lần → giữ mã khi đổi số tiền / số người (không ẩn giữa chừng).
  const [revealed, setRevealed] = useState(false);
  if (!revealed && !requireUnlock && ready) {
    setRevealed(true);
  }
  const lockActive = requireUnlock && !revealed;

  const payload = useMemo(() => {
    if (!split || !account || !institution || !account.accountNumber) return null;
    try {
      return buildVietQrPayload({ bankBin: institution.bin, accountNumber: account.accountNumber, amount: split.perPerson, memo });
    } catch {
      return null;
    }
  }, [split, account, institution, memo]);
  const matrix = useQrMatrix(payload ?? "");

  const imageUrl =
    split && account && institution && account.accountNumber && institution.remoteImage
      ? buildVietQrImageUrl({ institution, accountNumber: account.accountNumber, amount: split.perPerson, memo, accountName: account.holderName })
      : null;

  const shareText =
    split && account && institution
      ? t.split.shareText(
          money(split.perPerson),
          `${institution.shortName} (${institution.bin})`,
          account.accountNumber,
          account.holderName,
          memo,
          imageUrl ?? "—",
        )
      : "";

  const handleShare = async () => {
    if (!shareText) return;
    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: t.split.title, text: shareText, ...(imageUrl ? { url: imageUrl } : {}) });
        return;
      } catch {
        // Người dùng hủy chia sẻ → sao chép thay thế.
      }
    }
    onCopied(await copyText(shareText));
  };

  const saveFullNumber = () => {
    if (!account || !institution) return;
    const normalized = normalizeAccountNumber(fullNumber);
    if (validatePayeeAccount(normalized, institution) !== "OK") {
      setFullError(true);
      return;
    }
    setFullError(false);
    completeLinkedAccount(account.id, normalized, account.holderName);
    setFullNumber("");
  };

  return (
    <section id="tp-split-bill" aria-labelledby="tp-split-title" className="rounded-3xl border border-orange-200 bg-white p-4 shadow-xs">
      <h2 id="tp-split-title" className="text-sm font-bold text-slate-900">
        {t.split.title}
      </h2>
      <p className="mt-0.5 text-[11px] text-slate-500">{t.split.subtitle}</p>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.split.total}</span>
          <input
            value={totalText}
            inputMode="numeric"
            maxLength={20}
            autoComplete="off"
            onChange={(event) => setTotalText(event.target.value)}
            placeholder={t.split.totalPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-base text-slate-900 focus:border-orange-400 focus:bg-white focus:outline-none"
          />
        </label>

        <div>
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.split.people}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="−"
              disabled={people <= SPLIT_MIN_PEOPLE}
              onClick={() => setPeople((value) => Math.max(SPLIT_MIN_PEOPLE, value - 1))}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span aria-live="polite" className="min-w-12 text-center font-mono text-xl font-extrabold text-slate-900">
              {people}
            </span>
            <button
              type="button"
              aria-label="+"
              disabled={people >= SPLIT_MAX_PEOPLE}
              onClick={() => setPeople((value) => Math.min(SPLIT_MAX_PEOPLE, value + 1))}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.split.receiveTo}</span>
          <select
            value={account?.id ?? ""}
            onChange={(event) => setAccountId(event.target.value)}
            className="w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none"
          >
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {linkedAccountLabel(item, t.hub.masked)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">{t.split.note}</span>
          <input
            value={note}
            maxLength={20}
            autoComplete="off"
            onChange={(event) => setNote(event.target.value)}
            placeholder={t.split.notePlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:bg-white focus:outline-none"
          />
        </label>
      </div>

      {!split ? (
        <p className="mt-3 text-[11px] font-semibold text-amber-700">{t.split.invalid}</p>
      ) : (
        <div className="mt-3 rounded-2xl bg-orange-50 px-3 py-2 text-orange-950">
          <p className="font-mono text-2xl font-extrabold">{t.split.perPerson(money(split.perPerson))}</p>
          <p className="text-xs">{t.split.summary(split.othersCount, money(split.perPerson), money(split.expectedFromOthers))}</p>
          {split.surplus > 0 && <p className="text-[11px] text-orange-800">{t.split.surplus(money(split.surplus))}</p>}
        </div>
      )}

      {account && !account.accountNumber && (
        <div className="mt-3 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-semibold text-amber-900">{t.hub.needFull}</p>
          <div className="flex gap-2">
            <input
              value={fullNumber}
              inputMode="numeric"
              maxLength={24}
              autoComplete="off"
              aria-label={t.hub.account}
              placeholder={`•••• ${account.last4}`}
              onChange={(event) => setFullNumber(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={saveFullNumber}
              className="shrink-0 cursor-pointer rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600"
            >
              {t.hub.completeSave}
            </button>
          </div>
          {fullError && <p className="text-[11px] font-semibold text-rose-700">{t.hub.invalid}</p>}
        </div>
      )}

      {ready && payload && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {lockActive ? (
            <button
              type="button"
              onClick={onRequestUnlock}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              <Lock className="h-4 w-4" />
              {t.lock.qrLocked}
            </button>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 p-2" style={{ backgroundColor: "#ffffff" }}>
                <QrCodeSvg value={payload} size={200} title={t.split.title} />
              </div>
              <p className="text-[10px] text-slate-500">{t.split.localQrNote}</p>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-3 text-xs font-bold text-white hover:brightness-110"
                >
                  <Share2 className="h-4 w-4" />
                  {t.split.share}
                </button>
                <button
                  type="button"
                  disabled={!matrix}
                  onClick={() => {
                    if (matrix && downloadQrPng(matrix, `chia-tien-${people}-nguoi.png`)) onPngSaved();
                  }}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {t.split.savePng}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

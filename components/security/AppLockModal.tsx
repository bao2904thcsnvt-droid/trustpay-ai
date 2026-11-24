"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Fingerprint, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useHubState, verifyAppPin } from "@/lib/hub/hub-store";
import {
  appLockSession,
  isPlatformAuthenticatorAvailable,
  MAX_PIN_ATTEMPTS,
  PIN_LOCKOUT_MS,
  verifyDevicePasskey,
} from "@/lib/security/app-lock";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface AppLockModalProps {
  /** "app" = khóa khi mở ứng dụng (không bỏ qua được); "qr" = xác thực trước khi tạo mã VietQR. */
  purpose: "app" | "qr";
  onUnlocked: () => void;
  onCancel?: () => void;
}

/** Hộp mở khóa: Vân tay / FaceID thiết bị (WebAuthn passkey) hoặc PIN 6 số dự phòng. */
export default function AppLockModal({ purpose, onUnlocked, onCancel }: AppLockModalProps) {
  const { t } = useI18n();
  const hub = useHubState();
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [platformReady, setPlatformReady] = useState(false);
  const autoTriedRef = useRef(false);
  const pinRef = useRef<HTMLInputElement | null>(null);

  const passkeyId = hub.appLock.passkeyId;

  useEffect(() => {
    let active = true;
    void isPlatformAuthenticatorAvailable().then((available) => {
      if (active) setPlatformReady(available);
    });
    const focusTimer = window.setTimeout(() => pinRef.current?.focus(), 50);
    return () => {
      active = false;
      window.clearTimeout(focusTimer);
    };
  }, []);

  useEffect(() => {
    if (lockedUntil === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setAttempts(0);
      }
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [lockedUntil]);

  const unlock = () => {
    appLockSession.markUnlocked(Date.now());
    onUnlocked();
  };

  const tryBiometric = async () => {
    if (!passkeyId || verifying) return;
    setVerifying(true);
    setError(null);
    const result = await verifyDevicePasskey(passkeyId);
    setVerifying(false);
    if (result.ok) {
      unlock();
    } else if (result.reason !== "CANCELLED") {
      setError(t.lock.biometricFailed);
    }
  };

  // Tự bật hộp thoại sinh trắc học một lần khi mở (nếu đã đăng ký passkey).
  useEffect(() => {
    if (!platformReady || !passkeyId || autoTriedRef.current) return;
    autoTriedRef.current = true;
    const timer = window.setTimeout(() => void tryBiometric(), 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformReady, passkeyId]);

  const handlePin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (lockedUntil !== null) return;
    if (verifyAppPin(hub, pin)) {
      setPin("");
      unlock();
      return;
    }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setPin("");
    if (nextAttempts >= MAX_PIN_ATTEMPTS) {
      setLockedUntil(Date.now() + PIN_LOCKOUT_MS);
      setError(null);
    } else {
      setError(t.lock.wrongPin(MAX_PIN_ATTEMPTS - nextAttempts));
    }
  };

  const secondsLeft = lockedUntil !== null ? Math.max(1, Math.ceil((lockedUntil - (now || Date.now())) / 1000)) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-lock-title"
      className={`fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 ${
        purpose === "app" ? "bg-slate-950/95 backdrop-blur-md" : "bg-slate-950/70 backdrop-blur-sm"
      }`}
    >
      <div className="tp-sheet-in w-full max-w-sm rounded-t-3xl border border-pink-200 bg-white p-6 text-center shadow-2xl sm:rounded-3xl">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-md">
          <ShieldCheck className="h-8 w-8" />
        </span>
        <h2 id="tp-lock-title" className="mt-3 text-lg font-extrabold text-slate-900">
          {purpose === "app" ? t.lock.unlockTitle : t.lock.unlockForQr}
        </h2>

        {passkeyId && platformReady && (
          <button
            type="button"
            disabled={verifying}
            onClick={() => void tryBiometric()}
            className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
          >
            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
            {t.lock.useBiometric}
          </button>
        )}

        <form onSubmit={handlePin} className="mt-4 space-y-2 text-left">
          <label htmlFor="tp-lock-pin" className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <KeyRound className="h-4 w-4 text-[#a50064]" />
            {t.lock.usePin}
          </label>
          <input
            ref={pinRef}
            id="tp-lock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={pin}
            disabled={lockedUntil !== null}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t.lock.pinPlaceholder}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-900 focus:border-[#d82d8b] focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pin.length !== 6 || lockedUntil !== null}
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.lock.unlock}
          </button>
        </form>

        {lockedUntil !== null ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
            {t.lock.lockedOut(secondsLeft)}
          </p>
        ) : (
          error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )
        )}
        <p className="mt-3 text-[11px] text-slate-500">{t.lock.pinDefault}</p>
        <p className="mt-1 text-[10px] text-slate-400">{t.lock.demoNote}</p>

        {purpose === "qr" && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 cursor-pointer text-xs font-semibold text-slate-500 underline-offset-2 hover:underline"
          >
            {t.lock.cancel}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { isValidPin, setAppLockEnabled, setAppPin, setPasskeyId, useHubState } from "@/lib/hub/hub-store";
import {
  appLockSession,
  createPinSalt,
  isPlatformAuthenticatorAvailable,
  registerDevicePasskey,
} from "@/lib/security/app-lock";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface AppLockSettingsProps {
  onToast: (toast: { type: "success" | "info" | "warning"; title: string; description: string }) => void;
}

/** Thẻ "Khóa ứng dụng & Xác thực bằng Vân tay / FaceID thiết bị" (WebAuthn + PIN 6 số dự phòng). */
export default function AppLockSettings({ onToast }: AppLockSettingsProps) {
  const { t } = useI18n();
  const hub = useHubState();
  const [platformReady, setPlatformReady] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerFailed, setRegisterFailed] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const enabled = hub.appLock.enabled;

  useEffect(() => {
    let active = true;
    void isPlatformAuthenticatorAvailable().then((available) => {
      if (active) setPlatformReady(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = () => {
    const next = !enabled;
    setAppLockEnabled(next);
    if (next) {
      // KHÔNG tự coi là đã mở khóa: người bật khóa phải xác thực ngay (PIN / Vân tay / FaceID)
      // trước khi bất kỳ mã VietQR chuyển / thu tiền nào được hiện ra.
      onToast({ type: "success", title: t.toastR4.lockEnabled, description: t.toastR4.lockEnabledDesc });
    } else {
      onToast({ type: "info", title: t.toastR4.lockDisabled, description: t.lock.off });
    }
  };

  const register = async () => {
    setRegistering(true);
    setRegisterFailed(false);
    const result = await registerDevicePasskey(t.common.ownerName);
    setRegistering(false);
    if (result.ok) {
      setPasskeyId(result.credentialId);
      if (!enabled) setAppLockEnabled(true);
      appLockSession.markUnlocked(Date.now());
      onToast({ type: "success", title: t.toastR4.passkeyRegistered, description: t.toastR4.passkeyRegisteredDesc });
    } else {
      setRegisterFailed(true);
    }
  };

  const savePin = () => {
    if (!isValidPin(newPin) || !setAppPin(newPin, createPinSalt())) {
      setPinError(true);
      return;
    }
    setPinError(false);
    setNewPin("");
    setPinOpen(false);
    onToast({ type: "success", title: t.lock.pinSaved, description: t.lock.title });
  };

  return (
    <section id="tp-app-lock" aria-labelledby="tp-app-lock-title" className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Lock className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="tp-app-lock-title" className="text-sm font-bold text-slate-900">
            {t.lock.title}
          </h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t.lock.subtitle}</p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className="mt-3 inline-flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold text-slate-800"
      >
        <span>{t.lock.toggle}</span>
        <span className="inline-flex items-center gap-2">
          <span className={enabled ? "text-emerald-700" : "text-slate-500"}>{enabled ? t.lock.on : t.lock.off}</span>
          <span
            aria-hidden="true"
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              enabled ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-1 ring-slate-200 transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </span>
        </span>
      </button>

      <div className="mt-2 space-y-2">
        {hub.appLock.passkeyId ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {t.lock.passkeyReady}
          </p>
        ) : platformReady === false ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{t.lock.passkeyUnsupported}</p>
        ) : (
          <button
            type="button"
            disabled={registering || platformReady !== true}
            onClick={() => void register()}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Fingerprint className="h-4 w-4" />
            {t.lock.registerPasskey}
          </button>
        )}
        {registerFailed && <p className="text-[11px] font-semibold text-rose-700">{t.lock.passkeyFailed}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>{t.lock.pinDefault}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPinOpen((value) => !value)}
              className="cursor-pointer rounded-lg px-2 py-1 font-semibold text-[#a50064] hover:bg-pink-50"
            >
              {t.lock.changePin}
            </button>
            {enabled && (
              <button
                type="button"
                onClick={() => appLockSession.lock()}
                className="cursor-pointer rounded-lg px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t.lock.lockNow}
              </button>
            )}
          </div>
        </div>

        {pinOpen && (
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              aria-label={t.lock.newPin}
              placeholder={t.lock.newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-center font-mono text-sm tracking-[0.4em] text-slate-900 focus:border-[#d82d8b] focus:outline-none"
            />
            <button
              type="button"
              onClick={savePin}
              className="shrink-0 cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              {t.hub.save}
            </button>
          </div>
        )}
        {pinError && <p className="text-[11px] font-semibold text-rose-700">{t.lock.pinInvalid}</p>}
      </div>
    </section>
  );
}

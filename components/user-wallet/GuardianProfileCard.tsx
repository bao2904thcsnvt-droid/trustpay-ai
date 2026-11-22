"use client";

import { useState, type FormEvent } from "react";
import { HeartHandshake, Pencil, Save, X, ShieldCheck, RotateCcw } from "lucide-react";
import type { TrustedGuardian } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";
import { isPlausiblePhone, maskPhoneForDisplay } from "@/lib/security/pii-display";
import { DEFAULT_GUARDIAN } from "@/lib/wallet/defaults";

export interface GuardianProfileCardProps {
  guardian: TrustedGuardian;
  onSave: (guardian: TrustedGuardian) => void;
  highlighted?: boolean;
}

/** Hồ sơ "Người giám hộ tin cậy" trong Ví, cho phép đổi tên / SĐT bất kỳ. */
export default function GuardianProfileCard({ guardian, onSave, highlighted = false }: GuardianProfileCardProps) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setName(guardian.name);
    setPhone(guardian.phone);
    setError(null);
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.replace(/\s+/g, " ").trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      setError(t.guardianProfile.invalidName);
      return;
    }
    if (!isPlausiblePhone(phone)) {
      setError(t.guardianProfile.invalidPhone);
      return;
    }
    onSave({ name: trimmedName, phone: phone.trim() });
    setIsEditing(false);
  };

  return (
    <div
      id="tp-guardian-card"
      className={`rounded-3xl border border-sky-200/80 bg-white p-5 shadow-xs transition-shadow ${
        highlighted ? "tp-highlight" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <HeartHandshake className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">{t.guardianProfile.title}</h2>
            <p className="text-xs text-slate-500">{t.guardianProfile.subtitle}</p>
          </div>
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
          >
            <Pencil className="h-3 w-3" />
            {t.guardianProfile.edit}
          </button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="tp-guardian-name" className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t.guardianProfile.nameLabel}
            </label>
            <input
              id="tp-guardian-name"
              value={name}
              maxLength={60}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder={t.guardianProfile.namePlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="tp-guardian-phone" className="mb-1 block text-[11px] font-semibold text-slate-600">
              {t.guardianProfile.phoneLabel}
            </label>
            <input
              id="tp-guardian-phone"
              value={phone}
              inputMode="tel"
              maxLength={16}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(null);
              }}
              placeholder={t.guardianProfile.phonePlaceholder}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 font-mono text-sm text-slate-900 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 focus:outline-none"
            />
          </div>

          {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-700 to-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110"
            >
              <Save className="h-3.5 w-3.5" />
              {t.guardianProfile.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setName(DEFAULT_GUARDIAN.name);
                setPhone(DEFAULT_GUARDIAN.phone);
                setError(null);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.guardianProfile.restoreDefault}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              {t.guardianProfile.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-3.5 py-3">
          <p className="text-xs font-semibold text-sky-900">
            {t.guardianProfile.label(guardian.name, maskPhoneForDisplay(guardian.phone))}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-sky-700/80">
            <ShieldCheck className="h-3 w-3" />
            {t.guardianProfile.privacyNote}
          </p>
        </div>
      )}
    </div>
  );
}

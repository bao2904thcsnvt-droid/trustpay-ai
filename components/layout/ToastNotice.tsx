"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface ToastNotification {
  type: "success" | "warning" | "info";
  title: string;
  description: string;
}

/** Thông báo thời gian thực (góc trên bên phải, dưới header). */
export default function ToastNotice({
  toast,
  onDismiss,
}: {
  toast: ToastNotification | null;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed top-20 right-4 z-[70] w-[calc(100%-2rem)] max-w-sm" aria-live="polite">
      <div
        role="status"
        className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-md ${
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
          onClick={onDismiss}
          aria-label={t.common.dismiss}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg opacity-60 hover:bg-black/5 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

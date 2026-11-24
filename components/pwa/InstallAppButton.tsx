"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useI18n } from "@/components/i18n/I18nProvider";

interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Sự kiện `beforeinstallprompt` có thể đến trước khi React gắn → giữ ở cấp module.
let deferredPrompt: BeforeInstallPromptEventLike | null = null;
let installedFlag = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEventLike;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedFlag = true;
    emit();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getPromptSnapshot = () => deferredPrompt;
const getServerPromptSnapshot = () => null;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return installedFlag || window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

/** Nút "📲 Cài App lên Điện thoại" (PWA): prompt gốc trên Chrome/Edge/Android, hướng dẫn trên iOS. */
export default function InstallAppButton({ onInstalled }: { onInstalled?: () => void }) {
  const { t } = useI18n();
  const mounted = useHasMounted();
  const prompt = useSyncExternalStore(subscribe, getPromptSnapshot, getServerPromptSnapshot);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!guideOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuideOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guideOpen]);

  if (!mounted || isStandalone()) {
    return null;
  }

  const handleClick = async () => {
    if (prompt) {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") {
          deferredPrompt = null;
          installedFlag = true;
          emit();
          onInstalled?.();
        }
      } catch {
        setGuideOpen(true);
      }
      return;
    }
    setGuideOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title={t.pwa.install}
        className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold whitespace-nowrap text-emerald-800 transition-colors hover:bg-emerald-100"
      >
        <span className="hidden xl:inline">{t.pwa.install}</span>
        <span className="xl:hidden">{t.pwa.installShort}</span>
      </button>

      {/* Cổng ra <body>: thanh ứng dụng có backdrop-filter (tạo khối chứa cho phần tử `fixed`). */}
      {guideOpen &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tp-install-title"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="tp-sheet-in w-full max-w-md rounded-t-3xl border border-emerald-200 bg-white p-5 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="tp-install-title" className="text-base font-extrabold text-slate-900">
                {t.pwa.iosTitle}
              </h2>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label={t.pwa.close}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="mt-3 space-y-2">
              {t.pwa.iosSteps.map((step, index) => (
                <li key={step} className="flex gap-2.5 text-sm text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-mono text-xs font-bold text-emerald-700">
                    {index + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}

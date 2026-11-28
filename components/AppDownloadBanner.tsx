"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, LoaderCircle, Smartphone, X } from "lucide-react";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { ToastNotification } from "@/components/layout/ToastNotice";
import {
  detectInstallPlatform,
  isStandaloneApp,
  runInstallPrompt,
  useInstallPrompt,
  type InstallPlatform,
} from "@/lib/pwa/install-prompt";

/** Tệp APK (đóng gói bằng PWABuilder) — đặt vào `public/downloads/trustpay-ai.apk` để bật tải trực tiếp. */
export const APK_PATH = "/downloads/trustpay-ai.apk";

/** Có tệp APK thật trên máy chủ không (HEAD, không cache; trang 404 HTML không tính). */
async function apkAvailable(): Promise<boolean> {
  try {
    const response = await fetch(APK_PATH, { method: "HEAD", cache: "no-store" });
    const type = response.headers.get("content-type") ?? "";
    return response.ok && !type.includes("text/html");
  } catch {
    return false;
  }
}

function triggerDownload(): void {
  const link = document.createElement("a");
  link.href = APK_PATH;
  link.download = "trustpay-ai.apk";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

type GuideKind = InstallPlatform;

export interface AppDownloadBannerProps {
  onToast?: (toast: ToastNotification) => void;
  highlighted?: boolean;
}

/**
 * Thanh "Tải TrustPay AI về điện thoại" — nền Obsidian dịu mắt, 2 nút:
 *  1) Tải tệp Android (.APK): có tệp → tải thẳng; chưa gắn tệp → modal hướng dẫn cài qua Chrome.
 *  2) Cài App trực tiếp: prompt `beforeinstallprompt` (Android/Chrome/Edge) hoặc hướng dẫn
 *     "Chia sẻ → Thêm vào màn hình chính" (iPhone Safari).
 * Ẩn khi đang chạy như ứng dụng đã cài.
 */
export default function AppDownloadBanner({ onToast, highlighted = false }: AppDownloadBannerProps) {
  const { t } = useI18n();
  const mounted = useHasMounted();
  const prompt = useInstallPrompt();
  const [checking, setChecking] = useState(false);
  const [guide, setGuide] = useState<GuideKind | null>(null);

  useEffect(() => {
    if (!guide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuide(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guide]);

  if (!mounted || isStandaloneApp()) {
    return null;
  }

  const platform = detectInstallPlatform();

  const handleApk = async () => {
    if (checking) return;
    setChecking(true);
    const available = await apkAvailable();
    setChecking(false);
    if (available) {
      triggerDownload();
      onToast?.({ type: "info", title: t.appDl.apkStarted, description: t.appDl.apkStartedDesc });
      return;
    }
    setGuide(platform === "ios" ? "ios" : "android");
  };

  const handleInstall = async () => {
    if (prompt) {
      const outcome = await runInstallPrompt();
      if (outcome !== "unavailable") return;
    }
    setGuide(platform);
  };

  const guideTitle = guide === "ios" ? t.appDl.iosTitle : guide === "android" ? t.appDl.androidTitle : t.appDl.desktopTitle;
  const guideSteps = guide === "ios" ? t.appDl.iosSteps : guide === "android" ? t.appDl.androidSteps : t.appDl.desktopSteps;

  return (
    <section
      id="tp-app-download"
      aria-labelledby="tp-app-download-title"
      className={`rounded-3xl border border-white/10 bg-[#090D16] p-4 text-[#E6EAF2] shadow-xs ${highlighted ? "tp-highlight" : ""}`}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- icon PWA tĩnh 192px */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <h2 id="tp-app-download-title" className="text-sm font-bold text-white">
            {t.appDl.title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[#9AA4B8]">{t.appDl.subtitle}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void handleApk()}
          aria-busy={checking}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-3 py-2.5 text-xs font-bold text-white transition-all hover:brightness-110"
        >
          {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {checking ? t.appDl.checking : t.appDl.apk}
        </button>
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold text-[#E6EAF2] transition-colors hover:bg-white/10"
        >
          <Smartphone className="h-4 w-4" />
          {t.appDl.install}
        </button>
      </div>

      {guide &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tp-app-dl-guide-title"
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            onClick={() => setGuide(null)}
          >
            <div
              className="tp-sheet-in w-full max-w-md rounded-t-3xl border border-white/10 bg-[#090D16] p-5 text-[#E6EAF2] shadow-2xl sm:rounded-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 id="tp-app-dl-guide-title" className="text-base font-extrabold text-white">
                  {guideTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => setGuide(null)}
                  aria-label={t.appDl.close}
                  className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/15 text-[#C3CADB] hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {guide === "android" && <p className="mt-2 text-xs leading-relaxed text-[#9AA4B8]">{t.appDl.androidNote}</p>}
              <ol className="mt-3 space-y-2.5">
                {guideSteps.map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-sm leading-relaxed">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d82d8b]/20 font-mono text-xs font-bold text-[#f472b6]">
                      {index + 1}
                    </span>
                    <span className="min-w-0">{step}</span>
                  </li>
                ))}
              </ol>
              {guide !== "ios" && prompt && (
                <button
                  type="button"
                  onClick={() => {
                    setGuide(null);
                    void runInstallPrompt();
                  }}
                  className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-3 text-sm font-bold text-white"
                >
                  <Smartphone className="h-4 w-4" />
                  {t.appDl.promptNow}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

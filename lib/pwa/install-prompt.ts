/**
 * Store dùng chung cho sự kiện cài PWA `beforeinstallprompt` (Chrome / Edge / Android).
 * Sự kiện có thể đến trước khi React gắn → bắt ở cấp module, MỘT lần cho cả ứng dụng
 * (InstallAppButton trên thanh điều hướng + AppDownloadBanner dùng chung).
 */
import { useSyncExternalStore } from "react";

export interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

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
  return () => {
    listeners.delete(listener);
  };
};

/** Prompt cài đặt gốc của trình duyệt (null nếu trình duyệt chưa cho phép / iOS Safari). */
export function useInstallPrompt(): BeforeInstallPromptEventLike | null {
  return useSyncExternalStore(
    subscribe,
    () => deferredPrompt,
    () => null,
  );
}

/** Đang chạy như ứng dụng đã cài (standalone / iOS Home Screen) hay vừa cài xong. */
export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return installedFlag || window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

export type InstallPlatform = "ios" | "android" | "desktop";

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  // iPadOS 13+ báo là "Macintosh" nhưng có màn hình cảm ứng.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Gọi prompt cài đặt gốc; trả về kết quả (unavailable nếu không có prompt hoặc lỗi). */
export async function runInstallPrompt(): Promise<InstallOutcome> {
  const prompt = deferredPrompt;
  if (!prompt) return "unavailable";
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    // Mỗi sự kiện chỉ prompt được một lần.
    deferredPrompt = null;
    if (choice.outcome === "accepted") installedFlag = true;
    emit();
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

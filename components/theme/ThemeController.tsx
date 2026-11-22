"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { preferencesStore, usePreferences } from "@/lib/preferences/preferences-store";
import { applyThemeToDocument, DARK_MEDIA_QUERY, resolveTheme, type ThemeMode } from "@/lib/theme/theme";

const subscribeSystemTheme = (onChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getSystemDarkSnapshot = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_MEDIA_QUERY).matches
    : false;

const getServerSystemDarkSnapshot = () => false;

function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystemTheme, getSystemDarkSnapshot, getServerSystemDarkSnapshot);
}

/** Theme hiệu lực (lựa chọn đã lưu, hoặc theme hệ thống khi chưa chọn). */
export function useResolvedTheme(): ThemeMode {
  const prefs = usePreferences();
  const systemDark = useSystemPrefersDark();
  return resolveTheme(prefs.theme, systemDark);
}

/**
 * Đồng bộ lớp `.dark` trên <html> với theme hiệu lực. Script trong <head> đã đặt
 * lớp trước lần vẽ đầu; `useLayoutEffect` áp lại sau mỗi thay đổi (và sau lần
 * remount của Strict Mode ở môi trường dev) trước khi trình duyệt vẽ.
 */
export default function ThemeController() {
  const prefs = usePreferences();
  const systemDark = useSystemPrefersDark();

  useLayoutEffect(() => {
    // Đọc trực tiếp nguồn thật: lúc hydrate, snapshot máy chủ (mặc định light)
    // chưa phản ánh lựa chọn đã lưu → tránh ghi đè lớp `.dark` do script đặt.
    applyThemeToDocument(resolveTheme(preferencesStore.getSnapshot().theme, getSystemDarkSnapshot()));
  }, [prefs.theme, systemDark]);

  return null;
}

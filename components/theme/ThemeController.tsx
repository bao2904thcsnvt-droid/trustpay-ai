"use client";

import { useLayoutEffect } from "react";
import { preferencesStore, usePreferences } from "@/lib/preferences/preferences-store";
import { applyThemeToDocument, DEFAULT_THEME, resolveTheme, type ThemeMode } from "@/lib/theme/theme";

/** Chưa chọn theme → Dark Cinematic (vòng 5), không phụ thuộc theme hệ thống. */
const DEFAULT_IS_DARK = DEFAULT_THEME === "dark";

/** Theme hiệu lực (lựa chọn đã lưu, hoặc `DEFAULT_THEME` khi chưa chọn). */
export function useResolvedTheme(): ThemeMode {
  const prefs = usePreferences();
  return resolveTheme(prefs.theme, DEFAULT_IS_DARK);
}

/**
 * Đồng bộ lớp `.dark` trên <html> với theme hiệu lực. Script trong <head> đã đặt
 * lớp trước lần vẽ đầu; `useLayoutEffect` áp lại sau mỗi thay đổi (và sau lần
 * remount của Strict Mode ở môi trường dev) trước khi trình duyệt vẽ.
 */
export default function ThemeController() {
  const prefs = usePreferences();

  useLayoutEffect(() => {
    // Đọc trực tiếp nguồn thật: lúc hydrate, snapshot máy chủ (mặc định) chưa phản
    // ánh lựa chọn đã lưu → tránh ghi đè lớp do script trong <head> đặt.
    applyThemeToDocument(resolveTheme(preferencesStore.getSnapshot().theme, DEFAULT_IS_DARK));
  }, [prefs.theme]);

  return null;
}

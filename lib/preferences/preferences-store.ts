import { useSyncExternalStore } from "react";
import type { AppLanguage } from "@/types/trustpay";
import { createPersistentStore } from "@/lib/store/persistent-store";
import type { ThemePreference } from "@/lib/theme/theme";

/**
 * Tùy chọn giao diện (ngôn ngữ VI/EN, theme Light/Dark, trạng thái Tour, Hướng
 * dẫn sử dụng & "Mẹo nhanh"). Tách khỏi dữ liệu Ví để nút "Reset Demo" không làm
 * mất lựa chọn giao diện của Ban Giám Khảo.
 */

/** Mã các hộp "Mẹo nhanh" ở đầu mỗi khu vực chức năng. */
export type QuickTipId = "transfer" | "qr" | "shopping" | "subscriptions" | "ops";

export const QUICK_TIP_IDS: readonly QuickTipId[] = ["transfer", "qr", "shopping", "subscriptions", "ops"];

export interface UiPreferences {
  language: AppLanguage;
  tourCollapsed: boolean;
  /** `null` = theo theme hệ thống (lần đầu mở ứng dụng). */
  theme: ThemePreference;
  /** Đã mở "📖 Hướng dẫn sử dụng" ít nhất một lần. */
  guideSeen: boolean;
  /** Bật/tắt toàn bộ hộp "Mẹo nhanh". */
  tipsEnabled: boolean;
  /** Các hộp "Mẹo nhanh" người dùng đã ẩn riêng lẻ. */
  dismissedTips: QuickTipId[];
}

export const PREFERENCES_STORAGE_KEY = "trustpay-ai.preferences.v1";

function createDefaultPreferences(): UiPreferences {
  return {
    language: "vi",
    tourCollapsed: false,
    theme: null,
    guideSeen: false,
    tipsEnabled: true,
    dismissedTips: [],
  };
}

function isQuickTipId(value: unknown): value is QuickTipId {
  return typeof value === "string" && (QUICK_TIP_IDS as readonly string[]).includes(value);
}

function sanitizePreferences(raw: unknown): UiPreferences {
  const defaults = createDefaultPreferences();
  if (typeof raw !== "object" || raw === null) {
    return defaults;
  }
  const record = raw as Record<string, unknown>;
  const dismissed = Array.isArray(record.dismissedTips)
    ? Array.from(new Set(record.dismissedTips.filter(isQuickTipId)))
    : defaults.dismissedTips;
  return {
    language: record.language === "en" ? "en" : "vi",
    tourCollapsed: typeof record.tourCollapsed === "boolean" ? record.tourCollapsed : defaults.tourCollapsed,
    theme: record.theme === "light" || record.theme === "dark" ? record.theme : null,
    guideSeen: typeof record.guideSeen === "boolean" ? record.guideSeen : defaults.guideSeen,
    tipsEnabled: typeof record.tipsEnabled === "boolean" ? record.tipsEnabled : defaults.tipsEnabled,
    dismissedTips: dismissed,
  };
}

export const preferencesStore = createPersistentStore<UiPreferences>({
  storageKey: PREFERENCES_STORAGE_KEY,
  createDefault: createDefaultPreferences,
  sanitize: sanitizePreferences,
});

export function usePreferences(): UiPreferences {
  return useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    preferencesStore.getServerSnapshot,
  );
}

export function setLanguage(language: AppLanguage): void {
  preferencesStore.setState((prev) => (prev.language === language ? prev : { ...prev, language }));
}

export function setTourCollapsed(tourCollapsed: boolean): void {
  preferencesStore.setState((prev) => (prev.tourCollapsed === tourCollapsed ? prev : { ...prev, tourCollapsed }));
}

export function setThemePreference(theme: ThemePreference): void {
  preferencesStore.setState((prev) => (prev.theme === theme ? prev : { ...prev, theme }));
}

export function markGuideSeen(): void {
  preferencesStore.setState((prev) => (prev.guideSeen ? prev : { ...prev, guideSeen: true }));
}

/** Bật lại toàn bộ "Mẹo nhanh" cũng hiện lại các hộp đã ẩn riêng lẻ. */
export function setTipsEnabled(tipsEnabled: boolean): void {
  preferencesStore.setState((prev) => {
    if (prev.tipsEnabled === tipsEnabled && (!tipsEnabled || prev.dismissedTips.length === 0)) {
      return prev;
    }
    return { ...prev, tipsEnabled, dismissedTips: tipsEnabled ? [] : prev.dismissedTips };
  });
}

export function dismissQuickTip(id: QuickTipId): void {
  preferencesStore.setState((prev) =>
    prev.dismissedTips.includes(id) ? prev : { ...prev, dismissedTips: [...prev.dismissedTips, id] },
  );
}

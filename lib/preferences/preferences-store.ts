import { useSyncExternalStore } from "react";
import type { AppLanguage } from "@/types/trustpay";
import { createPersistentStore } from "@/lib/store/persistent-store";

/**
 * Tùy chọn giao diện (ngôn ngữ VI/EN, trạng thái thu gọn Tour). Tách khỏi dữ
 * liệu Ví để nút "Reset Demo" không làm mất lựa chọn ngôn ngữ của Ban Giám Khảo.
 */

export interface UiPreferences {
  language: AppLanguage;
  tourCollapsed: boolean;
}

export const PREFERENCES_STORAGE_KEY = "trustpay-ai.preferences.v1";

function createDefaultPreferences(): UiPreferences {
  return { language: "vi", tourCollapsed: false };
}

function sanitizePreferences(raw: unknown): UiPreferences {
  const defaults = createDefaultPreferences();
  if (typeof raw !== "object" || raw === null) {
    return defaults;
  }
  const record = raw as Record<string, unknown>;
  return {
    language: record.language === "en" ? "en" : "vi",
    tourCollapsed: typeof record.tourCollapsed === "boolean" ? record.tourCollapsed : defaults.tourCollapsed,
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

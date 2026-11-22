"use client";

import type { ThemeMode } from "@/lib/theme/theme";
import { setThemePreference } from "@/lib/preferences/preferences-store";
import { useResolvedTheme } from "@/components/theme/ThemeController";
import { useI18n } from "@/components/i18n/I18nProvider";

const OPTIONS: { id: ThemeMode; icon: string }[] = [
  { id: "light", icon: "☀️" },
  { id: "dark", icon: "🌙" },
];

/** Nút `☀️ Light | 🌙 Dark` cạnh `VI | EN` — lựa chọn được lưu bền vững (mặc định theo hệ thống). */
export default function ThemeToggle() {
  const { t } = useI18n();
  const mode = useResolvedTheme();

  return (
    <div
      role="group"
      aria-label={t.theme.label}
      className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5"
    >
      {OPTIONS.map((option, index) => (
        <span key={option.id} className="inline-flex items-center">
          {index > 0 && (
            <span aria-hidden="true" className="text-slate-300">
              |
            </span>
          )}
          <button
            type="button"
            aria-pressed={mode === option.id}
            title={t.theme.switchTo(option.id)}
            onClick={() => setThemePreference(option.id)}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
              mode === option.id
                ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span aria-hidden="true">{option.icon}</span>
            <span className="hidden sm:inline">{option.id === "light" ? t.theme.light : t.theme.dark}</span>
            <span className="sr-only sm:hidden">{option.id === "light" ? t.theme.light : t.theme.dark}</span>
          </button>
        </span>
      ))}
    </div>
  );
}

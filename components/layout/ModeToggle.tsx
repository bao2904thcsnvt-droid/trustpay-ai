"use client";

import type { UiMode } from "@/lib/hub/hub-store";
import { useI18n } from "@/components/i18n/I18nProvider";

export interface ModeToggleProps {
  mode: UiMode;
  onChange: (mode: UiMode) => void;
}

/** Nút gạt nổi bật "✨ Chế độ Đơn giản (Easy Mode)" | "⚡ Chế độ Đầy đủ (Pro Mode)". */
export default function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const { t } = useI18n();
  const options: { id: UiMode; full: string; short: string }[] = [
    { id: "easy", full: t.mode.easy, short: t.mode.easyShort },
    { id: "pro", full: t.mode.pro, short: t.mode.proShort },
  ];

  return (
    <div
      role="group"
      aria-label={t.mode.label}
      className="inline-flex items-center gap-0.5 rounded-xl border-2 border-amber-300 bg-amber-50 p-0.5 shadow-xs"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          title={option.full}
          onClick={() => onChange(option.id)}
          className={`inline-flex cursor-pointer items-center rounded-lg px-2.5 py-1.5 text-xs font-extrabold whitespace-nowrap transition-colors ${
            mode === option.id
              ? option.id === "easy"
                ? "bg-amber-500 text-white shadow-sm"
                : "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm"
              : "text-amber-800 hover:bg-amber-100"
          }`}
        >
          <span className="hidden xl:inline">{option.full}</span>
          <span className="xl:hidden">{option.short}</span>
        </button>
      ))}
    </div>
  );
}

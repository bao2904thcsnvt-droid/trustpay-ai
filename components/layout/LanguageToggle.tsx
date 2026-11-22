"use client";

import { Languages } from "lucide-react";
import type { AppLanguage } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";

const OPTIONS: { id: AppLanguage; label: string }[] = [
  { id: "vi", label: "VI" },
  { id: "en", label: "EN" },
];

/** Nút chuyển ngôn ngữ `VI | EN` (lựa chọn được lưu bền vững). */
export default function LanguageToggle({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t.header.languageLabel}
      className={`inline-flex items-center gap-0.5 rounded-xl border p-0.5 ${
        tone === "dark" ? "border-white/25 bg-white/10" : "border-slate-200 bg-white"
      }`}
    >
      <Languages className={`mx-1 h-3.5 w-3.5 ${tone === "dark" ? "text-white/80" : "text-slate-400"}`} />
      {OPTIONS.map((option, index) => (
        <span key={option.id} className="inline-flex items-center">
          {index > 0 && (
            <span aria-hidden="true" className={tone === "dark" ? "text-white/40" : "text-slate-300"}>
              |
            </span>
          )}
          <button
            type="button"
            aria-pressed={lang === option.id}
            onClick={() => setLang(option.id)}
            className={`cursor-pointer rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
              lang === option.id
                ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm"
                : tone === "dark"
                  ? "text-white/80 hover:bg-white/10"
                  : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  );
}

"use client";

import { Lightbulb, X } from "lucide-react";
import {
  dismissQuickTip,
  setTipsEnabled,
  usePreferences,
  type QuickTipId,
} from "@/lib/preferences/preferences-store";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Hộp "Mẹo nhanh" ở đầu mỗi khu vực chức năng. Ẩn riêng từng hộp hoặc tắt toàn
 * bộ; trạng thái lưu bền vững (bật lại trong "📖 Hướng dẫn sử dụng").
 */
export default function QuickTip({ id }: { id: QuickTipId }) {
  const { t } = useI18n();
  const prefs = usePreferences();

  if (!prefs.tipsEnabled || prefs.dismissedTips.includes(id)) {
    return null;
  }

  return (
    <aside
      aria-label={t.tips.title}
      className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
        <Lightbulb className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-wide text-amber-700 uppercase">{t.tips.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-900">{t.tips.items[id]}</p>
        <button
          type="button"
          onClick={() => setTipsEnabled(false)}
          className="mt-1.5 cursor-pointer text-[11px] font-semibold text-amber-700 underline-offset-2 hover:underline"
        >
          {t.tips.turnOffAll}
        </button>
      </div>
      <button
        type="button"
        onClick={() => dismissQuickTip(id)}
        aria-label={t.tips.hide}
        title={t.tips.hide}
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-amber-700 transition-colors hover:bg-amber-100"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}

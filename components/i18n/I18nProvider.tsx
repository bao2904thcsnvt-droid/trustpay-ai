"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { AppLanguage, CategoryName } from "@/types/trustpay";
import { MESSAGES, type Messages } from "@/lib/i18n/messages";
import { translateCategory, translateDataText } from "@/lib/i18n/server-text";
import { formatDateTime, formatMoney } from "@/lib/wallet/format";
import { setLanguage, usePreferences } from "@/lib/preferences/preferences-store";

export interface I18nContextValue {
  lang: AppLanguage;
  t: Messages;
  setLang: (lang: AppLanguage) => void;
  /** Định dạng tiền VNĐ theo ngôn ngữ hiện tại. */
  money: (amount: number) => string;
  /** Tên hiển thị của danh mục ngân sách. */
  category: (name: CategoryName) => string;
  /** Dịch chuỗi dữ liệu tiếng Việt đã biết (scamType, redFlags, ghi chú...). */
  data: (text: string) => string;
  dateTime: (iso: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { language } = usePreferences();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang: language,
      t: MESSAGES[language],
      setLang: setLanguage,
      money: (amount: number) => formatMoney(amount, language),
      category: (name: CategoryName) => translateCategory(name, language),
      data: (text: string) => translateDataText(text, language),
      dateTime: (iso: string) => formatDateTime(iso, language),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n phải được dùng bên trong <I18nProvider>.");
  }
  return context;
}

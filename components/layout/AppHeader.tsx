"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cloud,
  Compass,
  Ellipsis,
  FileCheck2,
  Gauge,
  Menu,
  Moon,
  RotateCcw,
  ShieldAlert,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import { setThemePreference } from "@/lib/preferences/preferences-store";
import { useResolvedTheme } from "@/components/theme/ThemeController";
import type { UiMode } from "@/lib/hub/hub-store";
import { useI18n } from "@/components/i18n/I18nProvider";
import LanguageToggle from "@/components/layout/LanguageToggle";
import ThemeToggle from "@/components/layout/ThemeToggle";
import ModeToggle from "@/components/layout/ModeToggle";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import BrandLogo from "@/components/cinematic/BrandLogo";

export type AppTab = "user-wallet" | "fintech-ops";

export interface AppHeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  pendingAlertsCount: number;
  onOpenOnboarding: () => void;
  onReset: () => void;
  /** Mở "📖 Hướng dẫn sử dụng" (luôn hiển thị trên thanh điều hướng). */
  onOpenGuide?: () => void;
  /** Đã từng mở hướng dẫn — ẩn chấm "Mới". */
  guideSeen?: boolean;
  /** Mở bảng "AWS Security & FinOps". */
  onOpenFinOps?: () => void;
  /** Vòng 3: "🔌 Chế độ Nhúng SDK (MoMo Embedded)". */
  embedMode?: boolean;
  onToggleEmbed?: () => void;
  /** Vòng 4: "✨ Chế độ Đơn giản (Easy Mode)" | "⚡ Chế độ Đầy đủ (Pro Mode)". */
  uiMode?: UiMode;
  onModeChange?: (mode: UiMode) => void;
  /** Vòng 4: "📲 Cài App lên Điện thoại" (PWA) đã cài xong. */
  onAppInstalled?: () => void;
  /** Vòng 5: bấm logo TRUSTPAY AI → quay lại màn hình Hero. */
  onLogoClick?: () => void;
}

/**
 * Thanh ứng dụng kính mờ (Dark Cinematic Glassmorphism): logo TRUSTPAY AI (bấm để về Hero),
 * 2 phân hệ, Easy/Pro, Hướng dẫn, AWS FinOps, Nhúng SDK, `VI | EN`, Reset Demo và menu phụ
 * (`☀️ Light | 🌙 Dark`, Cài App, Giới thiệu). Màn hình nhỏ: các nút gom vào Menu Burger,
 * mọi vùng chạm cao tối thiểu 44px.
 */
export default function AppHeader({
  activeTab,
  onTabChange,
  pendingAlertsCount,
  onOpenOnboarding,
  onReset,
  onOpenGuide,
  guideSeen = true,
  onOpenFinOps,
  embedMode = false,
  onToggleEmbed,
  uiMode = "pro",
  onModeChange,
  onAppInstalled,
  onLogoClick,
}: AppHeaderProps) {
  const { t } = useI18n();
  const theme = useResolvedTheme();
  // Easy Mode: ẩn Ops, AWS FinOps, Nhúng SDK và thẻ chào mừng chọn vai trò.
  const easyMode = uiMode === "easy";
  const showTabs = !embedMode && !easyMode;
  const [resetArmed, setResetArmed] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const armTimerRef = useRef<number | null>(null);
  const doneTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
      if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const handleResetClick = () => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }

    if (!resetArmed) {
      setResetArmed(true);
      armTimerRef.current = window.setTimeout(() => setResetArmed(false), 3500);
      return;
    }

    setResetArmed(false);
    setMenuOpen(false);
    onReset();
    setResetDone(true);
    if (doneTimerRef.current !== null) window.clearTimeout(doneTimerRef.current);
    doneTimerRef.current = window.setTimeout(() => setResetDone(false), 2200);
  };

  /** Chạy hành động rồi đóng menu (dùng cho các mục trong Menu Burger / menu phụ). */
  const fromMenu = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const tabClass = (tab: AppTab) =>
    `flex min-w-[76%] shrink-0 cursor-pointer snap-start items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all sm:min-w-0 sm:flex-1 lg:flex-initial lg:shrink ${
      activeTab === tab
        ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25"
        : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
    }`;

  const ghostButton =
    "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all hover:border-pink-300 hover:bg-pink-50 hover:text-[#a50064]";

  const menuItem =
    "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100";

  const tabs = (
    <>
      <button
        type="button"
        aria-current={activeTab === "user-wallet" ? "page" : undefined}
        onClick={() => onTabChange("user-wallet")}
        className={tabClass("user-wallet")}
      >
        <Wallet className="h-4 w-4 shrink-0" />
        {/* Laptop 1024–1535px: nhãn ngắn để thanh tiêu đề không tràn ra ngoài màn hình. */}
        <span className="truncate lg:hidden 2xl:inline">{t.header.walletTab}</span>
        <span className="hidden truncate lg:inline 2xl:hidden">{t.app.walletShort}</span>
      </button>

      <button
        type="button"
        aria-current={activeTab === "fintech-ops" ? "page" : undefined}
        onClick={() => onTabChange("fintech-ops")}
        className={tabClass("fintech-ops")}
      >
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span className="truncate lg:hidden 2xl:inline">{t.header.opsTab}</span>
        <span className="hidden truncate lg:inline 2xl:hidden">{t.app.screen.ops}</span>
        <span
          title={t.header.pendingAlerts(pendingAlertsCount)}
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-xs font-bold ${
            activeTab === "fintech-ops"
              ? "bg-white text-[#a50064]"
              : pendingAlertsCount > 0
                ? "bg-rose-600 text-white"
                : "bg-slate-200 text-slate-600"
          }`}
        >
          {pendingAlertsCount}
        </span>
      </button>
    </>
  );

  const resetContent = resetDone ? (
    <>
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>{t.header.resetDone}</span>
    </>
  ) : resetArmed ? (
    <>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{t.header.resetConfirm}</span>
    </>
  ) : (
    <>
      <RotateCcw className="h-4 w-4 shrink-0" />
      <span>{t.header.resetShort}</span>
    </>
  );

  const resetTone = resetDone
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : resetArmed
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-white text-slate-700 hover:border-pink-300 hover:bg-pink-50 hover:text-[#a50064]";

  const embedLabel = embedMode ? `🔌 ${t.sdk.exit}` : t.sdk.toggle;

  const brand = (
    <>
      <BrandLogo size={38} />
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="flex items-center gap-2">
          <span className="tp-brand-word">{t.cine.brand}</span>
          <span className="hidden items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-[#a50064] 2xl:inline-flex">
            <Cloud className="h-3 w-3" />
            {t.common.awsBadge}
          </span>
        </span>
        <span className="hidden max-w-[14rem] truncate text-[11px] text-slate-500 sm:block">{t.common.demoAccount}</span>
      </span>
    </>
  );

  return (
    <header className="tp-appbar sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-xs backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Trái: Logo — bấm để quay lại màn hình Hero */}
        {onLogoClick ? (
          <button
            type="button"
            onClick={onLogoClick}
            aria-label={t.cine.brandHome}
            title={t.cine.brandHome}
            className="flex min-h-11 min-w-0 shrink-0 cursor-pointer items-center gap-2.5 rounded-2xl pr-1 text-left transition-opacity hover:opacity-90"
          >
            {brand}
          </button>
        ) : (
          <div className="flex min-h-11 min-w-0 shrink-0 items-center gap-2.5">{brand}</div>
        )}

        {/* Giữa: 2 phân hệ (laptop) — ẩn ở chế độ nhúng SDK tinh gọn và Easy Mode */}
        {showTabs && (
          <nav
            aria-label={t.header.navLabel}
            className="mx-auto hidden min-w-0 items-center gap-1 rounded-2xl bg-slate-100 p-1 lg:flex"
          >
            {tabs}
          </nav>
        )}

        {/* Phải: Easy/Pro + nhóm nút (laptop) + Menu Burger / menu phụ */}
        <div className="ml-auto flex items-center gap-2">
          {onModeChange && <ModeToggle mode={uiMode} onChange={onModeChange} />}

          <div className="hidden items-center gap-2 lg:flex">
            {/* Từ 1536px mới đủ chỗ cho cả nhóm nút; nhỏ hơn thì gom vào menu ⋯ (không tràn màn hình). */}
            {onToggleEmbed && !easyMode && (
              <button
                type="button"
                onClick={onToggleEmbed}
                aria-pressed={embedMode}
                aria-label={embedMode ? t.sdk.exit : t.sdk.toggle}
                title={t.sdk.toggleTitle}
                className={`hidden min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold whitespace-nowrap transition-all 2xl:inline-flex ${
                  embedMode
                    ? "border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                    : "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100"
                }`}
              >
                {embedMode ? embedLabel : <span>{t.sdk.toggleShort}</span>}
              </button>
            )}

            {onOpenGuide && (
              <button
                type="button"
                onClick={onOpenGuide}
                title={t.nav.guideTitle}
                className="relative hidden min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-3 py-2 text-xs font-bold text-white shadow-sm shadow-[#a50064]/25 transition-all hover:brightness-110 xl:inline-flex"
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{t.nav.guideShort}</span>
                {!guideSeen && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex items-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-slate-900 uppercase shadow-sm">
                    {t.nav.guideNew}
                  </span>
                )}
              </button>
            )}

            {onOpenFinOps && !easyMode && (
              <button
                type="button"
                onClick={onOpenFinOps}
                title={t.nav.finopsTitle}
                className={`${ghostButton.replace("inline-flex ", "")} hidden 2xl:inline-flex`}
              >
                <Gauge className="h-4 w-4 shrink-0" />
                <span>{t.nav.finopsShort}</span>
              </button>
            )}

            <div className="hidden 2xl:block">
              <LanguageToggle />
            </div>

            <button
              type="button"
              onClick={handleResetClick}
              title={t.header.resetTitle}
              className={`hidden min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all 2xl:inline-flex ${resetTone}`}
            >
              {resetContent}
            </button>
          </div>

          {/* Daylight Mode (nền sáng dịu #F8FAFC) ↔ Obsidian Slate — luôn ở thanh trên cùng. */}
          <button
            type="button"
            onClick={() => setThemePreference(theme === "dark" ? "light" : "dark")}
            aria-pressed={theme === "light"}
            aria-label={t.theme.switchTo(theme === "dark" ? "light" : "dark")}
            title={t.theme.switchTo(theme === "dark" ? "light" : "dark")}
            className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="tp-app-menu"
              aria-label={menuOpen ? t.cine.menuClose : t.cine.appMenu}
              title={t.cine.moreMenu}
              onClick={() => setMenuOpen((open) => !open)}
              className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100"
            >
              {menuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <>
                  <Menu className="h-5 w-5 lg:hidden" />
                  <Ellipsis className="hidden h-5 w-5 lg:block" />
                </>
              )}
              {!guideSeen && !menuOpen && (
                <span aria-hidden="true" className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400 xl:hidden" />
              )}
            </button>

            {menuOpen && (
              <div
                id="tp-app-menu"
                className="tp-menu absolute top-full right-0 z-50 mt-2 w-[min(calc(100vw-2rem),21rem)] space-y-2 rounded-3xl border border-slate-200 bg-white p-2.5 shadow-2xl"
              >
                {/* Dưới 1536px: các nút của thanh laptop gom vào đây (Hướng dẫn hiện ngoài thanh từ 1280px). */}
                <div className="space-y-1 border-b border-slate-200 pb-2 2xl:hidden">
                  {onOpenGuide && (
                    <button type="button" onClick={fromMenu(onOpenGuide)} className={`${menuItem} xl:hidden`}>
                      <BookOpen className="h-4 w-4 shrink-0 text-[#a50064]" />
                      <span className="min-w-0 flex-1">{t.nav.guide}</span>
                      {!guideSeen && (
                        <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-extrabold text-slate-900 uppercase">
                          {t.nav.guideNew}
                        </span>
                      )}
                    </button>
                  )}
                  {onOpenFinOps && !easyMode && (
                    <button type="button" onClick={fromMenu(onOpenFinOps)} className={menuItem}>
                      <Gauge className="h-4 w-4 shrink-0 text-[#a50064]" />
                      <span className="min-w-0 flex-1">{t.nav.finops}</span>
                    </button>
                  )}
                  {onToggleEmbed && !easyMode && (
                    <button
                      type="button"
                      aria-pressed={embedMode}
                      title={t.sdk.toggleTitle}
                      onClick={fromMenu(onToggleEmbed)}
                      className={menuItem}
                    >
                      <span aria-hidden="true" className="w-4 text-center">
                        🔌
                      </span>
                      <span className="min-w-0 flex-1">{embedMode ? t.sdk.exit : t.sdk.toggle}</span>
                    </button>
                  )}
                  <div className="flex min-h-11 items-center justify-between gap-2 px-3">
                    <span className="text-xs font-semibold text-slate-500">{t.header.languageLabel}</span>
                    <LanguageToggle />
                  </div>
                  <button
                    type="button"
                    onClick={handleResetClick}
                    title={t.header.resetTitle}
                    className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${resetTone}`}
                  >
                    {resetContent}
                  </button>
                </div>

                {/* Menu phụ: Light / Dark (dùng ngoài trời nắng), Cài App, Giới thiệu */}
                <div className="space-y-2 px-1 pt-0.5">
                  <p className="px-2 text-[11px] font-semibold text-slate-500">{t.cine.themeRow}</p>
                  <div className="px-2">
                    <ThemeToggle />
                  </div>
                  {!embedMode && (
                    <div className="px-2">
                      <InstallAppButton onInstalled={onAppInstalled} />
                    </div>
                  )}
                  {!embedMode && !easyMode && (
                    <button type="button" onClick={fromMenu(onOpenOnboarding)} title={t.header.welcomeTitle} className={menuItem}>
                      <Compass className="h-4 w-4 shrink-0 text-[#a50064]" />
                      <span className="min-w-0 flex-1">{t.header.welcome}</span>
                    </button>
                  )}
                  <Link href="/privacy" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <FileCheck2 className="h-4 w-4 shrink-0 text-[#a50064]" />
                    <span className="min-w-0 flex-1">Chính sách dữ liệu (NĐ 13/2023)</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Điện thoại / tablet: thanh phân hệ cuộn ngang (snap) ngay dưới logo */}
      {showTabs && (
        <div className="mx-auto max-w-7xl px-4 pb-2.5 sm:px-6 lg:hidden">
          <nav
            aria-label={t.header.navLabel}
            className="tp-scroll-x flex snap-x snap-mandatory items-center gap-1 rounded-2xl bg-slate-100 p-1"
          >
            {tabs}
          </nav>
        </div>
      )}
    </header>
  );
}

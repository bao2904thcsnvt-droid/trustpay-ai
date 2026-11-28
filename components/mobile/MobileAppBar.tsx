"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileCheck2,
  Gauge,
  Menu,
  Monitor,
  Plug,
  RotateCcw,
  ShieldAlert,
  X,
} from "lucide-react";
import type { UiMode } from "@/lib/hub/hub-store";
import { setThemePreference } from "@/lib/preferences/preferences-store";
import { useResolvedTheme } from "@/components/theme/ThemeController";
import { useI18n } from "@/components/i18n/I18nProvider";
import LanguageToggle from "@/components/layout/LanguageToggle";
import ModeToggle from "@/components/layout/ModeToggle";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import BrandLogo from "@/components/cinematic/BrandLogo";

export interface MobileAppBarProps {
  /** Tên màn hình đang mở (Trang chủ, Chuyển / Rút tiền…). */
  title: string;
  pendingAlertsCount: number;
  uiMode: UiMode;
  /** Không truyền (chế độ nhúng SDK) → ẩn hàng chọn Easy / Pro. */
  onModeChange?: (mode: UiMode) => void;
  /** Không truyền (chế độ nhúng SDK) → logo không mở lại màn hình giới thiệu. */
  onLogoClick?: () => void;
  /** Có giá trị (vd đang ở Ops Center) → hiện nút quay lại thay cho logo. */
  onBack?: () => void;
  backLabel?: string;
  onOpenOps: () => void;
  onOpenGuide: () => void;
  guideSeen: boolean;
  onOpenFinOps: () => void;
  embedMode: boolean;
  onToggleEmbed: () => void;
  onOpenOnboarding: () => void;
  onReset: () => void;
  onAppInstalled: () => void;
  /** Trạng thái liên kết ngân hàng thật trên thanh trên cùng. */
  accountStatus?: string;
  isBankLinked?: boolean;
  demoMode?: boolean;
  onToggleDemoMode?: (enabled: boolean) => void;
}

/**
 * Thanh ứng dụng gọn cho điện thoại (≤768px / PWA): logo (về màn hình giới thiệu) + tên màn hình,
 * chuông cảnh báo và nút menu. Mọi tùy chọn còn lại nằm trong bottom sheet: Easy / Pro, Obsidian /
 * Daylight, VI | EN, Hướng dẫn, Ops Center, AWS FinOps, Nhúng SDK, Cài App, Giới thiệu, Reset Demo.
 */
export default function MobileAppBar({
  title,
  pendingAlertsCount,
  uiMode,
  onModeChange,
  onLogoClick,
  onBack,
  backLabel,
  onOpenOps,
  onOpenGuide,
  guideSeen,
  onOpenFinOps,
  embedMode,
  onToggleEmbed,
  onOpenOnboarding,
  onReset,
  onAppInstalled,
  accountStatus,
  isBankLinked = false,
  demoMode = false,
  onToggleDemoMode,
}: MobileAppBarProps) {
  const { t } = useI18n();
  const theme = useResolvedTheme();
  const [open, setOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const armTimerRef = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const easy = uiMode === "easy";
  // Như thanh tiêu đề laptop: Easy Mode và chế độ nhúng SDK không có Ops Center.
  const showOps = !easy && !embedMode;

  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 30);
    const root = document.documentElement;
    root.classList.add("tp-sheet-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      root.classList.remove("tp-sheet-open");
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const handleReset = () => {
    if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    if (!resetArmed) {
      setResetArmed(true);
      armTimerRef.current = window.setTimeout(() => setResetArmed(false), 3500);
      return;
    }
    setResetArmed(false);
    onReset();
    setResetDone(true);
    armTimerRef.current = window.setTimeout(() => {
      setResetDone(false);
      setOpen(false);
    }, 900);
  };

  const item =
    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-medium text-slate-800 transition-colors hover:bg-slate-100 active:bg-slate-100";
  // Nhãn dùng chung với thanh tiêu đề laptop có emoji ở đầu ("📖 …", "🔌 …") — menu đã có biểu tượng riêng.
  // Chữ Việt có mã < U+2000; emoji / ký hiệu nằm phía trên → bỏ "từ" đầu tiên nếu là biểu tượng.
  const plain = (label: string) => ((label.codePointAt(0) ?? 0) > 0x2000 ? label.replace(/^\S+\s*/, "") : label);

  const sheet = open
    ? createPortal(
        <div className="tp-msheet-root" role="presentation">
          <button type="button" className="tp-msheet-scrim" aria-label={t.cine.menuClose} onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="tp-msheet-title" className="tp-msheet">
            <span aria-hidden="true" className="tp-msheet-grip" />
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id="tp-msheet-title" className="text-base font-bold text-slate-900">
                {t.app.menuTitle}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.cine.menuClose}
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="tp-msheet-group">
              {onModeChange && (
                <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-1">
                  <span className="text-sm text-slate-600">{t.app.modeRow}</span>
                  <ModeToggle
                    mode={uiMode}
                    onChange={(mode) => {
                      setOpen(false);
                      onModeChange(mode);
                    }}
                  />
                </div>
              )}
              <div className="flex min-h-12 items-center justify-between gap-3 px-3">
                <span className="text-sm text-slate-600">{t.app.themeRow}</span>
                <div role="group" aria-label={t.theme.label} className="tp-seg">
                  <button type="button" aria-pressed={theme === "dark"} onClick={() => setThemePreference("dark")}>
                    🌙 {t.app.themeDark}
                  </button>
                  <button type="button" aria-pressed={theme === "light"} onClick={() => setThemePreference("light")}>
                    ☀️ {t.app.themeLight}
                  </button>
                </div>
              </div>
              <div className="flex min-h-12 items-center justify-between gap-3 px-3">
                <span className="text-sm text-slate-600">{t.app.langRow}</span>
                <LanguageToggle />
              </div>
            </div>

            <p className="px-3 pt-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.app.tools}</p>
            <div className="tp-msheet-group">
              <button type="button" className={item} onClick={run(onOpenGuide)}>
                <BookOpen className="h-5 w-5 shrink-0 text-sky-600" />
                <span className="min-w-0 flex-1">{plain(t.nav.guide)}</span>
                {!guideSeen && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-900 uppercase">
                    {t.nav.guideNew}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              {showOps && (
                <button type="button" className={item} onClick={run(onOpenOps)}>
                  <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600" />
                  <span className="min-w-0 flex-1">{t.app.opsCenter}</span>
                  {pendingAlertsCount > 0 && (
                    <span className="tp-num rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                      {pendingAlertsCount}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}
              {!easy && (
                <>
                  <button type="button" className={item} onClick={run(onOpenFinOps)}>
                    <Gauge className="h-5 w-5 shrink-0 text-sky-600" />
                    <span className="min-w-0 flex-1">{plain(t.nav.finops)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                  <button type="button" className={item} aria-pressed={embedMode} onClick={run(onToggleEmbed)}>
                    <Plug className="h-5 w-5 shrink-0 text-sky-600" />
                    <span className="min-w-0 flex-1">{plain(embedMode ? t.sdk.exit : t.sdk.toggle)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                </>
              )}
              {onLogoClick && (
                <button type="button" className={item} onClick={run(onLogoClick)}>
                  <Monitor className="h-5 w-5 shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1">{t.app.hero}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}
              {!easy && !embedMode && (
                <button type="button" className={item} onClick={run(onOpenOnboarding)}>
                  <Compass className="h-5 w-5 shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1">{plain(t.header.welcome)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )}
              {!embedMode && (
                <div className="px-3 py-2">
                  <InstallAppButton onInstalled={onAppInstalled} />
                </div>
              )}
              <Link href="/privacy" onClick={() => setOpen(false)} className={item}>
                <FileCheck2 className="h-5 w-5 shrink-0 text-sky-600" />
                <span className="min-w-0 flex-1">Chính sách dữ liệu (NĐ 13/2023)</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
              {onToggleDemoMode && (
                <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">Chế độ dữ liệu mẫu</p>
                    <p className="text-[11px] text-slate-500">
                      {demoMode ? "Đang bật dữ liệu kiểm thử" : "Tắt — Đang dùng tiền thật"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={demoMode}
                    onClick={() => {
                      setOpen(false);
                      onToggleDemoMode(!demoMode);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                      demoMode ? "bg-amber-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                        demoMode ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleReset}
              title={t.header.resetTitle}
              className={`flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-colors ${
                resetDone
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : resetArmed
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-slate-200 text-slate-700"
              }`}
            >
              {resetDone ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : resetArmed ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {resetDone ? t.header.resetDone : resetArmed ? t.header.resetConfirm : t.header.reset}
            </button>
          </div>
        </div>,
        document.body,
      )
    : null;

  const titleBlock = (
    <span className="min-w-0">
      <span className="block truncate text-[17px] leading-tight font-bold text-slate-900">{title}</span>
      <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs leading-tight text-slate-500">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${
            demoMode ? "bg-amber-400" : isBankLinked ? "bg-emerald-500" : "bg-slate-400"
          }`}
        />
        <span className="truncate">{accountStatus || "Chưa liên kết ngân hàng"}</span>
      </span>
    </span>
  );

  return (
    <header className="tp-mbar">
      {onBack ? (
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel ?? t.app.back}
            title={backLabel ?? t.app.back}
            className="tp-mbar-btn -ml-1"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          {titleBlock}
        </div>
      ) : onLogoClick ? (
        <button
          type="button"
          onClick={onLogoClick}
          aria-label={t.cine.brandHome}
          title={t.cine.brandHome}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <BrandLogo size={40} />
          {titleBlock}
        </button>
      ) : (
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
          <BrandLogo size={40} />
          {titleBlock}
        </div>
      )}

      {showOps && (
        <button
          type="button"
          onClick={onOpenOps}
          aria-label={t.app.alerts(pendingAlertsCount)}
          title={t.app.alerts(pendingAlertsCount)}
          className="tp-mbar-btn relative"
        >
          <Bell className="h-5 w-5" />
          {pendingAlertsCount > 0 && <span className="tp-mbar-badge tp-num">{pendingAlertsCount}</span>}
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.cine.appMenu}
        className="tp-mbar-btn relative"
      >
        <Menu className="h-5 w-5" />
        {!guideSeen && <span aria-hidden="true" className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-400" />}
      </button>

      {sheet}
    </header>
  );
}

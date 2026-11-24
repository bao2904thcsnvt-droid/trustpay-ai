"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { HeroTarget } from "@/lib/cinematic/cinematic";
import { usePrefersReducedMotion } from "@/lib/hooks/use-media-query";
import { useI18n } from "@/components/i18n/I18nProvider";
import LanguageToggle from "@/components/layout/LanguageToggle";

export interface HeroLandingProps {
  /** Đang chạy hiệu ứng mở xuống Không gian làm việc. */
  leaving: boolean;
  easyMode: boolean;
  onNavigate: (target: HeroTarget) => void;
  onToggleEasy: () => void;
}

const delay = (ms: number): CSSProperties => ({ "--d": `${ms}ms` }) as CSSProperties;

/** Biểu tượng khiên TrustPay (đen) đặt trong logo tròn trắng. */
function ShieldMark() {
  return (
    <svg viewBox="0 0 32 32" width="72%" height="72%" aria-hidden="true" focusable="false">
      <path d="M16 3 27 7v8.2c0 6.2-4.3 11.2-11 13.8C9.3 26.400 5 21.400 5 15.200V7L16 3Z" fill="#0b0b0c" />
      <path d="m10.800 15.800 3.800 3.800 7-7.600" fill="none" stroke="#ffffff" strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STATS = [
  { id: "speed", symbol: "<", value: 120, decimals: 0, unit: "ms" },
  { id: "accuracy", symbol: "%", value: 99.99, decimals: 2, unit: "%" },
  { id: "uptime", symbol: "*", value: 24, decimals: 0, unit: "/7" },
  { id: "samples", symbol: "#", value: 2.4, decimals: 1, unit: "M" },
] as const;

const COUNT_MS = 1600;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

/**
 * Tiến độ đếm 0 → 1 (easeOutCubic). Máy chủ và lần hydrate đầu luôn trả 0; sau khi gắn,
 * `requestAnimationFrame` chạy hiệu ứng. Giảm chuyển động → nhảy thẳng về trạng thái cuối.
 */
function useCountProgress(): number {
  const reduced = usePrefersReducedMotion();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    if (reduced) {
      frame = window.requestAnimationFrame(() => setProgress(1));
      return () => window.cancelAnimationFrame(frame);
    }
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const ratio = Math.min(1, (now - start) / COUNT_MS);
      setProgress(easeOutCubic(ratio));
      if (ratio < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [reduced]);

  return progress;
}

/**
 * Màn hình Hero 1-viewport (`100dvh`, không cuộn khi mở đầu): Header (logo tròn trắng, Nav viên
 * thuốc, nút tối "Mở App"), Hero trung tâm (Trust Row, tiêu đề chấm ma trận, mô tả, CTA trắng
 * phát sáng) và Stats Footer. Mobile ≤720px: Logo + Burger, menu trắng bo góc 28px.
 */
export default function HeroLanding({ leaving, easyMode, onNavigate, onToggleEasy }: HeroLandingProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const progress = useCountProgress();
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const go = (target: HeroTarget) => {
    setMenuOpen(false);
    onNavigate(target);
  };

  const navItems: { id: HeroTarget; label: string }[] = [
    { id: "home", label: t.cine.nav.home },
    { id: "wallet", label: t.cine.nav.wallet },
    { id: "scan", label: t.cine.nav.scan },
    { id: "shield", label: t.cine.nav.shield },
  ];

  const statLabels = t.cine.stats;

  return (
    <section ref={rootRef} className="hv" data-leaving={leaving ? "true" : "false"} aria-labelledby="tp-hero-title">
      {/* Tầng 1 — Header */}
      <header className="hv-header">
        <button type="button" className="hv-logo" aria-label={t.cine.brandHome} title={t.cine.brand} onClick={() => go("home")}>
          <ShieldMark />
        </button>

        <nav className="hv-nav" aria-label={t.cine.navLabel}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="hv-nav-item"
              aria-current={item.id === "home" ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button type="button" className="hv-signin" onClick={() => go("app")}>
          {t.cine.openApp}
        </button>

        <button
          type="button"
          className="hv-burger"
          data-open={menuOpen ? "true" : "false"}
          aria-expanded={menuOpen}
          aria-controls="tp-hero-menu"
          aria-label={menuOpen ? t.cine.menuClose : t.cine.menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <span className="hv-x" aria-hidden="true" />
          ) : (
            <span className="hv-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </button>
      </header>

      {menuOpen && (
        <>
          <button type="button" className="hv-scrim" aria-label={t.cine.menuClose} onClick={() => setMenuOpen(false)} />
          <div id="tp-hero-menu" className="hv-sheet" role="dialog" aria-label={t.cine.appMenu}>
            <nav aria-label={t.cine.navLabel} className="hv-sheet-nav">
              {navItems.map((item) => (
                <button key={item.id} type="button" className="hv-sheet-item" onClick={() => go(item.id)}>
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="hv-sheet-row">
              <LanguageToggle />
              <button
                type="button"
                className="hv-sheet-chip"
                aria-pressed={easyMode}
                title={easyMode ? t.cine.easyOn : t.cine.easyOff}
                onClick={() => {
                  setMenuOpen(false);
                  onToggleEasy();
                }}
              >
                ✨ {t.cine.easy}
              </button>
            </div>
            <button type="button" className="hv-sheet-open" onClick={() => go("app")}>
              {t.cine.openApp}
            </button>
          </div>
        </>
      )}

      {/* Tầng 2 — Hero trung tâm */}
      <div className="hv-hero">
        <div className="hv-trust hv-rise" style={delay(60)}>
          <span className="hv-avatars" aria-hidden="true">
            <span className="hv-avatar">
              <span>
                <i className="fa-solid fa-building-columns" />
              </span>
            </span>
            <span className="hv-avatar">
              <span>
                <i className="fa-solid fa-shield-halved" />
              </span>
            </span>
            <span className="hv-avatar">
              <span>
                <i className="fa-solid fa-qrcode" />
              </span>
            </span>
          </span>
          <span className="hv-trust-pill">{t.cine.trust}</span>
        </div>

        <h1 id="tp-hero-title" className="hv-title">
          <span className="hv-line" style={delay(120)}>
            {t.cine.headline1}
          </span>
          <span className="hv-line" style={delay(300)}>
            {t.cine.headline2}
          </span>
        </h1>

        <p className="hv-desc hv-rise" style={delay(300)}>
          {t.cine.desc}
        </p>

        <button type="button" className="hv-cta" style={delay(400)} onClick={() => go("start")}>
          {t.cine.cta}
        </button>
      </div>

      {/* Tầng 3 — Stats Footer */}
      <ul className="hv-stats hv-rise" style={delay(520)} aria-label={t.cine.statsLabel}>
        {STATS.map((stat) => (
          <li key={stat.id} className="hv-stat">
            <span className="hv-stat-symbol" aria-hidden="true">
              {stat.symbol}
            </span>
            <span className="hv-stat-value">
              {(stat.value * progress).toFixed(stat.decimals)}
              <small>{stat.unit}</small>
            </span>
            <span className="hv-stat-label">{statLabels[stat.id]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

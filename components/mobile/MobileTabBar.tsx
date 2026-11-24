"use client";

import { ArrowLeftRight, House, Landmark, ScanLine, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

export type MobileTab = "home" | "transfer" | "scan" | "banks" | "shield";

export interface MobileTabBarProps {
  /** Tab đang mở (null khi đang ở tab Ops). */
  active: MobileTab | null;
  onSelect: (tab: MobileTab) => void;
}

/**
 * Thanh Tab Bar kiểu app ngân hàng cố định ở đáy màn hình (hỗ trợ `env(safe-area-inset-bottom)`):
 * Trang chủ · Chuyển/Rút · Quét QR (nút tròn trắng nổi ở giữa) · Ngân hàng · Lá chắn.
 */
export default function MobileTabBar({ active, onSelect }: MobileTabBarProps) {
  const { t } = useI18n();

  const tab = (id: Exclude<MobileTab, "scan">, label: string, Icon: typeof House) => (
    <button
      key={id}
      type="button"
      className="mb-tab"
      aria-current={active === id ? "page" : undefined}
      onClick={() => onSelect(id)}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="mb-tabbar" aria-label={t.mob.tabsLabel}>
      {tab("home", t.mob.tabs.home, House)}
      {tab("transfer", t.mob.tabs.transfer, ArrowLeftRight)}
      <div className="mb-tab-wrap">
        <button
          type="button"
          className="mb-tab-scan"
          aria-current={active === "scan" ? "page" : undefined}
          aria-label={t.mob.tabs.scan}
          onClick={() => onSelect("scan")}
        >
          <ScanLine className="h-6 w-6" aria-hidden="true" />
        </button>
        <span
          className="text-[0.68rem] font-medium"
          style={{ color: active === "scan" ? "#ffffff" : "var(--muted)" }}
        >
          {t.mob.tabs.scan}
        </span>
      </div>
      {tab("banks", t.mob.tabs.banks, Landmark)}
      {tab("shield", t.mob.tabs.shield, ShieldCheck)}
    </nav>
  );
}

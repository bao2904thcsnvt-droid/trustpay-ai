"use client";

import { Bot, Wand2, ShoppingCart, Repeat, QrCode } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

export type AgentTab = "transfer" | "qr" | "shopping" | "subscriptions";

export interface AgentSwitcherProps {
  active: AgentTab;
  onChange: (tab: AgentTab) => void;
  flaggedSubscriptions: number;
}

/**
 * Bộ chọn "Trợ lý AI hành động thay bạn": Chuyển tiền, Soi mã VietQR, Safe
 * Shopping, Subscription Guard. Điện thoại: thanh tab cuộn ngang có snap.
 */
export default function AgentSwitcher({ active, onChange, flaggedSubscriptions }: AgentSwitcherProps) {
  const { t } = useI18n();
  const tabs: { id: AgentTab; label: string; Icon: typeof Wand2 }[] = [
    { id: "transfer", label: t.agents.transfer, Icon: Wand2 },
    { id: "qr", label: t.agentsExt.qr, Icon: QrCode },
    { id: "shopping", label: t.agents.shopping, Icon: ShoppingCart },
    { id: "subscriptions", label: t.agents.subscriptions, Icon: Repeat },
  ];

  return (
    <div className="rounded-3xl border border-slate-200/90 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-[#a50064]" />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{t.agents.title}</h2>
          <p className="text-[11px] text-slate-500">{t.agents.subtitle}</p>
        </div>
      </div>
      <div
        role="tablist"
        aria-label={t.agents.title}
        className="tp-scroll-x flex snap-x snap-mandatory gap-1.5 rounded-2xl bg-slate-100 p-1 sm:grid sm:grid-cols-2 xl:grid-cols-4"
      >
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => onChange(id)}
            className={`flex min-w-[62%] shrink-0 cursor-pointer snap-start items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:min-w-0 ${
              active === id
                ? "bg-gradient-to-r from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
            {id === "subscriptions" && flaggedSubscriptions > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                  active === id ? "bg-white text-[#a50064]" : "bg-amber-500 text-white"
                }`}
              >
                {flaggedSubscriptions}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

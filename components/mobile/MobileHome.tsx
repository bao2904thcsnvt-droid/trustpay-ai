"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  ChevronRight,
  Eye,
  EyeOff,
  Landmark,
  MessageSquareWarning,
  ScanLine,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Split,
} from "lucide-react";
import type { BudgetCategory, RiskLevel } from "@/types/trustpay";
import { BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND } from "@/lib/compliance/biometric-policy";
import { useI18n } from "@/components/i18n/I18nProvider";

export type HomeActionId = "transfer" | "withdraw" | "scan" | "banks" | "split" | "bill" | "check" | "ops";

export interface MobileHomeProps {
  balance: number;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  /** Nhãn nguồn tiền mặc định, vd "PVcomBank •••• 4128". */
  sourceLabel: string;
  /** Tổng đã chi hôm nay (giờ Việt Nam); null khi chưa xác định (SSR). */
  dailyOutflow: number | null;
  budgets: BudgetCategory[];
  pendingAlertsCount: number;
  /** Kết luận gần nhất của AI Agent (nếu đã phân tích giao dịch). */
  lastVerdict: { score: number; level: RiskLevel } | null;
  onAction: (action: HomeActionId) => void;
  /** Phần còn lại của Trang chủ: Người giám hộ, Lịch sử giao dịch. */
  children?: ReactNode;
}

const ACTIONS: { id: HomeActionId; color: string; Icon: typeof ArrowUpRight }[] = [
  { id: "transfer", color: "#38BDF8", Icon: ArrowUpRight },
  { id: "withdraw", color: "#10B981", Icon: ArrowDownToLine },
  { id: "scan", color: "var(--mh-ink)", Icon: ScanLine },
  { id: "banks", color: "#818CF8", Icon: Landmark },
  { id: "split", color: "#F59E0B", Icon: Split },
  { id: "bill", color: "#F472B6", Icon: ScanSearch },
  { id: "check", color: "#A78BFA", Icon: MessageSquareWarning },
  { id: "ops", color: "#F43F5E", Icon: Bell },
];

function budgetTone(spent: number, limit: number): string {
  const pct = limit > 0 ? spent / limit : 1;
  if (pct > 1 || pct >= 0.9) return "#F43F5E";
  if (pct >= 0.7) return "#F59E0B";
  return "#10B981";
}

/**
 * Trang chủ kiểu app ngân hàng cho điện thoại: lời chào, thẻ số dư (ẩn/hiện), nguồn tiền mặc định,
 * lũy kế ngày theo TT 50, lưới thao tác nhanh, trạng thái Lá chắn AI và ngân sách tháng.
 */
export default function MobileHome({
  balance,
  balanceHidden,
  onToggleBalance,
  sourceLabel,
  dailyOutflow,
  budgets,
  pendingAlertsCount,
  lastVerdict,
  onAction,
  children,
}: MobileHomeProps) {
  const { t, money, category } = useI18n();
  const daily = dailyOutflow ?? 0;
  const dailyPct = Math.min(100, Math.round((daily / BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND) * 100));
  const alert = pendingAlertsCount > 0;

  return (
    <div className="mh">
      <section className="mh-greet">
        <p className="mh-hello">
          {t.home.hello}, {t.home.name} <span aria-hidden="true">👋</span>
        </p>
        <span className="mh-pill">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t.home.shieldOn}
        </span>
      </section>

      <section className="mh-card" aria-label={t.home.balance}>
        <div className="mh-card-top">
          <span className="mh-card-label">{t.home.balance}</span>
          <button
            type="button"
            className="mh-eye"
            onClick={onToggleBalance}
            aria-pressed={balanceHidden}
            aria-label={balanceHidden ? t.privacy.show : t.privacy.hide}
            title={balanceHidden ? t.privacy.show : t.privacy.hide}
          >
            {balanceHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        </div>
        <p className="mh-balance tp-num" aria-live="polite">
          {balanceHidden ? t.privacy.hidden : money(balance)}
        </p>
        <button type="button" className="mh-source" onClick={() => onAction("banks")}>
          <span className="min-w-0 truncate">{t.home.source(sourceLabel)}</span>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
        <div className="mh-daily">
          <div className="mh-daily-row">
            <span>{t.home.daily}</span>
            <span className="tp-num">
              {money(daily)} / {money(BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND)}
            </span>
          </div>
          <div className="mh-daily-bar" aria-hidden="true">
            <span style={{ width: `${dailyPct}%` }} />
          </div>
        </div>
      </section>

      <section aria-label={t.home.actions}>
        <div className="mh-actions">
          {ACTIONS.map(({ id, color, Icon }) => (
            <button key={id} type="button" className="mh-action" onClick={() => onAction(id)}>
              <span className="mh-action-icon" style={{ "--c": color } as CSSProperties}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {id === "ops" && alert && <span className="mh-action-badge tp-num">{pendingAlertsCount}</span>}
              </span>
              <span className="mh-action-label">{t.home.act[id]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={`mh-panel ${alert ? "mh-panel-alert" : ""}`} aria-label={t.home.aiTitle}>
        <div className="flex items-start gap-3">
          <span className={`mh-panel-icon ${alert ? "is-alert" : ""}`} aria-hidden="true">
            {alert ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="mh-panel-title">{t.home.aiTitle}</h2>
            <p className="mh-panel-text">{alert ? t.home.aiPending(pendingAlertsCount) : t.home.aiSafe}</p>
            {lastVerdict && (
              <p className="mh-panel-meta tp-num">
                {t.home.aiLast(lastVerdict.score, t.common.riskBadge[lastVerdict.level])}
              </p>
            )}
          </div>
        </div>
        {alert && (
          <button type="button" className="mh-panel-cta" onClick={() => onAction("ops")}>
            {t.home.viewOps}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </section>

      <section className="mh-panel" aria-labelledby="mh-budgets-title">
        <h2 id="mh-budgets-title" className="mh-panel-title">
          {t.home.budgets}
        </h2>
        <ul className="mt-3 space-y-3.5">
          {budgets.map((budget) => {
            const remaining = budget.limit - budget.spent;
            const pct = budget.limit > 0 ? Math.min(100, Math.round((budget.spent / budget.limit) * 100)) : 100;
            const tone = budgetTone(budget.spent, budget.limit);
            return (
              <li key={budget.id}>
                <div className="mh-budget-row">
                  <span className="mh-budget-name">{category(budget.name)}</span>
                  <span className="mh-budget-amount tp-num">
                    {money(budget.spent)} / {money(budget.limit)}
                  </span>
                </div>
                <div className="mh-bar" aria-hidden="true">
                  <span style={{ width: `${pct}%`, backgroundColor: tone }} />
                </div>
                <p className="mh-budget-hint tp-num" style={{ color: remaining < 0 ? "#F43F5E" : undefined }}>
                  {remaining >= 0 ? t.home.left(money(remaining)) : t.home.over(money(Math.abs(remaining)))}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {children}
    </div>
  );
}

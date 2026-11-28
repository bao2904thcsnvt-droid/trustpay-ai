"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  ChevronRight,
  Landmark,
  MessageSquareWarning,
  ScanLine,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Split,
} from "lucide-react";
import type { BudgetCategory, RiskLevel } from "@/types/trustpay";
import type { StoredLinkedAccount } from "@/lib/hub/hub-store";
import { useI18n } from "@/components/i18n/I18nProvider";
import RealBankCard from "@/components/banking/RealBankCard";

export type HomeActionId = "transfer" | "withdraw" | "scan" | "banks" | "split" | "bill" | "check" | "ops";

export interface MobileHomeProps {
  balance: number;
  balanceHidden: boolean;
  onToggleBalance: () => void;
  /** Tài khoản ngân hàng thật đã liên kết (Non-Custodial). */
  accounts: StoredLinkedAccount[];
  defaultSourceId: string;
  demoMode?: boolean;
  /** Tên người dùng hiển thị trên lời chào (lấy từ chủ TK ngân hàng thật hoặc "Bạn"). */
  ownerDisplayName?: string;
  /** Tổng đã chi hôm nay (giờ Việt Nam); null khi chưa xác định (SSR). */
  dailyOutflow: number | null;
  budgets: BudgetCategory[];
  pendingAlertsCount: number;
  /** Kết luận gần nhất của AI Agent (nếu đã phân tích giao dịch). */
  lastVerdict: { score: number; level: RiskLevel } | null;
  onAction: (action: HomeActionId) => void;
  onAccountLinked?: (label: string) => void;
  onSourceChanged?: (label: string) => void;
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
  accounts,
  defaultSourceId,
  demoMode = false,
  ownerDisplayName,
  dailyOutflow,
  budgets,
  pendingAlertsCount,
  lastVerdict,
  onAction,
  onAccountLinked,
  onSourceChanged,
  children,
}: MobileHomeProps) {
  const { t, money, category } = useI18n();
  const alert = pendingAlertsCount > 0;
  const totalLimit = budgets.reduce((sum, b) => sum + b.limit, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const greetingName = ownerDisplayName?.trim() || t.home.name;

  return (
    <div className="mh">
      <section className="mh-greet">
        <p className="mh-hello">
          {t.home.hello}, {greetingName} <span aria-hidden="true">👋</span>
        </p>
        <span className="mh-pill">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t.home.shieldOn}
        </span>
      </section>

      <RealBankCard
        accounts={accounts}
        defaultSourceId={defaultSourceId}
        balanceHidden={balanceHidden}
        onToggleBalance={onToggleBalance}
        dailyOutflow={dailyOutflow}
        monthlySpent={totalSpent}
        monthlyLimit={totalLimit}
        demoMode={demoMode}
        demoWalletBalance={balance}
        onStartTransfer={() => onAction("transfer")}
        onAccountLinked={onAccountLinked}
        onSourceChanged={onSourceChanged}
      />

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

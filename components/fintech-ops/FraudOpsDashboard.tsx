"use client";

import { useState } from "react";
import {
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Ban,
  AlertTriangle,
  Sparkles,
  Image as ImageIcon,
  User,
  Banknote,
  FileWarning,
  X,
  Filter,
  EyeOff,
  Network,
} from "lucide-react";
import type { AnomalyClusterState, FintechOpsTicket, RiskLevel } from "@/types/trustpay";
import { useI18n } from "@/components/i18n/I18nProvider";
import AnomalyAlertBanner from "@/components/fintech-ops/AnomalyAlertBanner";
import { isClusterPattern, isValueBlacklisted } from "@/lib/wallet/blacklist-patterns";
import { maskRecipientForDisplay } from "@/lib/security/pii-display";

export interface FraudOpsDashboardProps {
  tickets: FintechOpsTicket[];
  blacklist: string[];
  onBlockTicket: (ticketId: string, recipient: string) => void;
  onApproveTicket: (ticketId: string) => void;
  /** Cảnh báo bất thường toàn cục (banner dưới 3 thẻ KPI). */
  anomalyCluster?: AnomalyClusterState;
  onLockCluster?: () => void;
  /** Ticket từng có ảnh bằng chứng nhưng ảnh đã bị xóa khỏi bộ nhớ bền vững. */
  redactedEvidenceTicketIds?: string[];
  highlightBanner?: boolean;
}

type StatusFilter = "ALL" | "PENDING" | "BLOCKED" | "APPROVED";

const BLACKLIST_PREVIEW = 12;

function getRiskBadge(level: RiskLevel) {
  switch (level) {
    case "HIGH":
      return {
        badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
        scoreClass: "text-rose-600",
        barClass: "bg-gradient-to-r from-rose-500 to-red-600",
      };
    case "MEDIUM":
      return {
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        scoreClass: "text-amber-600",
        barClass: "bg-gradient-to-r from-amber-400 to-orange-500",
      };
    default:
      return {
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        scoreClass: "text-emerald-600",
        barClass: "bg-gradient-to-r from-emerald-400 to-emerald-600",
      };
  }
}

function getStatusTheme(status: FintechOpsTicket["status"]) {
  switch (status) {
    case "PENDING":
      return { className: "border-amber-300 bg-amber-50 text-amber-800", Icon: Clock };
    case "BLOCKED":
      return { className: "border-rose-300 bg-rose-100 text-rose-800", Icon: ShieldBan };
    default:
      return { className: "border-emerald-300 bg-emerald-50 text-emerald-800", Icon: CheckCircle2 };
  }
}

export default function FraudOpsDashboard({
  tickets,
  blacklist,
  onBlockTicket,
  onApproveTicket,
  anomalyCluster,
  onLockCluster,
  redactedEvidenceTicketIds = [],
  highlightBanner = false,
}: FraudOpsDashboardProps) {
  const { t, money, data, dateTime } = useI18n();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showAllBlacklist, setShowAllBlacklist] = useState(false);

  const pendingCount = tickets.filter((ticket) => ticket.status === "PENDING").length;
  const blockedTickets = tickets.filter((ticket) => ticket.status === "BLOCKED");
  const blockedCount = blockedTickets.length;
  const approvedCount = tickets.filter((ticket) => ticket.status === "APPROVED").length;
  const protectedAmount = blockedTickets.reduce((sum, ticket) => sum + ticket.amount, 0);

  const filteredTickets = statusFilter === "ALL" ? tickets : tickets.filter((ticket) => ticket.status === statusFilter);
  const visibleBlacklist = showAllBlacklist ? blacklist : blacklist.slice(0, BLACKLIST_PREVIEW);

  const filterTabs: { id: StatusFilter; label: string }[] = [
    { id: "ALL", label: t.ops.filterAll(tickets.length) },
    { id: "PENDING", label: t.ops.filterPending(pendingCount) },
    { id: "BLOCKED", label: t.ops.filterBlocked(blockedCount) },
    { id: "APPROVED", label: t.ops.filterApproved(approvedCount) },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 1. 3 Thẻ KPI tổng quan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl border border-amber-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-700">{t.ops.kpiPending}</p>
              <p className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-slate-900">{pendingCount}</p>
              <p className="mt-1 text-xs text-slate-500">
                {pendingCount > 0 ? t.ops.kpiPendingActive : t.ops.kpiPendingNone}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-rose-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-rose-700">{t.ops.kpiBlocked}</p>
              <p className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-rose-700">{blockedCount}</p>
              <p className="mt-1 text-xs text-slate-500">{t.ops.kpiBlockedDesc(blacklist.length)}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200/70">
              <ShieldBan className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#a50064] via-[#c21878] to-[#d82d8b] p-5 text-white shadow-md shadow-[#a50064]/20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-pink-100">{t.ops.kpiProtected}</p>
              <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {money(protectedAmount)}
              </p>
              <p className="mt-1 text-xs text-pink-100/90">{t.ops.kpiProtectedDesc}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Banner cảnh báo bất thường toàn cục (ngay dưới 3 thẻ KPI) */}
      {anomalyCluster && onLockCluster && (
        <AnomalyAlertBanner state={anomalyCluster} onLock={onLockCluster} highlighted={highlightBanner} />
      )}

      {/* 3. Blacklist sống đồng bộ 2 chiều */}
      <div className="rounded-3xl border border-rose-200/80 bg-white p-5 shadow-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <ShieldBan className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{t.ops.blacklistTitle}</h2>
              <p className="text-xs text-slate-500">{t.ops.blacklistSubtitle(blacklist.length)}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            <EyeOff className="h-3 w-3" />
            {t.ops.maskedNote}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleBlacklist.map((entry) => {
            const cluster = isClusterPattern(entry);
            return (
              <span
                key={entry}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold ${
                  cluster ? "border-rose-300 bg-rose-100 text-rose-800" : "border-rose-100 bg-rose-50 text-rose-700"
                }`}
              >
                {cluster && <Network className="h-3 w-3" />}
                {maskRecipientForDisplay(entry)}
              </span>
            );
          })}
          {blacklist.length > BLACKLIST_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllBlacklist((prev) => !prev)}
              className="cursor-pointer rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
            >
              {showAllBlacklist ? "−" : `+${blacklist.length - BLACKLIST_PREVIEW}`}
            </button>
          )}
        </div>
      </div>

      {/* 4. Hàng đợi Ticket */}
      <div id="tp-ops-queue" className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{t.ops.queueTitle}</h2>
              <p className="text-xs text-slate-500">{t.ops.queueSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1">
            <span className="hidden items-center gap-1 px-2 text-[11px] font-semibold text-slate-500 md:inline-flex">
              <Filter className="h-3 w-3" />
              {t.ops.filterLabel}
            </span>
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  statusFilter === tab.id ? "bg-white text-[#a50064] shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 py-12 text-center">
            <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">{t.ops.emptyTitle}</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">{t.ops.emptyDesc}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const riskTheme = getRiskBadge(ticket.riskLevel);
              const statusTheme = getStatusTheme(ticket.status);
              const StatusIcon = statusTheme.Icon;
              const alreadyBlacklisted = isValueBlacklisted(blacklist, ticket.recipient);
              const maskedRecipient = maskRecipientForDisplay(data(ticket.recipient));
              const evidenceRedacted =
                !ticket.evidenceImageBase64 && redactedEvidenceTicketIds.includes(ticket.ticketId);

              return (
                <article
                  key={ticket.ticketId}
                  className={`overflow-hidden rounded-2xl border transition-all ${
                    ticket.status === "PENDING"
                      ? "border-amber-200 bg-white shadow-xs hover:border-pink-300"
                      : ticket.status === "BLOCKED"
                        ? "border-rose-200/80 bg-rose-50/25"
                        : "border-emerald-200/80 bg-emerald-50/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                        {ticket.ticketId}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {dateTime(ticket.timestamp)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${riskTheme.badgeClass}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {ticket.riskLevel} • {t.common.riskLabel[ticket.riskLevel]}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusTheme.className}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {t.ops.status[ticket.status]}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-12">
                    <div className="space-y-4 lg:col-span-8">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                            <User className="h-3.5 w-3.5 text-[#a50064]" />
                            {t.ops.recipient}
                          </p>
                          <p className="mt-1 truncate text-sm font-bold text-slate-900" title={maskedRecipient}>
                            {maskedRecipient}
                          </p>
                          {alreadyBlacklisted && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                              <ShieldBan className="h-2.5 w-2.5" />
                              {t.ops.inBlacklist}
                            </span>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                            <Banknote className="h-3.5 w-3.5 text-[#a50064]" />
                            {t.ops.amount}
                          </p>
                          <p className="mt-1 font-mono text-base font-extrabold text-[#a50064]">{money(ticket.amount)}</p>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                            <span>{t.ops.aiScore}</span>
                            <span className={`font-mono text-sm font-extrabold ${riskTheme.scoreClass}`}>
                              {ticket.riskScore}/100
                            </span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${riskTheme.barClass}`}
                              style={{ width: `${Math.min(100, Math.max(4, ticket.riskScore))}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-pink-100 bg-pink-50/40 p-3.5">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-[#a50064]">
                          <Sparkles className="h-3.5 w-3.5" />
                          {t.ops.aiSummary}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {maskRecipientForDisplay(data(ticket.summary))}
                        </p>
                        {ticket.recommendedAction && (
                          <p className="mt-2 border-t border-pink-100 pt-2 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-800">{t.ops.recommended}</span>{" "}
                            {data(ticket.recommendedAction)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col justify-between gap-4 lg:col-span-4">
                      {ticket.evidenceImageBase64 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                            <ImageIcon className="h-3.5 w-3.5 text-[#a50064]" />
                            {t.ops.evidence}
                          </p>
                          <button
                            type="button"
                            onClick={() => setPreviewImage(ticket.evidenceImageBase64 ?? null)}
                            className="group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={ticket.evidenceImageBase64}
                              alt={t.ops.evidenceAlt(ticket.ticketId)}
                              className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <span className="absolute right-2 bottom-2 rounded-md bg-slate-900/75 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                              {t.ops.zoom}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-400">
                          <ImageIcon className="h-4 w-4 shrink-0" />
                          <span>{evidenceRedacted ? t.ops.evidenceRedacted : t.ops.noEvidence}</span>
                        </div>
                      )}

                      {ticket.status === "PENDING" ? (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => onBlockTicket(ticket.ticketId, ticket.recipient)}
                            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-rose-600/20 transition-all hover:brightness-110 active:scale-[0.99]"
                          >
                            <Ban className="h-4 w-4 shrink-0" />
                            <span>{t.ops.block}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onApproveTicket(ticket.ticketId)}
                            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-[0.99]"
                          >
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{t.ops.approve}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-center text-xs font-medium text-slate-500">
                          {ticket.status === "BLOCKED" ? t.ops.blockedNote : t.ops.approvedNote}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85vh] max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-white p-3 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              aria-label={t.ops.closePreview}
              className="absolute top-5 right-5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-900/75 text-white hover:bg-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt={t.ops.previewAlt}
              className="max-h-[78vh] w-auto rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

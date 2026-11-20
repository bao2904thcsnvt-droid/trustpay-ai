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
} from "lucide-react";
import type { FintechOpsTicket, RiskLevel } from "@/types/trustpay";

export interface FraudOpsDashboardProps {
  tickets: FintechOpsTicket[];
  blacklist: string[];
  onBlockTicket: (ticketId: string, recipient: string) => void;
  onApproveTicket: (ticketId: string) => void;
}

type StatusFilter = "ALL" | "PENDING" | "BLOCKED" | "APPROVED";

function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + "đ";
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getRiskBadge(level: RiskLevel) {
  switch (level) {
    case "HIGH":
      return {
        label: "Rủi ro cao",
        badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
        scoreClass: "text-rose-600",
        barClass: "bg-gradient-to-r from-rose-500 to-red-600",
      };
    case "MEDIUM":
      return {
        label: "Rủi ro trung bình",
        badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
        scoreClass: "text-amber-600",
        barClass: "bg-gradient-to-r from-amber-400 to-orange-500",
      };
    default:
      return {
        label: "Rủi ro thấp",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        scoreClass: "text-emerald-600",
        barClass: "bg-gradient-to-r from-emerald-400 to-emerald-600",
      };
  }
}

function getStatusBadge(status: FintechOpsTicket["status"]) {
  switch (status) {
    case "PENDING":
      return {
        label: "Chờ xử lý",
        className: "border-amber-300 bg-amber-50 text-amber-800",
        Icon: Clock,
      };
    case "BLOCKED":
      return {
        label: "Đã chặn & Blacklist",
        className: "border-rose-300 bg-rose-100 text-rose-800",
        Icon: ShieldBan,
      };
    case "APPROVED":
      return {
        label: "Đã phê duyệt an toàn",
        className: "border-emerald-300 bg-emerald-50 text-emerald-800",
        Icon: CheckCircle2,
      };
  }
}

export default function FraudOpsDashboard({
  tickets,
  blacklist,
  onBlockTicket,
  onApproveTicket,
}: FraudOpsDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const pendingCount = tickets.filter((t) => t.status === "PENDING").length;
  const blockedTickets = tickets.filter((t) => t.status === "BLOCKED");
  const blockedCount = blockedTickets.length;
  const protectedAmount = blockedTickets.reduce((sum, t) => sum + t.amount, 0);

  const filteredTickets =
    statusFilter === "ALL"
      ? tickets
      : tickets.filter((t) => t.status === statusFilter);

  const isRecipientBlacklisted = (recipient: string) => {
    const normalized = recipient.trim().toLowerCase();
    return blacklist.some((item) => item.trim().toLowerCase() === normalized);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. 3 Thẻ KPI Tổng Quan */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* KPI 1: Cảnh báo chờ xử lý */}
        <div className="relative overflow-hidden rounded-3xl border border-amber-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-700">
                Cảnh báo chờ xử lý (PENDING)
              </p>
              <p className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-slate-900">
                {pendingCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {pendingCount > 0
                  ? "Cần chuyên viên rủi ro rà soát ngay"
                  : "Tất cả cảnh báo đã được xử lý"}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* KPI 2: Giao dịch đã chặn */}
        <div className="relative overflow-hidden rounded-3xl border border-rose-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-rose-700">
                Giao dịch đã chặn (BLOCKED)
              </p>
              <p className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-rose-700">
                {blockedCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Blacklist hệ thống hiện có{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {blacklist.length}
                </span>{" "}
                đối tượng
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200/70">
              <ShieldBan className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* KPI 3: Tổng số tiền rủi ro đã bảo vệ được */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#a50064] via-[#c21878] to-[#d82d8b] p-5 text-white shadow-md shadow-[#a50064]/20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/10 blur-2xl"
          />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-pink-100">
                Tổng tiền rủi ro đã bảo vệ
              </p>
              <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {formatVND(protectedAmount)}
              </p>
              <p className="mt-1 text-xs text-pink-100/90">
                Ngăn chặn thất thoát theo thời gian thực
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Thanh tiêu đề & Bộ lọc danh sách Ticket */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-50 text-[#a50064]">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Hàng đợi Cảnh báo Rủi ro (Fintech Ops Tickets)
              </h2>
              <p className="text-xs text-slate-500">
                Đồng bộ 2 chiều theo thời gian thực với Ví Người Dùng &amp;
                Danh sách đen (Blacklist)
              </p>
            </div>
          </div>

          {/* Bộ lọc trạng thái */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1">
            <span className="hidden items-center gap-1 px-2 text-[11px] font-semibold text-slate-500 md:inline-flex">
              <Filter className="h-3 w-3" />
              Lọc:
            </span>
            {(
              [
                { id: "ALL", label: `Tất cả (${tickets.length})` },
                { id: "PENDING", label: `Chờ xử lý (${pendingCount})` },
                { id: "BLOCKED", label: `Đã chặn (${blockedCount})` },
                {
                  id: "APPROVED",
                  label: `Đã duyệt (${
                    tickets.filter((t) => t.status === "APPROVED").length
                  })`,
                },
              ] as { id: StatusFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? "bg-white text-[#a50064] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Danh sách FintechOpsTicket */}
        {filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 py-12 text-center">
            <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              Không có ticket nào trong mục này
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Khi người dùng thực hiện giao dịch rủi ro Trung bình hoặc Cao ở
              Tab 1, cảnh báo sẽ tự động đổ về đây ngay lập tức.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTickets.map((ticket) => {
              const riskTheme = getRiskBadge(ticket.riskLevel);
              const statusBadge = getStatusBadge(ticket.status);
              const StatusIcon = statusBadge.Icon;
              const alreadyBlacklisted = isRecipientBlacklisted(
                ticket.recipient
              );

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
                  {/* Header Ticket */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                        {ticket.ticketId}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {formatTimestamp(ticket.timestamp)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${riskTheme.badgeClass}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {ticket.riskLevel} • {riskTheme.label}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusBadge.className}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Nội dung Ticket */}
                  <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-12">
                    {/* Cột thông tin chính */}
                    <div className="space-y-4 lg:col-span-8">
                      {/* Người nhận / Số tiền / Điểm rủi ro */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                            <User className="h-3.5 w-3.5 text-[#a50064]" />
                            Người nhận / STK
                          </p>
                          <p
                            className="mt-1 truncate text-sm font-bold text-slate-900"
                            title={ticket.recipient}
                          >
                            {ticket.recipient}
                          </p>
                          {alreadyBlacklisted && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                              <ShieldBan className="h-2.5 w-2.5" />
                              Đã nằm trong Blacklist
                            </span>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                            <Banknote className="h-3.5 w-3.5 text-[#a50064]" />
                            Số tiền giao dịch
                          </p>
                          <p className="mt-1 font-mono text-base font-extrabold text-[#a50064]">
                            {formatVND(ticket.amount)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                            <span>Điểm rủi ro AI</span>
                            <span
                              className={`font-mono text-sm font-extrabold ${riskTheme.scoreClass}`}
                            >
                              {ticket.riskScore}/100
                            </span>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${riskTheme.barClass}`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(4, ticket.riskScore)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Tóm tắt AI & Khuyến nghị */}
                      <div className="rounded-xl border border-pink-100 bg-pink-50/40 p-3.5">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-[#a50064]">
                          <Sparkles className="h-3.5 w-3.5" />
                          Tóm tắt phân tích từ Lá chắn AI
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {ticket.summary}
                        </p>
                        {ticket.recommendedAction && (
                          <p className="mt-2 border-t border-pink-100 pt-2 text-[11px] text-slate-600">
                            <span className="font-semibold text-slate-800">
                              Khuyến nghị xử lý:
                            </span>{" "}
                            {ticket.recommendedAction}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Cột ảnh bằng chứng & Hành động Ops */}
                    <div className="flex flex-col justify-between gap-4 lg:col-span-4">
                      {/* Ảnh bằng chứng (nếu có) */}
                      {ticket.evidenceImageBase64 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                            <ImageIcon className="h-3.5 w-3.5 text-[#a50064]" />
                            Ảnh bằng chứng đính kèm
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage(
                                ticket.evidenceImageBase64 ?? null
                              )
                            }
                            className="group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={ticket.evidenceImageBase64}
                              alt={`Bằng chứng ticket ${ticket.ticketId}`}
                              className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <span className="absolute right-2 bottom-2 rounded-md bg-slate-900/75 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
                              Phóng to
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-400">
                          <ImageIcon className="h-4 w-4 shrink-0" />
                          <span>Không có ảnh bằng chứng đính kèm</span>
                        </div>
                      )}

                      {/* 2 Nút hành động cho chuyên viên vận hành (chỉ hiện khi PENDING) */}
                      {ticket.status === "PENDING" ? (
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onBlockTicket(ticket.ticketId, ticket.recipient)
                            }
                            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-rose-600/20 transition-all hover:brightness-110 active:scale-[0.99]"
                          >
                            <Ban className="h-4 w-4 shrink-0" />
                            <span>Chặn &amp; Thêm vào Blacklist</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onApproveTicket(ticket.ticketId)}
                            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-[0.99]"
                          >
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>Phê duyệt an toàn</span>
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-center text-xs font-medium text-slate-500">
                          {ticket.status === "BLOCKED"
                            ? "Đã khóa đối tượng và cập nhật Blacklist thời gian thực."
                            : "Chuyên viên đã xác nhận giao dịch an toàn."}
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

      {/* Modal phóng to ảnh bằng chứng */}
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
              aria-label="Đóng ảnh xem trước"
              className="absolute top-5 right-5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-900/75 text-white hover:bg-slate-900"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Ảnh bằng chứng phóng to"
              className="max-h-[78vh] w-auto rounded-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

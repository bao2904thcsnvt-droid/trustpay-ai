import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  normalizeBankWebhookPayload,
  normalizeSyncAccountNumber,
  readBankSyncRecord,
  recordBankSyncEvents,
  type BankSyncEvent,
  type BankSyncGetResponse,
} from "@/lib/banking/bank-sync";
import { findVietnamBankByGateway } from "@/lib/vietnam-banks";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const MAX_BODY_BYTES = 64 * 1024;
const SEPAY_FETCH_TIMEOUT_MS = 8_000;

interface SepayAccountPullResult {
  ok: true;
  accountNumber: string;
  bankCode: string;
  newBalance: number;
  holderName: string;
  lastTransaction: string | null;
}

function parseBalanceNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "string" && raw.trim() !== "") {
    const num = Number(raw.replace(/,/g, "").trim());
    if (Number.isFinite(num)) return Math.round(num);
  }
  return null;
}

/**
 * Kéo số dư thật trực tiếp từ SePay User API (không cần đợi giao dịch mới & không phụ thuộc RAM serverless).
 * Thử API v1 (`my.sepay.vn/userapi/bankaccounts/list`), tự lùi sang v2 (`userapi.sepay.vn/v2/bank-accounts`).
 */
async function pullBalanceFromSepayApi(
  accountNumber: string,
  apiToken: string,
): Promise<SepayAccountPullResult | { ok: false; error: string }> {
  const endpoints = [
    "https://my.sepay.vn/userapi/bankaccounts/list",
    "https://userapi.sepay.vn/v2/bank-accounts",
  ];
  let lastError = "Không kết nối được SePay API.";

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEPAY_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "SePay API Token không hợp lệ hoặc đã hết hạn (HTTP 401/403)." };
      }
      if (!res.ok) {
        lastError = `SePay API trả HTTP ${res.status}.`;
        continue;
      }
      const json = (await res.json()) as Record<string, unknown>;
      const rows = Array.isArray(json.bankaccounts)
        ? json.bankaccounts
        : Array.isArray(json.data)
          ? json.data
          : [];

      const target = rows.find((item) => {
        if (typeof item !== "object" || item === null) return false;
        const rec = item as Record<string, unknown>;
        return normalizeSyncAccountNumber(rec.account_number ?? rec.accountNumber) === accountNumber;
      }) as Record<string, unknown> | undefined;

      if (!target) {
        return {
          ok: false,
          error: `Không tìm thấy STK ${accountNumber} trong danh sách tài khoản đã liên kết trên SePay.`,
        };
      }

      const bal = parseBalanceNumber(target.accumulated ?? target.balance);
      if (bal === null) {
        return { ok: false, error: "SePay chưa trả trường số dư (accumulated) cho tài khoản này." };
      }

      const bankHint = String(
        target.bank_code ?? target.bank_bin ?? target.bank_short_name ?? target.short_name ?? target.bank_full_name ?? "",
      );
      const bankCode = findVietnamBankByGateway(bankHint)?.code ?? (bankHint.toUpperCase().slice(0, 12) || "BANK");

      return {
        ok: true,
        accountNumber,
        bankCode,
        newBalance: Math.max(0, bal),
        holderName: typeof target.account_holder_name === "string" ? target.account_holder_name : "",
        lastTransaction: typeof target.last_transaction === "string" ? target.last_transaction : null,
      };
    } catch {
      lastError = "Hết thời gian kết nối tới SePay API.";
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: lastError };
}

function constantTimeMatch(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Xác thực Webhook bảo mật khi `.env.local` cấu hình `WEBHOOK_SECRET_KEY`:
 *  - SePay: `Authorization: Apikey <WEBHOOK_SECRET_KEY>`
 *  - Casso: `secure-token: <WEBHOOK_SECRET_KEY>`
 * Nếu chưa đặt `WEBHOOK_SECRET_KEY`, route hoạt động ở chế độ mở để dễ chạy thử / Test Ping.
 */
function isWebhookAuthorized(request: Request): boolean {
  const expected = process.env.WEBHOOK_SECRET_KEY?.trim();
  if (!expected) return true;

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (authHeader) {
    const match = authHeader.match(/^(?:apikey|bearer)\s+(.+)$/i);
    const token = match ? match[1].trim() : authHeader;
    if (constantTimeMatch(token, expected)) return true;
  }

  const secureToken = request.headers.get("secure-token")?.trim() ?? "";
  if (secureToken && constantTimeMatch(secureToken, expected)) {
    return true;
  }

  return false;
}

/**
 * POST /api/bank/sync — Nhận Webhook biến động số dư thời gian thực từ SePay hoặc Casso.
 */
export async function POST(request: Request) {
  if (!isWebhookAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "Sai hoặc thiếu mã bảo mật Webhook (Authorization / secure-token)." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let rawText = "";
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_BODY", message: "Không đọc được nội dung Webhook." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "BODY_TOO_LARGE", message: "Payload Webhook vượt quá giới hạn 64KB." },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON", message: "Payload không phải JSON hợp lệ." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const nowIso = new Date().toISOString();
  const isDryRun =
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).dryRun === true;

  const events = normalizeBankWebhookPayload(payload, nowIso);
  if (events.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_PAYLOAD",
        message: "Payload không khớp định dạng Webhook của SePay hoặc Casso (thiếu accountNumber / số tiền).",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // Test Ping (dryRun: true): xác nhận đường truyền + phân tích payload OK nhưng KHÔNG ghi đè số dư thật.
  if (isDryRun) {
    const sample = events[0];
    return NextResponse.json(
      {
        ok: true,
        success: true,
        dryRun: true,
        processed: events.length,
        accountNumber: sample.accountNumber,
        bankCode: sample.bankCode,
        newBalance: null,
        latestEvent: sample,
        updatedAt: nowIso,
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  const updatedRecords = recordBankSyncEvents(events, nowIso);
  const primary = updatedRecords[0] ?? null;

  return NextResponse.json(
    {
      ok: true,
      success: true,
      processed: events.length,
      accountNumber: primary?.accountNumber ?? null,
      bankCode: primary?.bankCode ?? null,
      newBalance: primary?.newBalance ?? null,
      latestEvent: primary?.latestEvent ?? null,
      updatedAt: nowIso,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}

/**
 * GET /api/bank/sync?accountNumber=... — Client poll định kỳ để lấy số dư thật mới nhất.
 * Nếu có `x-sepay-api-token` (hoặc `SEPAY_API_TOKEN` trên máy chủ), kéo thẳng số dư thật từ SePay API.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountNumber = normalizeSyncAccountNumber(url.searchParams.get("accountNumber"));

  if (!accountNumber) {
    const empty: BankSyncGetResponse = {
      ok: true,
      accountNumber: "",
      synced: false,
      bankCode: null,
      newBalance: null,
      latestEvent: null,
      events: [],
      updatedAt: null,
    };
    return NextResponse.json(empty, { status: 200, headers: NO_STORE_HEADERS });
  }

  const sepayToken =
    request.headers.get("x-sepay-api-token")?.trim() || process.env.SEPAY_API_TOKEN?.trim() || "";
  const forcePull = url.searchParams.get("pull") === "sepay";

  if (sepayToken) {
    const pulled = await pullBalanceFromSepayApi(accountNumber, sepayToken);
    if (pulled.ok) {
      const nowIso = new Date().toISOString();
      const existing = readBankSyncRecord(accountNumber);
      const liveEvent: BankSyncEvent = existing?.latestEvent ?? {
        provider: "sepay",
        bankCode: pulled.bankCode,
        accountNumber: pulled.accountNumber,
        deltaAmount: 0,
        newBalance: pulled.newBalance,
        description: "Đồng bộ số dư thật trực tiếp từ SePay API",
        timestamp: nowIso,
        txId: `SEPAY-API-${Date.now()}`,
      };
      const response: BankSyncGetResponse = {
        ok: true,
        accountNumber: pulled.accountNumber,
        synced: true,
        bankCode: pulled.bankCode,
        newBalance: pulled.newBalance,
        latestEvent: liveEvent,
        events: existing?.events ?? [],
        updatedAt: nowIso,
      };
      return NextResponse.json(response, { status: 200, headers: NO_STORE_HEADERS });
    }
    if (forcePull) {
      return NextResponse.json(
        { ok: false, error: "SEPAY_API_ERROR", message: pulled.error },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
  }

  const record = readBankSyncRecord(accountNumber);
  const response: BankSyncGetResponse = record
    ? {
        ok: true,
        accountNumber: record.accountNumber,
        synced: true,
        bankCode: record.bankCode,
        newBalance: record.newBalance,
        latestEvent: record.latestEvent,
        events: record.events,
        updatedAt: record.updatedAt,
      }
    : {
        ok: true,
        accountNumber,
        synced: false,
        bankCode: null,
        newBalance: null,
        latestEvent: null,
        events: [],
        updatedAt: null,
      };

  return NextResponse.json(response, { status: 200, headers: NO_STORE_HEADERS });
}

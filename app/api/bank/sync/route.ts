import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  normalizeBankWebhookPayload,
  normalizeSyncAccountNumber,
  readBankSyncRecord,
  recordBankSyncEvents,
  type BankSyncGetResponse,
} from "@/lib/banking/bank-sync";

const NO_STORE_HEADERS = { "cache-control": "no-store" };
const MAX_BODY_BYTES = 64 * 1024;

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

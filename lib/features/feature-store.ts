import { useSyncExternalStore } from "react";
import { createPersistentStore } from "@/lib/store/persistent-store";
import { EMV_MAX_PAYLOAD_LENGTH } from "@/lib/qr/emvco";

/**
 * Trạng thái demo của các tính năng vòng 2 (Active Call Shield, VietQR
 * Inspector, AI Payment Copilot), lưu bền vững trong localStorage và được xóa
 * cùng nút "Reset Demo". Dữ liệu đọc lại luôn đi qua `sanitize`.
 */

export const FEATURE_STORAGE_KEY = "trustpay-ai.features.v1";

export const MAX_COPILOT_LOG = 8;
const MAX_COPILOT_TEXT = 400;

export interface CallShieldState {
  active: boolean;
  /** ISO — thời điểm bắt máy, dùng để phát lại phụ đề Transcribe theo thời gian. */
  startedAt: string | null;
}

export type CopilotRole = "user" | "copilot";

export interface CopilotLogEntry {
  id: string;
  role: CopilotRole;
  text: string;
  /** ISO */
  at: string;
}

export interface FeatureState {
  schemaVersion: 1;
  callShield: CallShieldState;
  /** Chuỗi QR soi gần nhất (chỉ phục vụ khôi phục màn hình sau khi tải lại). */
  lastQrPayload: string | null;
  copilotLog: CopilotLogEntry[];
}

function createDefaultFeatureState(): FeatureState {
  return {
    schemaVersion: 1,
    callShield: { active: false, startedAt: null },
    lastQrPayload: null,
    copilotLog: [],
  };
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/** Che các dãy số dài (STK/CCCD/SĐT) trước khi lưu nhật ký Copilot. */
export function maskLongDigitRuns(text: string): string {
  return text.replace(/\d{9,}/g, (run) => `${run.slice(0, 2)}${"*".repeat(run.length - 5)}${run.slice(-3)}`);
}

function sanitizeFeatureState(raw: unknown): FeatureState {
  const defaults = createDefaultFeatureState();
  if (typeof raw !== "object" || raw === null) {
    return defaults;
  }
  const record = raw as Record<string, unknown>;

  const callRaw = (typeof record.callShield === "object" && record.callShield !== null
    ? record.callShield
    : {}) as Record<string, unknown>;
  const startedAt = isIsoDate(callRaw.startedAt) ? callRaw.startedAt : null;
  const callShield: CallShieldState = {
    active: callRaw.active === true && startedAt !== null,
    startedAt: callRaw.active === true ? startedAt : null,
  };

  const lastQrPayload =
    typeof record.lastQrPayload === "string" &&
    record.lastQrPayload.length > 0 &&
    record.lastQrPayload.length <= EMV_MAX_PAYLOAD_LENGTH
      ? record.lastQrPayload
      : null;

  const copilotLog: CopilotLogEntry[] = Array.isArray(record.copilotLog)
    ? record.copilotLog
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
        .filter(
          (entry) =>
            typeof entry.id === "string" &&
            (entry.role === "user" || entry.role === "copilot") &&
            typeof entry.text === "string" &&
            isIsoDate(entry.at),
        )
        .slice(-MAX_COPILOT_LOG)
        .map((entry) => ({
          id: String(entry.id).slice(0, 64),
          role: entry.role as CopilotRole,
          text: maskLongDigitRuns(String(entry.text).slice(0, MAX_COPILOT_TEXT)),
          at: String(entry.at),
        }))
    : [];

  return { schemaVersion: 1, callShield, lastQrPayload, copilotLog };
}

export const featureStore = createPersistentStore<FeatureState>({
  storageKey: FEATURE_STORAGE_KEY,
  createDefault: createDefaultFeatureState,
  sanitize: sanitizeFeatureState,
});

export function useFeatureState(): FeatureState {
  return useSyncExternalStore(featureStore.subscribe, featureStore.getSnapshot, featureStore.getServerSnapshot);
}

export function startCallShield(startedAtIso: string): void {
  featureStore.setState((prev) =>
    prev.callShield.active ? prev : { ...prev, callShield: { active: true, startedAt: startedAtIso } },
  );
}

export function endCallShield(): void {
  featureStore.setState((prev) =>
    prev.callShield.active ? { ...prev, callShield: { active: false, startedAt: null } } : prev,
  );
}

export function setLastQrPayload(payload: string | null): void {
  const next = payload && payload.length <= EMV_MAX_PAYLOAD_LENGTH ? payload : null;
  featureStore.setState((prev) => (prev.lastQrPayload === next ? prev : { ...prev, lastQrPayload: next }));
}

export function appendCopilotEntries(entries: CopilotLogEntry[]): void {
  if (entries.length === 0) return;
  featureStore.setState((prev) => ({
    ...prev,
    copilotLog: [
      ...prev.copilotLog,
      ...entries.map((entry) => ({ ...entry, text: maskLongDigitRuns(entry.text.slice(0, MAX_COPILOT_TEXT)) })),
    ].slice(-MAX_COPILOT_LOG),
  }));
}

export function clearCopilotLog(): void {
  featureStore.setState((prev) => (prev.copilotLog.length === 0 ? prev : { ...prev, copilotLog: [] }));
}

import { maskAccountNumber, maskCccd, maskPhone } from "@/lib/security/pii-masking";

/**
 * Che dữ liệu cá nhân TRƯỚC KHI ghép vào prompt gửi Amazon Bedrock
 * (Nghị định 13/2023/NĐ-CP — dữ liệu rời biên tin cậy). Chỉ dùng phía máy chủ.
 *
 *  - 12 chữ số → CCCD (`maskCccd`)
 *  - 10 chữ số bắt đầu bằng 0 → số điện thoại (`maskPhone`)
 *  - 6–19 chữ số còn lại → số tài khoản (`maskAccountNumber`)
 *  - Dãy số đứng ngay trước đơn vị tiền (đ, VNĐ, k, nghìn, triệu…) là SỐ TIỀN → giữ nguyên.
 *
 * Bộ luật phía máy chủ vẫn chạy trên dữ liệu gốc (trong RAM), nên quyết định
 * Blacklist/sinh trắc học không bị ảnh hưởng; AI chỉ thấy bản đã che.
 */

export type PiiKind = "CCCD" | "PHONE" | "ACCOUNT";

export interface PiiFinding {
  kind: PiiKind;
  masked: string;
}

export interface RedactionResult {
  text: string;
  findings: PiiFinding[];
}

const AMOUNT_UNIT_AFTER = /^\s*(?:đ|₫|vnđ|vnd|dong|đồng|k\b|nghìn|ngàn|triệu|tr\b|củ)/i;

export function redactForPrompt(input: string | null | undefined): RedactionResult {
  const text = input ?? "";
  if (!text) {
    return { text: "", findings: [] };
  }
  const findings: PiiFinding[] = [];
  const redacted = text.replace(/\d{6,}/g, (run: string, offset: number) => {
    const after = text.slice(offset + run.length, offset + run.length + 8);
    if (AMOUNT_UNIT_AFTER.test(after)) {
      return run;
    }
    let kind: PiiKind;
    let masked: string;
    if (run.length === 12) {
      kind = "CCCD";
      masked = maskCccd(run);
    } else if (run.length === 10 && run.startsWith("0")) {
      kind = "PHONE";
      masked = maskPhone(run);
    } else if (run.length <= 19) {
      kind = "ACCOUNT";
      masked = maskAccountNumber(run);
    } else {
      kind = "ACCOUNT";
      masked = "*".repeat(run.length);
    }
    findings.push({ kind, masked });
    return masked;
  });
  return { text: redacted, findings };
}

/** Khóa giữ nguyên (định danh kỹ thuật, không phải PII) và khóa bị loại khỏi prompt. */
const PRESERVED_KEYS = new Set(["ticketId", "timestamp", "category", "riskLevel", "status", "id", "name"]);
const DROPPED_KEYS = new Set(["evidenceImageBase64", "imageBase64", "selfieBase64"]);

/** Che PII trong mọi chuỗi của một cấu trúc JSON (số giữ nguyên, ảnh base64 bị loại). */
export function redactJsonForPrompt(value: unknown, key?: string): unknown {
  if (key !== undefined && DROPPED_KEYS.has(key)) {
    return undefined;
  }
  if (typeof value === "string") {
    return key !== undefined && PRESERVED_KEYS.has(key) ? value : redactForPrompt(value).text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonForPrompt(item, key));
  }
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const next = redactJsonForPrompt(childValue, childKey);
      if (next !== undefined) {
        output[childKey] = next;
      }
    }
    return output;
  }
  return value;
}

/** Chọn định danh: giá trị AI chỉ được dùng khi không chứa ký tự che (`*`). */
export function pickUnmaskedIdentity(aiValue: unknown, baseline: string): string {
  return typeof aiValue === "string" && aiValue.trim().length > 0 && !aiValue.includes("*") ? aiValue : baseline;
}

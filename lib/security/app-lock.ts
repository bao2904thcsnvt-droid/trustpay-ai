import { useSyncExternalStore } from "react";

/**
 * Khóa ứng dụng bằng sinh trắc học THIẾT BỊ (WebAuthn passkey nền tảng: Vân tay /
 * FaceID / Windows Hello) + phiên mở khóa trong bộ nhớ.
 *
 *  - Phiên mở khóa KHÔNG lưu xuống localStorage: tải lại trang là khóa lại.
 *  - Bản demo coi việc `navigator.credentials.get` thành công (userVerification =
 *    "required") là đã xác thực. Production: gửi `authenticatorData` + chữ ký về máy
 *    chủ để kiểm tra bằng khóa công khai đã đăng ký và challenge một lần.
 */

/** Mở khóa còn hiệu lực trong 2 phút cho thao tác tạo mã VietQR chuyển / thu tiền. */
export const QR_UNLOCK_WINDOW_MS = 120_000;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 30_000;

// ---------------------------------------------------------------- phiên mở khóa

let unlockedAt: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export const appLockSession = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): number | null {
    return unlockedAt;
  },
  getServerSnapshot(): number | null {
    return null;
  },
  markUnlocked(atMs: number): void {
    unlockedAt = atMs;
    emit();
  },
  lock(): void {
    unlockedAt = null;
    emit();
  },
};

export function useUnlockedAt(): number | null {
  return useSyncExternalStore(appLockSession.subscribe, appLockSession.getSnapshot, appLockSession.getServerSnapshot);
}

export function isUnlockFresh(unlockedAtMs: number | null, nowMs: number, windowMs = QR_UNLOCK_WINDOW_MS): boolean {
  return unlockedAtMs !== null && nowMs >= unlockedAtMs && nowMs - unlockedAtMs < windowMs;
}

// ------------------------------------------------------------------- base64url

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Muối ngẫu nhiên (base64url) khi người dùng đổi PIN. */
export function createPinSalt(): string {
  return toBase64Url(randomBytes(12));
}

// ---------------------------------------------------------------------- WebAuthn

export type PasskeyFailure = "UNSUPPORTED" | "INSECURE" | "CANCELLED" | "ERROR";

export type PasskeyResult = { ok: true; credentialId: string } | { ok: false; reason: PasskeyFailure };

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** Thiết bị có Vân tay / FaceID / Windows Hello dùng được cho WebAuthn hay không. */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported() || !window.isSecureContext) {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function failureFrom(error: unknown): PasskeyFailure {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) {
    return "CANCELLED";
  }
  return "ERROR";
}

/** Đăng ký passkey nền tảng (Vân tay / FaceID) cho thiết bị này. */
export async function registerDevicePasskey(displayName: string): Promise<PasskeyResult> {
  if (!isWebAuthnSupported()) return { ok: false, reason: "UNSUPPORTED" };
  if (!window.isSecureContext) return { ok: false, reason: "INSECURE" };
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: "TrustPay AI" },
        user: { id: randomBytes(16), name: "trustpay-demo-user", displayName },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
      },
    });
    if (!credential || !(credential instanceof PublicKeyCredential)) {
      return { ok: false, reason: "ERROR" };
    }
    return { ok: true, credentialId: toBase64Url(new Uint8Array(credential.rawId)) };
  } catch (error) {
    return { ok: false, reason: failureFrom(error) };
  }
}

/** Yêu cầu xác thực sinh trắc học thiết bị bằng passkey đã đăng ký. */
export async function verifyDevicePasskey(credentialId: string): Promise<PasskeyResult> {
  if (!isWebAuthnSupported()) return { ok: false, reason: "UNSUPPORTED" };
  if (!window.isSecureContext) return { ok: false, reason: "INSECURE" };
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: fromBase64Url(credentialId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    if (!assertion || !(assertion instanceof PublicKeyCredential)) {
      return { ok: false, reason: "ERROR" };
    }
    return { ok: true, credentialId: toBase64Url(new Uint8Array(assertion.rawId)) };
  } catch (error) {
    return { ok: false, reason: failureFrom(error) };
  }
}

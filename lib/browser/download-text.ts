/**
 * Tải một tệp văn bản UTF-8 (kèm BOM để Notepad/Excel hiển thị đúng tiếng Việt).
 * Chỉ gọi trong event handler phía trình duyệt.
 */
export function downloadTextFile(filename: string, content: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }
  const blob = new Blob([`\uFEFF${content}`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Băm SHA-256 (hex) bằng Web Crypto; trả null nếu môi trường không hỗ trợ. */
export async function sha256Hex(text: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      return null;
    }
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

"use client";

import { useEffect } from "react";

/**
 * Đăng ký Service Worker `/sw.js` (chỉ ở bản build Production để không cản trở
 * Hot Reload khi phát triển). SW chỉ phục vụ bản lưu khi MẤT MẠNG (network-first),
 * không bao giờ lưu dữ liệu `/api/*`.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Không đăng ký được (trình duyệt chặn) → ứng dụng vẫn chạy bình thường.
    });
  }, []);

  return null;
}

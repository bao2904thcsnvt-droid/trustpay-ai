import { isEmbedRequested } from "@/lib/sdk/host-bridge";

/**
 * Vòng 6 — Single-Viewport Full-Bleed Video & Dot-Matrix.
 *
 * Nền video toàn màn hình: dùng ĐÚNG đường dẫn từ xa (không tải về máy chủ của ứng dụng).
 * Thẻ <video> chỉ được gắn sau khi trang đã hydrate (xem `components/cinematic/CinematicBackdrop.tsx`).
 */
export const CINEMATIC_VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4";

export const CINEMATIC_VIDEO_ORIGIN = "https://d8j0ntlcm91z4.cloudfront.net";

/** CDN font & icon của hệ thiết kế (nạp bằng <link> trong app/layout.tsx). */
export const FONT_INTER_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
export const FONT_BUBBLEDOT_URL =
  "https://db.onlinewebfonts.com/c/8cb707a9b8a73f8a7403336b861c3074?family=BubbledotICG-FinePos";
export const FONT_AWESOME_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";

/** Đích điều hướng từ màn hình Hero vào Không gian làm việc. */
export type HeroTarget = "home" | "wallet" | "scan" | "shield" | "app" | "start";

/** Lối tắt PWA (`manifest.json` → `shortcuts`) mở thẳng tính năng, không qua Hero. */
const DIRECT_ACTIONS: ReadonlySet<string> = new Set(["scan", "split", "transfer"]);

/**
 * Bỏ qua Hero khi: iframe nhúng SDK (`?embed=momo`) hoặc lối tắt PWA (`?action=…`).
 * (Chế độ PWA `standalone` được kiểm tra riêng, xem `HERO_BOOT_SCRIPT` và TrustPayApp.)
 * Phải cùng kết quả với `HERO_BOOT_SCRIPT` bên dưới.
 */
export function shouldSkipHero(search: string): boolean {
  if (isEmbedRequested(search)) {
    return true;
  }
  const action = new URLSearchParams(search).get("action");
  return action !== null && DIRECT_ACTIONS.has(action);
}

/** Ứng dụng đang chạy như app đã cài (PWA standalone) → vào thẳng Không gian Ứng dụng. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

/**
 * Script nội tuyến trong <head> (chạy trước lần vẽ đầu): khóa cuộn trang khi Hero hiện
 * (`tp-hero-open`), hoặc ẩn Hero ngay từ HTML máy chủ khi cần bỏ qua (`tp-skip-hero`) —
 * tránh nháy Hero trong iframe SDK / PWA mà không gây lệch hydrate (React vẫn render cùng cây).
 */
export const HERO_BOOT_SCRIPT = `(function(){try{var p=new URLSearchParams(location.search),d=document.documentElement,e=(p.get("embed")||"").trim().toLowerCase(),a=p.get("action"),s=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true;if(e==="momo"||a==="scan"||a==="split"||a==="transfer"||s)d.classList.add("tp-skip-hero");else d.classList.add("tp-hero-open")}catch(x){}})()`;

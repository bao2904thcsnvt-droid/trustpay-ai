/**
 * Theme Light/Dark của TrustPay AI.
 *
 * - `ThemePreference = null` nghĩa là "theo hệ thống" (prefers-color-scheme) —
 *   đây là trạng thái lần đầu mở ứng dụng.
 * - Khi người dùng bấm "☀️ Light | 🌙 Dark", lựa chọn được lưu bền vững trong
 *   `trustpay-ai.preferences.v1` (cùng store với ngôn ngữ).
 * - Script nội tuyến trong <head> đọc cùng nguồn đó để đặt lớp `.dark` trước khi
 *   trình duyệt vẽ khung hình đầu tiên (không nháy sáng, không lỗi hydrate).
 */

export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | null;

/** Phải trùng `PREFERENCES_STORAGE_KEY` trong `lib/preferences/preferences-store.ts`. */
export const THEME_STORAGE_KEY = "trustpay-ai.preferences.v1";

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ThemeMode {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return systemPrefersDark ? "dark" : "light";
}

/** Áp theme lên phần tử <html> (lớp `.dark` + `color-scheme` cho thanh cuộn/ô nhập gốc). */
export function applyThemeToDocument(mode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
}

/**
 * Mã script chạy đồng bộ trong <head>. Chỉ đọc JSON tùy chọn (dữ liệu không tin
 * cậy) và chấp nhận đúng 2 giá trị "light" | "dark"; mọi lỗi → theo hệ thống.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,t=null,r=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(r){var p=JSON.parse(r);if(p&&(p.theme==="light"||p.theme==="dark"))t=p.theme}if(!t)t=window.matchMedia&&window.matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches?"dark":"light";if(t==="dark")d.classList.add("dark");else d.classList.remove("dark");d.style.colorScheme=t}catch(e){}})()`;

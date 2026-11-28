import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Inter, JetBrains_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme";
import { CINEMATIC_VIDEO_ORIGIN, FONT_AWESOME_URL, HERO_BOOT_SCRIPT } from "@/lib/cinematic/cinematic";
import PwaRegister from "@/components/pwa/PwaRegister";
import "./globals.css";

/**
 * Vòng 7 — Hệ chữ Ergonomic Fintech (tự host qua next/font, không gọi Google lúc chạy):
 *  - Be Vietnam Pro: tiêu đề, nhãn, cảnh báo, nội dung tiếng Việt (dấu thanh rõ, không dính chữ).
 *  - Inter + `font-variant-numeric: tabular-nums`: số dư, số tiền, chỉ số rủi ro, bảng biểu.
 *  - JetBrains Mono: STK, mã BIN, payload VietQR TLV/CRC-16, mã băm SHA-256, log của AI Agent.
 */
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TrustPay AI — Ví Thông Minh & Lá Chắn Chống Lừa Đảo",
  description:
    "Ứng dụng thanh toán hợp nhất với Lá chắn AI bảo vệ mọi giao dịch chuyển khoản, rút tiền liên ngân hàng và quét mã QR theo thời gian thực.",
  // PWA: cài lên màn hình chính như ứng dụng (Android/Chrome/Edge + iOS Safari).
  applicationName: "TrustPay AI",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "TrustPay AI",
    statusBarStyle: "black-translucent",
    startupImage: [{ url: "/icons/icon-512.png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#090D16",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Đặt theme (mặc định Dark Obsidian Slate) trước lần vẽ đầu tiên — đọc tùy chọn đã lưu. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Khóa cuộn khi Hero hiện; ẩn Hero ngay từ HTML cho iframe SDK / PWA standalone / lối tắt PWA. */}
        <script dangerouslySetInnerHTML={{ __html: HERO_BOOT_SCRIPT }} />
        <link rel="preconnect" href={CINEMATIC_VIDEO_ORIGIN} />
        {/* Icon Font Awesome 6.5.2 (các vòng tròn tin cậy ở Hero). */}
        <link rel="stylesheet" href={FONT_AWESOME_URL} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-[#d82d8b]/20 selection:text-[#a50064]">
        {children}
        {/* Đăng ký Service Worker `/sw.js` tự động (bản Production) — điều kiện cài PWA / đóng gói APK qua PWABuilder. */}
        <PwaRegister />
      </body>
    </html>
  );
}

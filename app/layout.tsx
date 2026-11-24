import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme";
import {
  CINEMATIC_VIDEO_ORIGIN,
  FONT_AWESOME_URL,
  FONT_BUBBLEDOT_URL,
  FONT_INTER_URL,
  HERO_BOOT_SCRIPT,
} from "@/lib/cinematic/cinematic";
import "./globals.css";

/** Be Vietnam Pro: phủ dấu tiếng Việt cho các glyph mà Inter / BubbledotICG-FinePos không có. */
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustPay AI — Ví Thông Minh & Lá Chắn Chống Lừa Đảo",
  description:
    "Ứng dụng thanh toán hợp nhất với Lá chắn AI bảo vệ mọi giao dịch chuyển khoản, rút tiền liên ngân hàng và quét mã QR theo thời gian thực.",
  // PWA: cài lên màn hình chính như ứng dụng (Android/Chrome/Edge + iOS Safari).
  applicationName: "TrustPay AI",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: "TrustPay AI",
    statusBarStyle: "black",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Đặt theme (mặc định Dark) trước lần vẽ đầu tiên — đọc tùy chọn đã lưu. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Khóa cuộn khi Hero hiện; ẩn Hero ngay từ HTML cho iframe SDK / PWA standalone / lối tắt PWA. */}
        <script dangerouslySetInnerHTML={{ __html: HERO_BOOT_SCRIPT }} />
        <link rel="preconnect" href={CINEMATIC_VIDEO_ORIGIN} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Hệ font & icon CDN: Inter, BubbledotICG-FinePos (chấm ma trận), Font Awesome 6.5.2. */}
        <link rel="stylesheet" href={FONT_INTER_URL} />
        <link rel="stylesheet" href={FONT_BUBBLEDOT_URL} />
        <link rel="stylesheet" href={FONT_AWESOME_URL} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-[#d82d8b]/20 selection:text-[#a50064]">
        {children}
      </body>
    </html>
  );
}

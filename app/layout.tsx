import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme";
import "./globals.css";

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
    "Nền tảng ví điện tử tích hợp Lá chắn AI chống lừa đảo và Fintech Future Workspace vận hành trên AWS Serverless.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Đặt theme Light/Dark trước lần vẽ đầu tiên (đọc tùy chọn đã lưu hoặc theme hệ thống). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-[#d82d8b]/20 selection:text-[#a50064]">
        {children}
      </body>
    </html>
  );
}

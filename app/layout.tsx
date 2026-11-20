import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-[#d82d8b]/20 selection:text-[#a50064]">
        {children}
      </body>
    </html>
  );
}

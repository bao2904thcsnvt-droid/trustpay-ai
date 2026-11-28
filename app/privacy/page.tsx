import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Database, FileCheck2, Lock, ShieldCheck, Trash2, UserCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Chính sách Bảo vệ Dữ liệu Cá nhân (NĐ 13/2023) — TrustPay AI",
  description:
    "Thông báo minh bạch về việc thu thập, lưu trữ, che giấu PII và quyền của chủ thể dữ liệu theo Nghị định 13/2023/NĐ-CP trên TrustPay AI.",
};

const UPDATED_DATE = "28/11/2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4 text-[#a50064]" />
            <span>Quay lại TrustPay AI</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-[#a50064]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Nghị định 13/2023/NĐ-CP
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold tracking-wide text-[#a50064] uppercase">
            Thông báo xử lý dữ liệu cá nhân
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Chính sách Bảo vệ Dữ liệu Cá nhân
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            TrustPay AI cam kết minh bạch trong việc thu thập và xử lý dữ liệu cá nhân theo{" "}
            <strong className="font-semibold text-slate-800">Nghị định 13/2023/NĐ-CP</strong> về bảo vệ dữ liệu cá nhân
            và tuân thủ sàn xác thực sinh trắc học theo{" "}
            <strong className="font-semibold text-slate-800">Thông tư 50/2024/TT-NHNN</strong> (và Quyết định 2345/QĐ-NHNN).
            TrustPay AI là lớp bảo vệ và điều phối thanh toán — ứng dụng{" "}
            <strong className="font-semibold text-slate-800">không lưu giữ tiền</strong> và không yêu cầu mật khẩu đăng
            nhập ngân hàng của bạn.
          </p>
          <p className="mt-3 text-xs text-slate-500">Cập nhật lần cuối: {UPDATED_DATE}</p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-[#a50064]">
              <Database className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">1. Dữ liệu được xử lý & nơi lưu trữ</h2>
          </div>

          <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-700">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold text-slate-900">A. Lưu cục bộ trên trình duyệt thiết bị (localStorage)</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>
                  <strong>Thông tin tài khoản ngân hàng / ví liên kết:</strong> mã ngân hàng (BIN NAPAS), tên chủ tài khoản,
                  4 số cuối và số tài khoản (chỉ dùng để tạo mã VietQR chuẩn EMVCo cho chính bạn).
                </li>
                <li>
                  <strong>Danh bạ tin cậy & ngân sách:</strong> tên gợi nhớ người nhận, hạn mức chi tiêu theo danh mục,
                  lịch sử giao dịch mô phỏng trên thiết bị.
                </li>
                <li>
                  <strong>Khóa ứng dụng:</strong> mã định danh Passkey WebAuthn và mã băm <code className="font-mono text-xs">SHA-256(salt:PIN)</code> —
                  không bao giờ lưu mã PIN dạng văn bản thuần.
                </li>
                <li>
                  <strong>Chuỗi kiểm toán (Audit Chain):</strong> chỉ ghi sự kiện, mức rủi ro, khoảng số tiền và mã băm SHA-256 —{" "}
                  <strong>không chứa PII thô</strong>.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="font-bold text-slate-900">B. Xử lý tức thời trên máy chủ (trong RAM, không lưu trữ lâu dài)</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>
                  <strong>Nội dung giao dịch & ảnh bằng chứng:</strong> được bộ luật chống lừa đảo phân tích trong bộ nhớ
                  tạm thời; nếu có cấu hình AWS (Rekognition / Translate / Bedrock), toàn bộ số CCCD 12 số, số điện thoại
                  và số tài khoản được <strong>che bằng ký tự <code className="font-mono">*</code></strong> trước khi gửi
                  tới mô hình ngôn ngữ (Bedrock), và ảnh gốc không được gửi kèm prompt.
                </li>
                <li>
                  <strong>Dữ liệu sinh trắc học khuôn mặt (dữ liệu cá nhân nhạy cảm):</strong> chỉ thu thập khi giao dịch có
                  rủi ro CAO hoặc vượt ngưỡng pháp lý (&gt; 10 triệu VNĐ/lần hoặc lũy kế &gt; 20 triệu VNĐ/ngày). Ảnh selfie
                  được đối chiếu tức thời qua Amazon Rekognition với hồ sơ đã đăng ký và mặc định{" "}
                  <strong>chặn giao dịch (fail-closed)</strong> nếu dịch vụ không sẵn sàng ở môi trường Production.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-[#a50064]">
              <Lock className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">2. Mục đích xử lý & biện pháp bảo vệ</h2>
          </div>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
            <li>
              <strong>Mục đích duy nhất:</strong> phát hiện dấu hiệu lừa đảo (mạo danh cơ quan chức năng, cài ứng dụng giả
              mạo/APK, việc nhẹ lương cao, mã QR dán đè), kiểm soát hạn mức ngân sách và tạo mã VietQR / liên kết mở app
              ngân hàng chính thống.
            </li>
            <li>
              <strong>Không bán, không chia sẻ cho bên thứ ba vì mục đích quảng cáo:</strong> dữ liệu không rời khỏi thiết
              bị trừ khi bạn chủ động bấm phân tích AI hoặc xác thực sinh trắc học.
            </li>
            <li>
              <strong>Minh bạch kỹ thuật ở phiên bản Demo / Hackathon:</strong> số tài khoản trong Két tài khoản hiện được
              lưu trên <code className="font-mono text-xs">localStorage</code> của trình duyệt bạn đang dùng và chỉ tồn tại
              cục bộ trên máy đó; không dùng tài khoản thật trên thiết bị công cộng. Phiên bản Production triển khai mã hóa
              Web Crypto gắn với Passkey thiết bị và đối soát biến động số dư qua webhook có ký HMAC.
            </li>
          </ul>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-50 text-[#a50064]">
              <UserCheck className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">3. Quyền của chủ thể dữ liệu (Điều 9, NĐ 13/2023)</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Bạn có đầy đủ quyền của chủ thể dữ liệu đối với mọi thông tin mình nhập vào TrustPay AI:
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
              <p className="font-semibold text-slate-900">Quyền được biết & đồng ý</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Mọi quyền nhạy cảm (Camera quét QR, Passkey/sinh trắc học) chỉ kích hoạt khi bạn chủ động bấm và chấp thuận
                trên hộp thoại hệ thống.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
              <p className="font-semibold text-slate-900">Quyền truy cập & chỉnh sửa</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Bạn có thể xem, sửa hoặc xóa từng tài khoản liên kết, danh bạ tin cậy và hạn mức ngân sách ngay trong ứng dụng.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
              <p className="font-semibold text-slate-900">Quyền rút lại sự đồng ý & xóa dữ liệu</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Bấm nút <strong>Reset Demo</strong> trên thanh công cụ (hoặc xóa dữ liệu trang web trong trình duyệt) để xóa
                sạch ngay lập tức toàn bộ dữ liệu đã lưu trên thiết bị.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
              <p className="font-semibold text-slate-900">Quyền kiểm tra nhật ký bảo mật</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Kiểm tra trực tiếp cơ chế che PII, chuỗi Audit SHA-256 và kiến trúc FinOps trong mục{" "}
                <em>AWS Security &amp; FinOps</em>.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-pink-200 bg-pink-50/70 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#a50064]" />
            <div className="text-sm text-slate-700">
              <p className="font-bold text-slate-900">Xóa toàn bộ dữ liệu trên thiết bị này bất cứ lúc nào</p>
              <p className="mt-0.5 text-xs text-slate-600">
                Quay lại màn hình chính và chọn <strong>Reset Demo</strong> trong menu để xóa sạch mọi thông tin cục bộ.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:brightness-110"
          >
            <Trash2 className="h-4 w-4" />
            <span>Về ứng dụng</span>
          </Link>
        </section>
      </main>
    </div>
  );
}

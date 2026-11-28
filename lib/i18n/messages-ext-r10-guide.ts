/**
 * Từ điển VI/EN vòng 10 — Hướng dẫn sử dụng cho người mới (7 bước, có nút "Dùng thử").
 * Trộn vào `Messages` trong `lib/i18n/messages.ts`.
 */

export interface BeginnerGuideStepText {
  title: string;
  summary: string;
  steps: string[];
  tip: string;
}

export const viExtR10Guide = {
  beginner: {
    open: "📖 Hướng dẫn cho người mới",
    openShort: "Hướng dẫn",
    cardTitle: "📖 Hướng dẫn cho người mới",
    cardDesc: "7 bước, khoảng 1 phút — mỗi bước có nút “Dùng thử” mở thẳng tính năng.",
    cardCta: "Xem hướng dẫn",
    title: "Hướng dẫn sử dụng TrustPay AI",
    subtitle: "Làm quen trong 1 phút. Chọn một bước rồi bấm “Dùng thử tính năng này”.",
    stepOf: (current: number, total: number) => `Bước ${current}/${total}`,
    tryNow: "Dùng thử tính năng này",
    prev: "Trước",
    next: "Tiếp",
    done: "Xong",
    close: "Đóng hướng dẫn",
    language: "Ngôn ngữ",
    advanced: "Hướng dẫn tính năng nâng cao →",
    easyNote: "Đang bật Chế độ Dễ dùng — chữ được phóng to.",
    tryToast: (title: string) => `Dùng thử: ${title}`,
    demoNote:
      "Dữ liệu mẫu không chứa STK thật. Tiền thật chỉ được trừ khi BẠN xác nhận trong app ngân hàng / MoMo của mình.",
    steps: [
      {
        title: "Cài App lên điện thoại (Android APK & iPhone)",
        summary: "Đưa biểu tượng TrustPay AI ra màn hình chính chỉ với 2 chạm.",
        steps: [
          "Android: bấm “Tải tệp Android (.APK)” hoặc “Cài App trực tiếp” → Cài đặt.",
          "iPhone (Safari): chạm Chia sẻ → “Thêm vào màn hình chính”.",
        ],
        tip: "Sau khi cài, ứng dụng mở toàn màn hình và vẫn xem được khi mạng chập chờn.",
      },
      {
        title: "Liên kết tài khoản ngân hàng thật",
        summary: "Thêm STK chính chủ (PVcomBank, Vietcombank, MB, MoMo…) và đặt tài khoản mặc định.",
        steps: [
          "Mở mục Ngân hàng → “Thêm tài khoản chính chủ”, chọn ngân hàng, nhập STK và tên (tự chuyển IN HOA KHÔNG DẤU).",
          "Xác thực: chuyển thử 1.000đ bằng VietQR về chính tài khoản, hoặc dùng vân tay / FaceID (passkey).",
          "Chạm ⭐ để đặt tài khoản nhận tiền / nguồn chuyển mặc định; gỡ liên kết bất kỳ lúc nào.",
        ],
        tip: "TrustPay không giữ tiền và không đọc sao kê — chỉ lưu 4 số cuối vào nhật ký kiểm toán.",
      },
      {
        title: "Quét mã QR bằng Camera điện thoại",
        summary: "Quét mã VietQR ở quán ăn, trên hóa đơn, hoặc chọn ảnh QR bạn bè gửi qua Zalo.",
        steps: [
          "Bấm nút Quét QR ở giữa thanh dưới, đưa mã vào khung — điện thoại rung nhẹ khi đọc được.",
          "Quán tối? Bật đèn Flash. Mã nằm trong ảnh? Chọn “Ảnh QR từ thư viện”.",
          "AI kiểm tra CRC-16 và tên người nhận, rồi bấm “Mở App Ngân hàng thanh toán ngay”.",
        ],
        tip: "Mã có CRC-16 sai (bị sửa / dán đè) sẽ bị cảnh báo đỏ và không cho mở app ngân hàng.",
      },
      {
        title: "Chuyển & Rút tiền liên ngân hàng 24/7",
        summary: "Tạo lệnh, để Lá chắn AI kiểm tra, rồi mở thẳng App Ngân hàng / MoMo để trừ tiền thật.",
        steps: [
          "Chọn Chuyển tiền (hoặc Rút tiền về tài khoản chính chủ), nhập người nhận và số tiền.",
          "Lá chắn AI chấm điểm rủi ro, so Blacklist; giao dịch lớn yêu cầu xác thực sinh trắc học.",
          "Khi an toàn: quét mã VietQR động, bấm “Mở App Ngân hàng”, hoặc tải ảnh QR về máy.",
        ],
        tip: "Bạn luôn là người bấm xác nhận cuối cùng trong app ngân hàng của mình.",
      },
      {
        title: "Dán tin nhắn chuyển khoản nhanh (Paste-to-Pay)",
        summary: "Copy tin nhắn đòi tiền / số tài khoản từ Zalo, Messenger rồi dán 1 chạm để tự điền.",
        steps: [
          "Sao chép tin nhắn có ngân hàng, STK, số tiền (hoặc ảnh có mã QR).",
          "Trong màn hình Chuyển tiền, bấm “Dán tin nhắn / Ảnh để tự điền”.",
          "Kiểm tra các ô đã điền; Lá chắn AI vẫn soát mọi dấu hiệu lừa đảo trong tin nhắn gốc.",
        ],
        tip: "Bản dùng thử dán một tin nhắn lừa đảo mẫu để bạn thấy AI chặn như thế nào.",
      },
      {
        title: "Soi lừa đảo, Soi Bill giả & Cuộc gọi lạ (Lá chắn AI)",
        summary: "Kiểm tra link / tin nhắn nghi ngờ, soi ảnh hóa đơn bị chỉnh sửa, bật lá chắn khi nghe máy lạ.",
        steps: [
          "Dán link hoặc tin nhắn vào “Hỏi AI: có lừa đảo không?”.",
          "Tải ảnh hóa đơn / biên lai lên Soi Bill (ELA) để phát hiện vùng bị chỉnh sửa.",
          "Đang nghe số lạ đòi chuyển tiền? Bật Call Shield để AI theo dõi và khóa giao dịch.",
        ],
        tip: "Cơ quan chức năng không bao giờ yêu cầu chuyển tiền để “xác minh tài khoản”.",
      },
      {
        title: "Xác thực Sinh trắc học & Người giám hộ (Thông tư 50 NHNN)",
        summary: "Giao dịch từ 10 triệu đồng, hoặc tổng trong ngày từ 20 triệu đồng, phải xác thực khuôn mặt.",
        steps: [
          "Ứng dụng tự khóa giao dịch đạt ngưỡng và yêu cầu FaceID / vân tay trước khi mở bảng thanh toán.",
          "Mục Người giám hộ: đặt mã PIN và người thân cho cha mẹ lớn tuổi.",
          "Giao dịch rủi ro cao bị giữ lại để người giám hộ duyệt hoặc chặn.",
        ],
        tip: "Bản dùng thử nạp kịch bản mạo danh 12 triệu đồng để xem quy tắc khóa bảo vệ.",
      },
    ] as BeginnerGuideStepText[],
  },
};

export type ExtR10GuideMessages = typeof viExtR10Guide;

export const enExtR10Guide: ExtR10GuideMessages = {
  beginner: {
    open: "📖 Beginner's guide",
    openShort: "Guide",
    cardTitle: "📖 Guide for new users",
    cardDesc: "7 steps, about 1 minute — each step has a “Try it” button that opens the feature.",
    cardCta: "Open the guide",
    title: "How to use TrustPay AI",
    subtitle: "Get started in 1 minute. Pick a step, then tap “Try this feature”.",
    stepOf: (current: number, total: number) => `Step ${current}/${total}`,
    tryNow: "Try this feature",
    prev: "Back",
    next: "Next",
    done: "Done",
    close: "Close guide",
    language: "Language",
    advanced: "Advanced feature guide →",
    easyNote: "Easy Mode is on — text is enlarged.",
    tryToast: (title: string) => `Try it: ${title}`,
    demoNote: "Sample data contains no real account numbers. Real money only moves when YOU confirm inside your own banking / MoMo app.",
    steps: [
      {
        title: "Install the app on your phone (Android APK & iPhone)",
        summary: "Put the TrustPay AI icon on your home screen in 2 taps.",
        steps: [
          "Android: tap “Download Android file (.APK)” or “Install app directly” → Install.",
          "iPhone (Safari): tap Share → “Add to Home Screen”.",
        ],
        tip: "Once installed, the app opens full-screen and still loads on a flaky connection.",
      },
      {
        title: "Link your real bank accounts",
        summary: "Add accounts in your own name (PVcomBank, Vietcombank, MB, MoMo…) and set defaults.",
        steps: [
          "Open Banks → “Add own account”, choose the bank, enter the number and name (auto UPPERCASE, no accents).",
          "Verify: send a 1,000đ VietQR test transfer to that same account, or use fingerprint / Face ID (passkey).",
          "Tap ⭐ to set the default receiving / sending account; unlink any time.",
        ],
        tip: "TrustPay never holds money or reads statements — only the last 4 digits go to the audit log.",
      },
      {
        title: "Scan QR codes with your phone camera",
        summary: "Scan VietQR codes at shops, on bills, or pick a QR image a friend sent on Zalo.",
        steps: [
          "Tap the Scan button in the middle of the bottom bar and frame the code — the phone buzzes when read.",
          "Dark shop? Turn on the flash. QR in a photo? Choose “QR image from gallery”.",
          "The AI checks the CRC-16 and payee name, then tap “Open banking app to pay now”.",
        ],
        tip: "Codes with a wrong CRC-16 (edited / stickered over) get a red warning and cannot open a bank app.",
      },
      {
        title: "24/7 inter-bank transfers & withdrawals",
        summary: "Create an order, let the AI Shield check it, then open your banking / MoMo app to pay for real.",
        steps: [
          "Choose Transfer (or Withdraw to your own account), enter the payee and amount.",
          "The AI Shield scores the risk and checks the blacklist; large amounts need biometric verification.",
          "When safe: scan the dynamic VietQR, tap “Open banking app”, or save the QR image.",
        ],
        tip: "You always make the final confirmation inside your own banking app.",
      },
      {
        title: "Paste a payment message (Paste-to-Pay)",
        summary: "Copy a payment request / account number from Zalo or Messenger and paste it in one tap.",
        steps: [
          "Copy a message containing the bank, account number and amount (or an image with a QR).",
          "On the Transfer screen, tap “Paste message / image to auto-fill”.",
          "Check the filled fields; the AI Shield still scans the original message for scam signals.",
        ],
        tip: "The demo pastes a sample scam message so you can see how the AI blocks it.",
      },
      {
        title: "Check scams, fake bills & strange calls (AI Shield)",
        summary: "Check suspicious links / messages, scan edited bill photos, turn on the shield during odd calls.",
        steps: [
          "Paste a link or message into “Ask AI: is this a scam?”.",
          "Upload a bill / receipt photo to Bill Check (ELA) to spot edited regions.",
          "On a call with a stranger asking for money? Turn on Call Shield so the AI watches and locks transfers.",
        ],
        tip: "Authorities never ask you to transfer money to “verify your account”.",
      },
      {
        title: "Biometrics & Guardian (SBV Circular 50)",
        summary: "Transfers of 10M VND or more, or 20M VND+ per day in total, require face verification.",
        steps: [
          "The app locks transfers at the threshold and asks for Face ID / fingerprint before payment.",
          "In Guardian: set a PIN and a trusted relative for elderly parents.",
          "High-risk transfers are held for the guardian to approve or block.",
        ],
        tip: "The demo loads a 12M VND impersonation scenario so you can see the protective lock.",
      },
    ],
  },
};

import type { PostResult } from "@/lib/sdk/host-bridge";
import type { SdkDecision } from "@/lib/sdk/decision-token";

/**
 * Từ điển VI/EN vòng 3: Real Payment Handoff (VietQR + DeepLink), Chế độ Nhúng
 * SDK MoMo, Decision Token Inspector và Mô hình Triển khai Thực tế. Được trộn vào
 * `Messages` trong `lib/i18n/messages.ts`; bản tiếng Anh dùng kiểu suy ra từ bản
 * tiếng Việt nên TypeScript bắt lỗi thiếu khóa. Hàm trả về chuỗi dạng điều kiện
 * luôn khai báo `: string` để không bị suy ra kiểu literal.
 */

export const viExtR3 = {
  payee: {
    sectionTitle: "Ngân hàng / Ví nhận tiền thật",
    sectionHint: "Lá chắn AI đối chiếu Blacklist trên đúng STK này trước khi mở chuyển tiền thật.",
    bankLabel: "Ngân hàng / Ví nhận",
    bankPlaceholder: "— Chọn ngân hàng / ví —",
    accountLabel: "Số tài khoản",
    walletPhoneLabel: "Số điện thoại Ví MoMo",
    accountPlaceholder: "Ví dụ: 0071001234567",
    walletPlaceholder: "Ví dụ: 0909123888",
    nameLabel: "Tên người nhận (không dấu)",
    namePlaceholder: "NGUYEN MINH",
    optional: "tùy chọn",
    invalidBank: "STK gồm 6–19 chữ số hoặc chữ cái.",
    invalidWallet: "Số điện thoại MoMo gồm 10 số, bắt đầu bằng 0.",
    appendedNote: (account: string, bank: string) =>
      `Khi phân tích, Lá chắn AI kiểm tra cả STK ${account} (${bank}) — đối chiếu Blacklist & cụm 1903xxxx.`,
    mismatch: "Lệnh có STK khác STK người nhận đã chọn — kiểm tra lại trước khi phân tích.",
    momoHint:
      "Ví MoMo nhận tiền qua NAPAS 247 bằng số điện thoại. Nếu app ngân hàng không nhận diện mã, hãy dùng “Sao chép STK & Nội dung”.",
    clear: "Xóa người nhận",
  },
  handoff: {
    title: "Chuyển tiền thật qua Ngân hàng / MoMo (Real Payment Handoff)",
    subtitle:
      "TrustPay AI không giữ tiền: tiền đi thẳng từ app của bạn qua NAPAS 247 tới đúng người nhận đã được Lá chắn AI kiểm tra.",
    readySafe: "AN TOÀN — đã mở chuyển tiền thật",
    readyGuardian: (name: string) => `Người giám hộ ${name} đã cho phép — đã mở chuyển tiền thật`,
    lockedTitle: "Chuyển tiền thật đang bị khóa",
    lockedDesc:
      "Chỉ mở khi Lá chắn AI đánh giá AN TOÀN hoặc Người giám hộ bấm “Xác nhận an toàn – Cho phép chuyển”.",
    lockedBiometric: "Giao dịch cần xác thực khuôn mặt (TT 50) trước khi mở chuyển tiền thật.",
    blockedDesc: "Giao dịch đã bị chặn hoặc hủy — không tạo mã chuyển tiền thật.",
    needPayeeTitle: "Thêm ngân hàng & STK người nhận để tạo VietQR thật",
    needPayeeDesc: "Chọn “Ngân hàng / Ví nhận tiền thật” trong biểu mẫu chuyển tiền rồi phân tích lại.",
    needPayeeCta: "Điền người nhận",
    bank: "Ngân hàng",
    account: "Số tài khoản",
    holder: "Chủ tài khoản",
    holderUnknown: "Ngân hàng hiển thị khi quét",
    amount: "Số tiền",
    memo: "Nội dung chuyển khoản",
    memoHint: "Không dấu, tối đa 25 ký tự",
    sourceRemote: "Ảnh VietQR (img.vietqr.io)",
    sourceLocal: "QR tạo trên máy",
    imageLoading: "Đang tải ảnh VietQR…",
    imageFallback: "Không tải được ảnh VietQR — đã chuyển sang mã QR vẽ ngay trên máy.",
    offline: "Đang Offline — mã QR được vẽ ngay trên máy, quét vẫn chuyển tiền thật.",
    walletLocalOnly: "Ví MoMo: mã QR được vẽ ngay trên máy theo chuẩn EMVCo.",
    privacyRemote:
      "Ảnh từ img.vietqr.io gửi STK, số tiền và nội dung tới dịch vụ VietQR công khai. Chọn “QR tạo trên máy” để không gửi dữ liệu ra ngoài.",
    scanHint: "Dùng camera app Ngân hàng / MoMo quét mã này — app hiện đúng người nhận, số tiền và nội dung.",
    emvcoLabel: "Chuỗi EMVCo",
    crcOk: (crc: string) => `CRC-16 hợp lệ (${crc})`,
    selfCheck: "Đã tự kiểm tra bằng bộ giải mã EMVCo của TrustPay",
    payerAppLabel: "Mở bằng app ngân hàng của bạn",
    openBank: "Mở App Ngân hàng (VietQR DeepLink)",
    openMomo: "Mở Ví MoMo chuyển thật",
    copyAll: "Sao chép STK & Nội dung",
    copied: "Đã sao chép",
    savePng: "Lưu ảnh QR (PNG)",
    desktopCopied: "Trên máy tính: đã sao chép STK & nội dung. Hãy quét mã QR bằng app ngân hàng trên điện thoại.",
    momoGuideTitle: "Chuyển thật bằng MoMo",
    momoGuide: [
      "Mở app MoMo → chọn “Quét mã”.",
      "Quét mã VietQR bên trên (hoặc chọn ảnh QR đã lưu).",
      "Kiểm tra tên người nhận, số tiền, nội dung → Xác nhận trong MoMo.",
    ],
    momoDesktop: "Máy tính không mở được app MoMo — hãy dùng điện thoại quét mã VietQR bên trên.",
    copyLines: {
      bank: "Ngân hàng",
      account: "Số tài khoản",
      holder: "Chủ tài khoản",
      amount: "Số tiền",
      memo: "Nội dung",
    },
    realMoneyWarning: "Đây là chuyển tiền THẬT. Kiểm tra lại tên người nhận trên app ngân hàng trước khi xác nhận.",
    openFromCooling: "Mở chuyển tiền thật (VietQR)",
  },
  sdk: {
    toggle: "🔌 Chế độ Nhúng SDK (MoMo Embedded)",
    toggleShort: "🔌 Nhúng SDK",
    toggleTitle: "Mô phỏng TrustPay AI SDK nhúng trong Siêu ứng dụng MoMo / App Ngân hàng (?embed=momo)",
    exit: "Thoát chế độ nhúng",
    hostName: "MoMo",
    hostScreen: "Chuyển tiền",
    hostBadge: "Host App · Siêu ứng dụng đối tác",
    hostBalance: "Số dư (Server Ledger của Host)",
    sdkBadge: "TrustPay AI SDK",
    sdkHook: "onBeforeTransferConfirm",
    tier1Title: "Tầng 1 – Host App (MoMo / Ngân hàng)",
    tier1Items: [
      "Quản lý sổ cái tiền thật (Server Ledger)",
      "Đối chiếu sinh trắc học CCCD gắn chip (C06) cho giao dịch > 10.000.000 VNĐ theo TT 50 NHNN",
      "Kết nối đường ray thanh toán NAPAS 247",
    ],
    tier2Title: "Tầng 2 – TrustPay AI SDK (onBeforeTransferConfirm)",
    tier2Items: [
      "Soi mã QR chuẩn EMVCo trước khi trả tiền",
      "Lá chắn cuộc gọi lạ (Active Call Shield)",
      "Hạ nhiệt 15 giây cho giao dịch rủi ro cao",
      "Phê duyệt của Người giám hộ",
    ],
    tabTransfer: "Chuyển tiền",
    tabQr: "Soi mã VietQR",
    hostStepTitle: "Host App xử lý Decision Token",
    hostWaiting: "Chưa có Decision Token — tạo một lệnh chuyển trong SDK để bắt đầu.",
    hostDecision: (decision: SdkDecision): string =>
      decision === "ALLOW"
        ? "ALLOW — Host tiếp tục bước xác nhận cuối"
        : decision === "HOLD_GUARDIAN"
          ? "HOLD_GUARDIAN — Host tạm giữ lệnh, chờ Người giám hộ"
          : "BLOCK — Host hủy lệnh, không ghi sổ cái",
    hostC06Required: "C06: Host bắt buộc xác thực CCCD gắn chip (> 10.000.000đ hoặc rủi ro cao)",
    hostC06NotRequired: "C06: không bắt buộc với giao dịch này",
    hostNapasPending: "NAPAS 247: chờ người dùng xác nhận trong SDK",
    hostNapasDone: (ref: string) => `NAPAS 247: Host đã ghi Server Ledger & chuyển tiền (mô phỏng) • Mã ${ref}`,
    hostNapasStopped: "NAPAS 247: không gửi lệnh",
    signatureOk: "signatureHash hợp lệ",
    signatureBad: "signatureHash KHÔNG hợp lệ",
    inspectorTitle: "SDK Event & Decision Token Inspector",
    inspectorSubtitle: "Gói tin JSON TrustPay SDK gửi về Host App qua window.parent.postMessage",
    inspectorEmpty: "Chưa có sự kiện. Phân tích một giao dịch hoặc soi một mã QR.",
    inspectorShow: "Mở rộng",
    inspectorHide: "Thu gọn",
    inspectorClear: "Xóa nhật ký",
    inspectorCopy: "Sao chép JSON",
    delivery: (status: PostResult, origin: string): string =>
      status === "POSTED"
        ? `postMessage → ${origin}`
        : status === "NO_TRUSTED_ORIGIN"
          ? "Không gửi: chưa khai báo hostOrigin tin cậy (không dùng \"*\")"
          : status === "ERROR"
            ? "Gửi postMessage lỗi"
            : "Host mô phỏng trong trang (không có iframe cha)",
    inbound: "HOST → SDK",
    outbound: "SDK → HOST",
    hostRequestLine: (amount: string, bank: string) => `Host yêu cầu kiểm duyệt lệnh ${amount} tới ${bank}`,
    contractTitle: "Hợp đồng tích hợp",
    contractHint:
      "Host gửi TRUSTPAY_HOST_TRANSFER_REQUEST; SDK trả TRUSTPAY_SDK_DECISION. Chỉ nhận/gửi với origin Host đã khai báo (?hostOrigin=).",
  },
  deployment: {
    title: "Mô hình Triển khai Thực tế (Zero-License SDK & VietQR Handoff)",
    summary:
      "TrustPay AI không giữ tiền hộ khách hàng — vận hành như lớp lá chắn AI đứng trước cổng thanh toán MoMo / NAPAS 247.",
    points: [
      "Non-custodial: không mở ví, không giữ số dư → không cần giấy phép trung gian thanh toán (yêu cầu vốn điều lệ tối thiểu 50 tỷ đồng theo NĐ 52/2024/NĐ-CP).",
      "Standalone: chỉ khi Lá chắn AI đánh giá AN TOÀN (hoặc Người giám hộ cho phép) mới tạo VietQR / DeepLink để người dùng chuyển bằng app ngân hàng hoặc MoMo của chính mình.",
      "Embedded SDK: Host App gọi onBeforeTransferConfirm và nhận Decision Token ALLOW / HOLD_GUARDIAN / BLOCK; tiền, sổ cái và xác thực C06 vẫn do Host quản lý.",
      "Thương mại hóa ngay: tích hợp như nhà cung cấp công nghệ cho tổ chức đã có giấy phép — ranh giới pháp lý cần luật sư xác nhận trước khi ký hợp đồng.",
    ],
    flow: "Người dùng → Lá chắn AI → VietQR / Decision Token → App Ngân hàng / MoMo → NAPAS 247",
  },
  toastR3: {
    handoffCopied: "Đã sao chép STK & nội dung chuyển khoản",
    handoffCopiedDesc: "Dán vào app ngân hàng nếu không quét được mã QR.",
    copyFailed: "Không sao chép được",
    copyFailedDesc: "Trình duyệt chặn clipboard — hãy chọn và sao chép thủ công.",
    embedOn: "Đã bật Chế độ Nhúng SDK (MoMo Embedded)",
    embedOnDesc: "TrustPay AI chạy như SDK bên trong Host App — xem Decision Token ở khung Inspector.",
    embedOff: "Đã thoát Chế độ Nhúng SDK",
    embedOffDesc: "Quay lại giao diện TrustPay AI đầy đủ.",
    hostRequest: "Host App gửi yêu cầu kiểm duyệt",
    hostRequestDesc: "Đã điền sẵn lệnh và người nhận — bấm “Phân tích giao dịch với Lá chắn AI”.",
    pngSaved: "Đã lưu ảnh QR (PNG)",
    pngSavedDesc: "Mở app ngân hàng → Quét mã → Chọn ảnh từ thư viện.",
  },
};

export type ExtR3Messages = typeof viExtR3;

export const enExtR3: ExtR3Messages = {
  payee: {
    sectionTitle: "Real receiving bank / wallet",
    sectionHint: "The AI Shield checks this exact account against the Blacklist before unlocking a real transfer.",
    bankLabel: "Receiving bank / wallet",
    bankPlaceholder: "— Choose a bank / wallet —",
    accountLabel: "Account number",
    walletPhoneLabel: "MoMo wallet phone number",
    accountPlaceholder: "e.g. 0071001234567",
    walletPlaceholder: "e.g. 0909123888",
    nameLabel: "Recipient name (no accents)",
    namePlaceholder: "NGUYEN MINH",
    optional: "optional",
    invalidBank: "Account numbers have 6–19 digits or letters.",
    invalidWallet: "MoMo phone numbers have 10 digits and start with 0.",
    appendedNote: (account, bank) =>
      `During analysis the AI Shield also checks account ${account} (${bank}) against the Blacklist and the 1903xxxx cluster.`,
    mismatch: "The command contains a different account number from the selected recipient — check before analyzing.",
    momoHint:
      "MoMo wallets receive NAPAS 247 transfers by phone number. If a bank app does not recognise the code, use “Copy account & memo”.",
    clear: "Clear recipient",
  },
  handoff: {
    title: "Real transfer via Bank / MoMo (Real Payment Handoff)",
    subtitle:
      "TrustPay AI never holds your money: it goes straight from your own app over NAPAS 247 to the recipient the AI Shield just checked.",
    readySafe: "SAFE — real transfer unlocked",
    readyGuardian: (name) => `Guardian ${name} approved — real transfer unlocked`,
    lockedTitle: "Real transfer is locked",
    lockedDesc: "It only unlocks when the AI Shield rates the transfer SAFE or the guardian taps “Confirm safe – Allow transfer”.",
    lockedBiometric: "This transfer needs face verification (Circular 50) before the real transfer unlocks.",
    blockedDesc: "The transfer was blocked or cancelled — no real payment code is created.",
    needPayeeTitle: "Add the recipient's bank & account to create a real VietQR",
    needPayeeDesc: "Pick a “Real receiving bank / wallet” in the transfer form, then analyze again.",
    needPayeeCta: "Add recipient",
    bank: "Bank",
    account: "Account number",
    holder: "Account holder",
    holderUnknown: "Shown by the bank when scanning",
    amount: "Amount",
    memo: "Transfer memo",
    memoHint: "No accents, up to 25 characters",
    sourceRemote: "VietQR image (img.vietqr.io)",
    sourceLocal: "On-device QR",
    imageLoading: "Loading the VietQR image…",
    imageFallback: "Could not load the VietQR image — switched to a QR code drawn on this device.",
    offline: "Offline — the QR code is drawn on this device and still makes a real transfer.",
    walletLocalOnly: "MoMo wallet: the QR code is drawn on this device using the EMVCo standard.",
    privacyRemote:
      "The img.vietqr.io image sends the account, amount and memo to the public VietQR service. Choose “On-device QR” to keep the data local.",
    scanHint: "Scan this code with your bank or MoMo app camera — it shows the exact recipient, amount and memo.",
    emvcoLabel: "EMVCo string",
    crcOk: (crc) => `Valid CRC-16 (${crc})`,
    selfCheck: "Self-checked with TrustPay's EMVCo decoder",
    payerAppLabel: "Open with your banking app",
    openBank: "Open banking app (VietQR DeepLink)",
    openMomo: "Open MoMo for a real transfer",
    copyAll: "Copy account & memo",
    copied: "Copied",
    savePng: "Save QR image (PNG)",
    desktopCopied: "On a computer: account and memo copied. Scan the QR code with the banking app on your phone.",
    momoGuideTitle: "Real transfer with MoMo",
    momoGuide: [
      "Open the MoMo app → tap “Scan”.",
      "Scan the VietQR code above (or pick the saved QR image).",
      "Check the recipient name, amount and memo → confirm in MoMo.",
    ],
    momoDesktop: "A computer cannot open the MoMo app — scan the VietQR code above with your phone.",
    copyLines: {
      bank: "Bank",
      account: "Account number",
      holder: "Account holder",
      amount: "Amount",
      memo: "Memo",
    },
    realMoneyWarning: "This is a REAL transfer. Double-check the recipient name in your banking app before confirming.",
    openFromCooling: "Open the real transfer (VietQR)",
  },
  sdk: {
    toggle: "🔌 SDK Embedded mode (MoMo Embedded)",
    toggleShort: "🔌 Embed SDK",
    toggleTitle: "Simulate the TrustPay AI SDK embedded inside the MoMo super app / a banking app (?embed=momo)",
    exit: "Exit embedded mode",
    hostName: "MoMo",
    hostScreen: "Transfer",
    hostBadge: "Host App · partner super app",
    hostBalance: "Balance (host Server Ledger)",
    sdkBadge: "TrustPay AI SDK",
    sdkHook: "onBeforeTransferConfirm",
    tier1Title: "Tier 1 – Host App (MoMo / Bank)",
    tier1Items: [
      "Owns the real-money ledger (Server Ledger)",
      "Chip-ID biometric check (C06) for transfers above 10,000,000 VND under SBV Circular 50",
      "Connects to the NAPAS 247 payment rails",
    ],
    tier2Title: "Tier 2 – TrustPay AI SDK (onBeforeTransferConfirm)",
    tier2Items: [
      "EMVCo QR inspection before paying",
      "Unknown-call shield (Active Call Shield)",
      "15-second cool-off for high-risk transfers",
      "Trusted guardian approval",
    ],
    tabTransfer: "Transfer",
    tabQr: "VietQR Inspector",
    hostStepTitle: "Host App handles the Decision Token",
    hostWaiting: "No Decision Token yet — create a transfer in the SDK to start.",
    hostDecision: (decision) =>
      decision === "ALLOW"
        ? "ALLOW — host continues to the final confirmation"
        : decision === "HOLD_GUARDIAN"
          ? "HOLD_GUARDIAN — host holds the order and waits for the guardian"
          : "BLOCK — host cancels the order, nothing hits the ledger",
    hostC06Required: "C06: host must verify the chip ID card (> 10,000,000 VND or high risk)",
    hostC06NotRequired: "C06: not required for this transfer",
    hostNapasPending: "NAPAS 247: waiting for the user to confirm in the SDK",
    hostNapasDone: (ref) => `NAPAS 247: host posted to the Server Ledger and sent the money (simulated) • Ref ${ref}`,
    hostNapasStopped: "NAPAS 247: no order sent",
    signatureOk: "signatureHash valid",
    signatureBad: "signatureHash INVALID",
    inspectorTitle: "SDK Event & Decision Token Inspector",
    inspectorSubtitle: "JSON packets the TrustPay SDK sends to the Host App via window.parent.postMessage",
    inspectorEmpty: "No events yet. Analyze a transfer or inspect a QR code.",
    inspectorShow: "Expand",
    inspectorHide: "Collapse",
    inspectorClear: "Clear log",
    inspectorCopy: "Copy JSON",
    delivery: (status, origin) =>
      status === "POSTED"
        ? `postMessage → ${origin}`
        : status === "NO_TRUSTED_ORIGIN"
          ? "Not sent: no trusted hostOrigin declared (never \"*\")"
          : status === "ERROR"
            ? "postMessage failed"
            : "In-page simulated host (no parent iframe)",
    inbound: "HOST → SDK",
    outbound: "SDK → HOST",
    hostRequestLine: (amount, bank) => `Host asked to vet a ${amount} transfer to ${bank}`,
    contractTitle: "Integration contract",
    contractHint:
      "The host sends TRUSTPAY_HOST_TRANSFER_REQUEST; the SDK answers TRUSTPAY_SDK_DECISION. Messages are only exchanged with the declared host origin (?hostOrigin=).",
  },
  deployment: {
    title: "Real-world deployment model (Zero-License SDK & VietQR Handoff)",
    summary:
      "TrustPay AI never holds customer money — it runs as an AI shield in front of the MoMo / NAPAS 247 payment gates.",
    points: [
      "Non-custodial: no wallet, no stored balance → no payment-intermediary licence needed (that licence requires at least 50 billion VND of charter capital under Decree 52/2024/ND-CP).",
      "Standalone: only when the AI Shield rates a transfer SAFE (or the guardian approves) does it create a VietQR / DeepLink for the user's own banking or MoMo app.",
      "Embedded SDK: the host app calls onBeforeTransferConfirm and receives an ALLOW / HOLD_GUARDIAN / BLOCK Decision Token; money, ledger and C06 checks stay with the host.",
      "Ready to sell now: integrates as a technology vendor for licensed institutions — the legal boundary must be confirmed by counsel before signing.",
    ],
    flow: "User → AI Shield → VietQR / Decision Token → Banking app / MoMo → NAPAS 247",
  },
  toastR3: {
    handoffCopied: "Account and memo copied",
    handoffCopiedDesc: "Paste into your banking app if the QR code cannot be scanned.",
    copyFailed: "Could not copy",
    copyFailedDesc: "The browser blocked the clipboard — select and copy manually.",
    embedOn: "SDK Embedded mode on (MoMo Embedded)",
    embedOnDesc: "TrustPay AI runs as an SDK inside the host app — watch the Decision Tokens in the Inspector.",
    embedOff: "SDK Embedded mode off",
    embedOffDesc: "Back to the full TrustPay AI interface.",
    hostRequest: "The host app asked for a check",
    hostRequestDesc: "Command and recipient are pre-filled — run the AI Shield analysis.",
    pngSaved: "QR image saved (PNG)",
    pngSavedDesc: "Open your banking app → Scan → pick the image from your gallery.",
  },
};

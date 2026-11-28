/**
 * Từ điển VI/EN vòng 9 — Camera quét QR đa nền tảng (BarcodeDetector + jsQR cho iPhone Safari).
 * Trộn vào `Messages` trong `lib/i18n/messages.ts`.
 */

export const viExtR9Scan = {
  scanner: {
    title: "Quét mã QR bằng camera",
    /** Nhãn bộ giải mã đang chạy (góc trên khung camera). */
    engine: (name: string) => `Bộ giải mã: ${name}`,
    engineNative: "BarcodeDetector (có sẵn trong trình duyệt)",
    engineJsqr: "jsQR (chạy ngay trên máy)",
    engineHybrid: "BarcodeDetector + jsQR",
    loadingDecoder: "Đang tải bộ giải mã QR…",
    noCamera: "Trình duyệt này không mở được camera. Hãy mở trang bằng Safari hoặc Chrome bản mới.",
    inAppBrowser:
      "Trình duyệt bên trong ứng dụng (Zalo, Facebook, Messenger…) thường chặn camera. Hãy mở trang bằng Safari hoặc Chrome (menu ⋯ › Mở bằng trình duyệt).",
    deniedIos:
      "Camera đang bị chặn. Trên iPhone: chạm “aA” trên thanh địa chỉ Safari › Cài đặt trang web › Camera › Cho phép (hoặc Cài đặt › Safari › Camera), rồi bấm Thử lại.",
    deniedAndroid:
      "Camera đang bị chặn. Trên Android: chạm biểu tượng bên trái địa chỉ trang › Quyền › Camera › Cho phép, rồi bấm Thử lại.",
    deniedOther: "Camera đang bị chặn. Hãy cho phép camera cho trang này trong cài đặt quyền của trình duyệt, rồi bấm Thử lại.",
    notFound: "Không tìm thấy camera trên thiết bị này.",
    inUse:
      "Camera đang bận hoặc vừa bị ngắt (ứng dụng khác, ví dụ cuộc gọi video, đang dùng). Hãy đóng ứng dụng đó rồi bấm Thử lại.",
    decoderFailed: "Không tải được bộ giải mã QR. Hãy kiểm tra kết nối mạng rồi bấm Thử lại.",
    fallbackHint: "Bạn vẫn có thể chọn ảnh QR từ thư viện hoặc dán chuỗi mã bên dưới.",
    retry: "Thử lại",
    photoReading: "Đang đọc ảnh QR…",
    photoTip: "Mẹo: dùng ảnh chụp màn hình rõ nét, để mã QR chiếm phần lớn ảnh rồi thử lại.",
    photoHeic: "Trình duyệt này chưa đọc được ảnh HEIC. Hãy chụp màn hình mã QR (PNG/JPG) rồi chọn lại.",
    photoUnreadable: "Không đọc được tệp ảnh này. Hãy chọn một ảnh PNG hoặc JPG khác.",
  },
};

export type ExtR9ScanMessages = typeof viExtR9Scan;

export const enExtR9Scan: ExtR9ScanMessages = {
  scanner: {
    title: "Scan a QR code with your camera",
    engine: (name: string) => `Decoder: ${name}`,
    engineNative: "BarcodeDetector (built into the browser)",
    engineJsqr: "jsQR (runs on this device)",
    engineHybrid: "BarcodeDetector + jsQR",
    loadingDecoder: "Loading the QR decoder…",
    noCamera: "This browser can't open the camera. Open this page in an up-to-date Safari or Chrome.",
    inAppBrowser:
      "Browsers inside apps (Zalo, Facebook, Messenger…) often block the camera. Open this page in Safari or Chrome (⋯ menu › Open in browser).",
    deniedIos:
      "Camera access is blocked. On iPhone: tap “aA” in Safari's address bar › Website Settings › Camera › Allow (or Settings › Safari › Camera), then tap Try again.",
    deniedAndroid:
      "Camera access is blocked. On Android: tap the icon left of the page address › Permissions › Camera › Allow, then tap Try again.",
    deniedOther: "Camera access is blocked. Allow the camera for this site in your browser's permission settings, then tap Try again.",
    notFound: "No camera was found on this device.",
    inUse:
      "The camera is busy or was interrupted (another app, such as a video call, is using it). Close that app, then tap Try again.",
    decoderFailed: "Couldn't load the QR decoder. Check your connection, then tap Try again.",
    fallbackHint: "You can still choose a QR image from your gallery or paste the code string below.",
    retry: "Try again",
    photoReading: "Reading the QR image…",
    photoTip: "Tip: use a sharp screenshot where the QR code fills most of the image, then try again.",
    photoHeic: "This browser can't read HEIC images yet. Take a screenshot of the QR code (PNG/JPG) and choose it again.",
    photoUnreadable: "This image file couldn't be read. Choose a different PNG or JPG image.",
  },
};

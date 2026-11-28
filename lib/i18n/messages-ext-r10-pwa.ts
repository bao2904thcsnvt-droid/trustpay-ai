/**
 * Từ điển VI/EN vòng 10 — Thanh tải ứng dụng (APK Android qua PWABuilder + cài PWA iOS/Android).
 * Trộn vào `Messages` trong `lib/i18n/messages.ts`.
 */

export const viExtR10Pwa = {
  appDl: {
    title: "Tải TrustPay AI về điện thoại",
    subtitle: "Mở nhanh từ màn hình chính, chạy toàn màn hình như ứng dụng thật.",
    apk: "Tải tệp Android (.APK)",
    install: "Cài App trực tiếp (iOS & Android)",
    checking: "Đang kiểm tra tệp…",
    installed: "Đã cài TrustPay AI trên thiết bị này",
    apkStarted: "Đang tải trustpay-ai.apk",
    apkStartedDesc: "Mở tệp vừa tải và cho phép “Cài ứng dụng không rõ nguồn” nếu Android hỏi.",
    close: "Đóng",
    androidTitle: "Cài TrustPay AI qua Chrome (Android)",
    androidNote: "Bản .APK chưa được đính kèm trên máy chủ — bạn vẫn cài được ứng dụng 1 chạm ngay trong Chrome:",
    androidSteps: [
      "Mở trang này bằng Chrome trên điện thoại Android.",
      "Chạm menu ⋮ ở góc trên bên phải › chọn “Cài đặt ứng dụng” (hoặc “Thêm vào màn hình chính”).",
      "Chạm “Cài đặt” — biểu tượng khiên TrustPay xuất hiện trên màn hình chính.",
    ],
    promptNow: "Cài ngay bằng Chrome",
    iosTitle: "Thêm TrustPay AI vào màn hình chính (iPhone)",
    iosSteps: [
      "Mở trang này bằng Safari, chạm nút Chia sẻ (ô vuông có mũi tên lên).",
      "Chọn “Thêm vào màn hình chính” › chạm “Thêm”.",
    ],
    desktopTitle: "Cài TrustPay AI trên máy tính",
    desktopSteps: [
      "Trên Chrome / Edge: chạm biểu tượng Cài đặt (màn hình có mũi tên) ở cuối thanh địa chỉ.",
      "Hoặc mở trang này trên điện thoại để cài bản di động.",
    ],
  },
};

export type ExtR10PwaMessages = typeof viExtR10Pwa;

export const enExtR10Pwa: ExtR10PwaMessages = {
  appDl: {
    title: "Get TrustPay AI on your phone",
    subtitle: "Launch it from your home screen, full-screen like a native app.",
    apk: "Download Android file (.APK)",
    install: "Install app directly (iOS & Android)",
    checking: "Checking file…",
    installed: "TrustPay AI is installed on this device",
    apkStarted: "Downloading trustpay-ai.apk",
    apkStartedDesc: "Open the downloaded file and allow “Install unknown apps” if Android asks.",
    close: "Close",
    androidTitle: "Install TrustPay AI via Chrome (Android)",
    androidNote: "No .APK is attached on the server yet — you can still install the app in one tap with Chrome:",
    androidSteps: [
      "Open this page in Chrome on your Android phone.",
      "Tap the ⋮ menu (top right) › choose “Install app” (or “Add to Home screen”).",
      "Tap “Install” — the TrustPay shield icon appears on your home screen.",
    ],
    promptNow: "Install now with Chrome",
    iosTitle: "Add TrustPay AI to your Home Screen (iPhone)",
    iosSteps: ["Open this page in Safari and tap Share (square with an up arrow).", "Choose “Add to Home Screen” › tap “Add”."],
    desktopTitle: "Install TrustPay AI on your computer",
    desktopSteps: [
      "In Chrome / Edge: click the Install icon (monitor with an arrow) at the end of the address bar.",
      "Or open this page on your phone to install the mobile version.",
    ],
  },
};

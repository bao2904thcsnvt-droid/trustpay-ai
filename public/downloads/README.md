# Tệp cài đặt Android (APK) & Xác minh TWA (`assetlinks.json`)

## 1. Đặt tệp APK

Đặt tệp APK đóng gói bằng [PWABuilder](https://www.pwabuilder.com/) vào thư mục này với tên **`trustpay-ai.apk`**.

- Có tệp → nút **"Tải tệp Android (.APK)"** trên giao diện tải thẳng tệp về máy.
- Chưa có tệp → nút đó mở hướng dẫn cài ứng dụng 1 chạm qua Chrome (*Cài đặt ứng dụng*).

## 2. Ẩn thanh địa chỉ Chrome khi chạy APK (Digital Asset Links)

Gói APK từ PWABuilder chạy dưới dạng **Trusted Web Activity (TWA)**. Để Android xác nhận ứng dụng và tên miền là cùng một chủ sở hữu (mở toàn màn hình như app thật, không hiện thanh địa chỉ Chrome), hãy cập nhật tệp mẫu đã tạo sẵn tại:

- [`public/.well-known/assetlinks.json`](../.well-known/assetlinks.json) (được phục vụ tại `https://<ten-mien-cua-ban>/.well-known/assetlinks.json`)

### Các bước thực hiện khi đóng gói bằng PWABuilder

1. Mở [PWABuilder](https://www.pwabuilder.com/) → nhập URL bản triển khai HTTPS (vd. Vercel) → chọn *Package for stores* → **Android**.
2. Tải gói `.zip` về. Trong gói tải về có sẵn tệp `assetlinks.json` (hoặc thông tin `package_name` và vân tay `sha256_cert_fingerprints` của khóa ký APK).
3. Mở [`public/.well-known/assetlinks.json`](../.well-known/assetlinks.json) và thay:
   - `"package_name"` bằng đúng Package ID bạn chọn ở PWABuilder (mặc định đang để `"ai.trustpay.twa"`).
   - `"REPLACE_WITH_SHA256_FINGERPRINT_FROM_PWABUILDER"` bằng chuỗi SHA-256 dạng `AA:BB:CC:...` (64 ký tự hex phân cách bằng dấu `:`).
   - Nếu đưa lên Google Play dùng *Play App Signing*, thêm cả vân tay SHA-256 của *App signing key* trong Play Console vào cùng mảng `sha256_cert_fingerprints`.
4. Deploy lại trang web và kiểm tra:
   - Truy cập `https://<ten-mien>/.well-known/assetlinks.json` → phải trả HTTP `200 OK`, không redirect, header `Content-Type: application/json`.
   - Kiểm tra tự động qua Google Statement List Tester: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<ten-mien>&relation=delegate_permission/common.handle_all_urls`.
5. Đổi tên tệp `.apk` từ gói PWABuilder thành `trustpay-ai.apk` và đặt vào thư mục `public/downloads/`.

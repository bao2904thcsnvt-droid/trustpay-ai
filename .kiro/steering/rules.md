# Quy tắc bắt buộc cho Kiro Agent & Đội ngũ Phát triển TrustPay AI

Tất cả các thành viên và AI Agent tham gia viết code cho dự án **TrustPay AI** bắt buộc phải tuân thủ nghiêm ngặt 3 quy tắc kiến trúc dưới đây để đảm bảo không xung đột code khi ghép nhánh:

## 1. Khóa chặt Type Contract (`@/types/trustpay`)
- **Mọi file UI (Frontend) và API (Backend)** bắt buộc phải import các interface/type từ `@/types/trustpay` (`RiskLevel`, `BudgetCategory`, `TransactionAnalysisRequest`, `TransactionAnalysisResponse`, `VerifyFaceRequest`, `VerifyFaceResponse`).
- **Nghiêm cấm** tự ý định nghĩa lại kiểu dữ liệu trùng lặp, đổi tên field, thêm bớt field bắt buộc hoặc thay đổi cấu trúc JSON trả về đã quy định trong `API_CONTRACT.md`.

## 2. Sử dụng AWS SDK v3 kèm cơ chế Fallback Mock an toàn
- **Backend** sử dụng **AWS SDK v3** (`@aws-sdk/client-bedrock-runtime`, `@aws-sdk/client-rekognition`, `@aws-sdk/client-s3`, `@aws-sdk/client-translate`).
- Mọi lệnh gọi AWS service bắt buộc phải được bọc trong khối `try-catch`.
- Nếu thiếu AWS credentials ở môi trường local/demo hoặc khi AWS API gặp lỗi (timeout, quota, permission), khối `catch` (hoặc nhánh kiểm tra thiếu credentials) **phải tự động kích hoạt Fallback Mock thông minh** và **trả về HTTP 200** với cấu trúc chuẩn `TransactionAnalysisResponse` / `VerifyFaceResponse` để ứng dụng luôn hoạt động trơn tru khi thuyết trình/demo.

## 3. Bảo mật thông tin xác thực (Không Hardcode AWS Keys)
- **Tuyệt đối không hardcode** AWS Access Key, Secret Key, Session Token hay tên Bucket nhạy cảm trực tiếp trong source code.
- Toàn bộ cấu hình và khóa xác thực phải được đọc thông qua biến môi trường `process.env` (ví dụ: `process.env.AWS_REGION`, `process.env.AWS_ACCESS_KEY_ID`, `process.env.AWS_SECRET_ACCESS_KEY`, `process.env.AWS_S3_BUCKET_NAME`, `process.env.BEDROCK_MODEL_ID`).

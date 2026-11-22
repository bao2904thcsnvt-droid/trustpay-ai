---
inclusion: fileMatch
fileMatchPattern: "app/api/**"
---

# Quy tắc Resilience & FinOps khi gọi AWS AI — TrustPay AI

> Áp dụng khi chỉnh sửa các Route Handler/Lambda gọi Bedrock, Rekognition, Translate.
> Mục tiêu: chi phí thấp, độ trễ ổn định, dữ liệu được ẩn danh trước khi rời biên.

## 1. Tối ưu chi phí token Bedrock
- Luôn đặt `max_tokens` đủ nhỏ cho tác vụ (phân tích giao dịch: ≤ 1024). Không để mặc định lớn.
- `temperature` thấp (≤ 0.2) cho tác vụ chấm rủi ro để kết quả ổn định và prompt ngắn gọn.
- Bật **Prompt Caching** cho phần tĩnh của prompt (hướng dẫn hệ thống, schema tham chiếu, ví dụ) — chỉ phần động (lệnh người dùng, OCR) thay đổi theo request.
- **Định tuyến mô hình theo giá trị**: giao dịch nhỏ/ít rủi ro có thể dùng mô hình rẻ hơn (vd Claude Haiku); chỉ giao dịch giá trị cao hoặc nghi vấn mới gọi Sonnet.
- Rút gọn đầu vào: cắt `commandText` và văn bản OCR về độ dài hợp lý (vd ≤ 2000 ký tự) trước khi đưa vào prompt.
- Ưu tiên bộ luật (Smart Fallback) cho các mẫu đã xác định rõ để tiết kiệm lệnh gọi Bedrock.

## 2. Chuẩn hóa lỗi & khả năng phục hồi
- Mọi lệnh gọi AWS bọc `try/catch` + `withTimeout` (`lib/resilience/circuit-breaker.ts`): Bedrock ≤ 4s, Rekognition ≤ 2.5s, Translate ≤ 1.5s.
- Dùng `CircuitBreaker` theo từng dịch vụ; khi OPEN đi thẳng Offline Heuristic (< 50 ms).
- Phân loại lỗi để quyết định retry: `ThrottlingException`/`TooManyRequests`/5xx → retry có **exponential backoff + jitter** (tối đa 2 lần); lỗi quyền/4xx khác → không retry, sang fallback ngay.
- Nhánh dự phòng luôn trả HTTP 200 đúng schema. Không ném lỗi ra client cho tác vụ phân tích.
- Phát metric: `fallback_rate`, độ trễ mỗi dịch vụ, token tiêu thụ, phân bố `riskLevel`.

## 3. Ẩn danh hóa dữ liệu trước khi gọi LLM
- Chạy `maskPiiInText` trên `commandText` và văn bản OCR trước khi ghép vào prompt.
- Không gửi ảnh selfie, ảnh CCCD thô hay chuỗi base64 vào Bedrock trừ khi dùng tính năng đa phương thức có kiểm soát và đã khử nhận dạng.
- Không đưa AWS key, thông tin nội bộ hạ tầng, hay dữ liệu khách hàng ngoài phạm vi tác vụ vào prompt.
- Ghi log request chỉ ở mức ẩn danh (băm lệnh, dải số tiền, mức rủi ro), không log nội dung thô.

## 4. Quan sát chi phí (FinOps)
- Gắn tag chi phí (`project=trustpay-ai`, `env`, `service`) cho mọi tài nguyên để AWS Cost Explorer/Budgets bóc tách.
- Đặt AWS Budgets cảnh báo theo ngày/tháng cho Bedrock và Rekognition.
- Theo dõi chi phí trên mỗi 1.000 giao dịch (xem `pitch-prep/unit-economics-finops.md`); đặt mục tiêu và cảnh báo khi vượt.

# TrustPay AI — Unit Economics & FinOps

> **Phiên bản:** 1.0 · **Ngày:** 22/11/2026
> **Cảnh báo quan trọng:** Mọi đơn giá AWS dưới đây là **giả định mẫu để minh họa mô hình tính**, KHÔNG phải báo giá chính thức. Giá AWS thay đổi theo thời gian, region và cam kết sử dụng. Trước khi dùng cho quyết định tài chính, hãy thay bằng số từ **AWS Pricing Calculator** và hóa đơn thực tế của bạn. Mọi ô giá được đánh dấu `[GIẢ ĐỊNH]`.

## 1. Mô hình chi phí trên mỗi 1.000 giao dịch phân tích

### 1.1 Giả định đầu vào (có thể chỉnh)

| Tham số | Giá trị mẫu | Ghi chú |
|---|---|---|
| Tỷ lệ giao dịch gọi Bedrock | 60% | 40% còn lại dùng bộ luật (miễn phí AI) nhờ định tuyến theo giá trị |
| Token đầu vào trung bình / lần gọi Bedrock | 900 tokens | prompt + baseline + lệnh đã cắt gọn |
| Token đầu ra trung bình / lần gọi | 350 tokens | JSON `TransactionAnalysisResponse` |
| Tỷ lệ giao dịch có ảnh (OCR) | 25% | Rekognition DetectText |
| Tỷ lệ giao dịch cần Translate | 10% | nội dung đa ngôn ngữ |
| Tỷ lệ giao dịch HIGH cần CompareFaces | 8% | step-up sinh trắc |
| Thời gian Lambda / request | 400 ms @ 1024 MB | gồm chờ AWS |
| Ghi DynamoDB / giao dịch | 2 bản ghi (analysis + ticket/audit) | on-demand |

### 1.2 Đơn giá mẫu `[GIẢ ĐỊNH]`

| Dịch vụ | Đơn giá mẫu | Đơn vị |
|---|---|---|
| Bedrock Claude 3.5 Sonnet — input | `[GIẢ ĐỊNH]` 3,00 USD | / triệu token |
| Bedrock Claude 3.5 Sonnet — output | `[GIẢ ĐỊNH]` 15,00 USD | / triệu token |
| Rekognition DetectText | `[GIẢ ĐỊNH]` 1,00 USD | / 1.000 ảnh |
| Rekognition CompareFaces | `[GIẢ ĐỊNH]` 1,00 USD | / 1.000 ảnh |
| Amazon Translate | `[GIẢ ĐỊNH]` 15,00 USD | / triệu ký tự |
| Lambda | `[GIẢ ĐỊNH]` 0,0000166667 USD | / GB-giây |
| Lambda request | `[GIẢ ĐỊNH]` 0,20 USD | / triệu request |
| DynamoDB ghi (on-demand) | `[GIẢ ĐỊNH]` 1,25 USD | / triệu WRU |
| API Gateway HTTP API | `[GIẢ ĐỊNH]` 1,00 USD | / triệu request |

### 1.3 Tính chi phí / 1.000 giao dịch

Ký hiệu: N = 1.000 giao dịch.

- **Bedrock input:** 600 lần × 900 token = 540.000 token → 0,54 triệu × 3,00 = **1,620 USD**
- **Bedrock output:** 600 × 350 = 210.000 token → 0,21 triệu × 15,00 = **3,150 USD**
- **Rekognition DetectText:** 250 ảnh / 1.000 × 1,00 = **0,250 USD**
- **Rekognition CompareFaces:** 80 ảnh / 1.000 × 1,00 = **0,080 USD**
- **Translate:** 100 giao dịch × ~300 ký tự = 30.000 ký tự → 0,00003 triệu × 15,00 = **0,00045 USD** (≈ 0)
- **Lambda compute:** 1.000 × 0,4 s × (1024/1024) GB = 400 GB-giây × 0,0000166667 = **0,00667 USD**
- **Lambda + API requests:** 2.000 req / triệu × (0,20 + 1,00) = **0,0024 USD**
- **DynamoDB:** 2.000 WRU / triệu × 1,25 = **0,0025 USD**

| Khoản mục | Chi phí / 1.000 GD (USD) | Tỷ trọng |
|---|---|---|
| Bedrock (input + output) | 4,770 | ~92% |
| Rekognition (OCR + Face) | 0,330 | ~6% |
| Lambda + API Gateway | 0,0091 | <1% |
| DynamoDB | 0,0025 | <1% |
| Translate | ~0 | ~0% |
| **Tổng** | **≈ 5,11 USD / 1.000 GD** | 100% |

> **Chi phí biên ≈ 0,0051 USD/giao dịch (≈ 130 VNĐ/giao dịch)** theo giả định mẫu. Bedrock chi phối chi phí → đòn bẩy FinOps lớn nhất nằm ở tối ưu token.

## 2. Đòn bẩy tối ưu chi phí (FinOps)

| Đòn bẩy | Cơ chế | Tác động ước tính |
|---|---|---|
| **Định tuyến theo giá trị** | Giao dịch nhỏ/ít rủi ro dùng bộ luật, không gọi Bedrock | Giảm tỷ lệ gọi Bedrock 60% → 40% ⇒ giảm ~1/3 chi phí AI |
| **Prompt Caching** | Cache phần tĩnh (hướng dẫn, schema, ví dụ) | Giảm token input lặp lại |
| **Giới hạn `max_tokens` + nhiệt độ thấp** | `max_tokens ≤ 1024`, `temperature 0.1` | Giảm token output, kết quả ổn định |
| **Mô hình phân tầng** | Claude Haiku cho giao dịch nhỏ, Sonnet cho rủi ro cao | Giảm đơn giá/giao dịch trung bình |
| **Cắt gọn đầu vào** | Giới hạn độ dài lệnh/OCR ≤ 2.000 ký tự | Giảm token input, chống context overflow |
| **Offline Fallback** | Khi AWS lỗi/đắt đỏ, bộ luật gánh | Không phát sinh chi phí AI khi suy giảm |

## 3. ROI — So với thiệt hại lừa đảo ngăn chặn được

### 3.1 Giả định (chỉnh theo dữ liệu pilot)

| Tham số | Giá trị mẫu `[GIẢ ĐỊNH]` |
|---|---|
| Giá trị trung bình một giao dịch lừa đảo bị chặn | 8.000.000 VNĐ |
| Tỷ lệ giao dịch là lừa đảo (trong tổng) | 0,2% (2/1.000) |
| Tỷ lệ TrustPay AI chặn thành công trước khi mất tiền | 70% |
| Tỷ giá quy đổi | `[GIẢ ĐỊNH]` 25.000 VNĐ/USD |

### 3.2 Tính trên mỗi 1.000 giao dịch

- Số giao dịch lừa đảo: 1.000 × 0,2% = **2**
- Số bị chặn: 2 × 70% = **1,4**
- Thiệt hại ngăn được: 1,4 × 8.000.000 = **11.200.000 VNĐ ≈ 448 USD**
- Chi phí AWS: **≈ 5,11 USD**
- **ROI ≈ 448 / 5,11 ≈ 87×** (mỗi 1 USD chi cho hạ tầng AI bảo vệ ~87 USD giá trị rủi ro — theo giả định mẫu)

> Ngay cả khi giảm mạnh các giả định (giá trị lừa đảo 3 triệu, tỷ lệ chặn 40%, tỷ lệ lừa đảo 0,1%), giá trị ngăn được vẫn ≈ 48 USD/1.000 GD, ROI ≈ 9× — vẫn dương rõ rệt.

## 4. Chi phí cố định hằng tháng (ước tính mẫu)

| Khoản | Ghi chú | `[GIẢ ĐỊNH]` USD/tháng |
|---|---|---|
| VPC Endpoints (Interface) | ~6 endpoint × phí giờ | 50–120 |
| KMS CMK | theo khóa + lượt gọi | 1–10 |
| CloudWatch (logs, dashboard, alarms) | theo dung lượng | 10–50 |
| S3 (ảnh bằng chứng) | theo dung lượng + lifecycle | 5–30 |
| **Tổng cố định** | | **~70–210** |

AWS Budgets đặt cảnh báo ở 80% và dự báo 100% (xem `infra/lib/observability-finops-stack.ts`).

## 5. Điểm hòa vốn & mở rộng

- Với chi phí biên ~0,0051 USD/GD, ở **1 triệu giao dịch/tháng**, chi phí biến đổi ≈ **5.110 USD** + cố định ~210 USD.
- Kiến trúc serverless (Lambda, DynamoDB on-demand) → **chi phí tỉ lệ thuận lưu lượng**, không trả cho công suất nhàn rỗi.
- Khi đạt quy mô lớn, cân nhắc **Provisioned Throughput/Savings Plans** cho Lambda và cam kết Bedrock để giảm đơn giá.

## 6. Cách cập nhật mô hình

1. Mở AWS Pricing Calculator cho region triển khai (vd `ap-southeast-1`).
2. Thay các ô `[GIẢ ĐỊNH]` bằng đơn giá thực.
3. Thay giả định lưu lượng/token bằng số đo thực từ CloudWatch (metric `BedrockInputTokens`, `FallbackRate`).
4. Chạy lại các phép tính ở mục 1.3 và 3.2.

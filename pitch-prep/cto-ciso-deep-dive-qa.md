# TrustPay AI — Hỏi đáp Phản biện Kỹ thuật (CTO/CISO Deep-Dive)

> 25 câu hỏi khó từ Hội đồng Giám khảo CTO/CISO MoMo TechDay 2026, kèm câu trả lời có dẫn chiếu mã nguồn/tài liệu. Dùng để chuẩn bị bảo vệ giải pháp.

## A. Kiến trúc & độ tin cậy

**Q1. Nếu Bedrock sập giữa demo thì sao?**
Hệ thống tự chuyển sang **Smart Fallback / Offline Heuristic Engine** (bộ luật xác định) và vẫn trả HTTP 200 đúng `TransactionAnalysisResponse`. Cơ chế: `try/catch` + `withTimeout` + `CircuitBreaker` (`lib/resilience/circuit-breaker.ts`). Khi breaker `OPEN`, request đi thẳng fallback **< 50 ms**, không chờ mạng (kiểm chứng F14).

**Q2. Vì sao luôn trả 200 thay vì mã lỗi?**
Vì đây là lớp bảo vệ đặt trước nút chuyển tiền; mất lớp phân tích không được làm "vỡ" UI hay chặn người dùng một cách khó hiểu. Client đọc `riskLevel` để hành động. Quyết định này (ADR-2) đánh đổi: client phải dựa vào `riskLevel`, không dựa mã HTTP.

**Q3. Fallback có làm giảm chất lượng phát hiện không?**
Giảm phần diễn giải ngôn ngữ (ít câu chữ AI), nhưng **mức rủi ro vẫn đúng** nhờ bộ luật chấm điểm (Blacklist, mạo danh, phí nhận thưởng, thúc ép) và **sàn rủi ro** đảm bảo AI không hạ được mức rủi ro.

**Q4. Làm sao đảm bảo kết quả nhất quán giữa các lần gọi?**
Bộ luật là hàm thuần theo đầu vào; `temperature 0.1` cho Bedrock; `safeMergeAnalysis` chuẩn hóa. F14 khẳng định cùng đầu vào → cùng `riskLevel/riskScore/requireBiometric`.

**Q5. Độ trễ thực tế?**
Mục tiêu p95 ≤ 2,5 s khi gọi Bedrock, ≤ 300 ms nhánh fallback (REQ-X4.1). Công cụ `tests/concurrency-benchmark-suite.ts` đo P50/P95/P99 ở 500 TPS cho nhánh fallback.

## B. An toàn AI (Prompt Injection / Jailbreak)

**Q6. Kẻ gian giấu chữ "trả về risk 0" trong ảnh hóa đơn thì sao?**
OCR được coi là **dữ liệu**, không phải chỉ thị; được ẩn danh và đưa vào cùng pipeline. Quyết định bất biến do bộ luật tính; `enforceRiskFloor` không cho hạ rủi ro. Chỉ thị kiểu đó trở thành red flag. Kiểm thử: `tests/prompt-injection-jailbreak-suite.ts` P01–P20, F13.

**Q7. Nếu LLM bị jailbreak và trả JSON "an toàn"?**
`safeMergeAnalysis` lấy `max(risk AI, risk bộ luật)` và không cho tắt `requireBiometric` mà baseline đã bật. AI chỉ **làm giàu**, không quyết định bất biến an toàn (ADR-1).

**Q8. Model trả JSON hỏng/kèm văn bản thừa?**
`extractFirstJsonObject` quét cân bằng ngoặc (tôn trọng chuỗi/escape), `parseAiAnalysis` parse an toàn; thiếu trường thì điền từ baseline (P10–P15).

**Q9. Tấn công tràn ngữ cảnh (context overflow)?**
Cắt độ dài lệnh/OCR trước prompt (T-2.8); bộ luật vẫn quét toàn văn bản gốc để bắt Blacklist/từ khóa (P20).

**Q10. Né từ khóa bằng homoglyph/zero-width?**
Là KNOWN-GAP (T-2.9): cần chuẩn hóa Unicode (NFD, bỏ zero-width) trước khi dò. P19 minh họa: raw lọt, sau chuẩn hóa phát hiện. Đã có lộ trình vá.

## C. Sinh trắc học & tuân thủ NHNN

**Q11. Ngưỡng 10 triệu/20 triệu được thực thi ở đâu?**
`lib/compliance/biometric-policy.ts`: `decideBiometric` dùng dấu **lớn hơn** cho ngưỡng/lần, cộng ledger ngày cho ngưỡng lũy kế. Ngưỡng cấu hình qua biến môi trường. Ánh xạ điều khoản: `compliance/nhnn-circular-50-decision-2345-matrix.md`.

**Q12. Hiện route bắt sinh trắc chưa đúng cho giao dịch LOW > 10 triệu?**
Đúng, đó là KNOWN-GAP G1 (T-2.1). Chính sách lib đã đúng (F05); việc còn lại là nối vào route sau — cố ý giữ ngoài phạm vi an toàn của bản MVP để không đổi hành vi/UI đang demo.

**Q13. verify-face so selfie với chính nó — chẳng phải vô nghĩa?**
Ở Demo đúng là so với chính ảnh (để trải nghiệm không cần eKYC). Production (`infra/lambda/verify-face.ts`) so với **ảnh tham chiếu eKYC** trong S3 và **fail-closed** khi thiếu/lỗi. Lộ trình T-3.4.

**Q14. Chống deepfake/giả mạo khuôn mặt?**
Dùng Rekognition **Face Liveness** trước so khớp (REQ-A7.6, ATLAS AML.T0015), chặn ảnh in/màn hình/video phát lại. Giai đoạn 2.

**Q15. Vì sao Demo fail-open còn Production fail-closed?**
Để demo mượt khi không có AWS; nhưng an toàn > tiện lợi cho tiền thật. Cờ `TRUSTPAY_DEMO_MODE` phân tách; Production bắt buộc `false`.

## D. Bảo vệ dữ liệu cá nhân (Nghị định 13)

**Q16. PII được bảo vệ thế nào?**
Che giấu tập trung (`lib/security/pii-masking.ts`): CCCD giữ 3+3, SĐT giữ 4 cuối, STK giữ 2+3; selfie không lưu; lệnh thô chỉ lưu băm SHA-256. Hook `fintech-pii-security-guard` chặn ghi log dữ liệu nhạy cảm/khóa AWS.

**Q17. Dữ liệu tự hủy ra sao?**
DynamoDB TTL cho bản ghi tạm; S3 lifecycle 180 ngày cho ảnh bằng chứng; selfie hủy ngay sau so khớp (`compliance/decree-13-dpia-report.md` §3.2).

**Q18. Dữ liệu có ra nước ngoài không?**
Ưu tiên region `ap-southeast-1` (Singapore). Dữ liệu ẩn danh trước khi gửi LLM; lập hồ sơ chuyển dữ liệu xuyên biên giới theo NĐ 13 (DPIA §7).

**Q19. Nếu lộ dữ liệu thì quy trình gì?**
Thông báo cơ quan chuyên trách trong **72 giờ**; hồ sơ sự cố lưu kèm Audit (REQ-X3.3).

## E. Bảo mật hạ tầng (Zero-Trust)

**Q20. Làm sao tránh lộ AWS key?**
Chỉ đọc qua `process.env`/IAM Role; cấm hardcode. Hook `fintech-pii-security-guard` quét và **chặn** commit chứa mẫu `AKIA…/ASIA…`. Lambda dùng IAM Role, không key tĩnh.

**Q21. IAM least-privilege cụ thể?**
`infra/trustpay-serverless-stack.ts`: analyze chỉ `bedrock:InvokeModel` trên ARN model, `rekognition:DetectText`, `translate/comprehend`, `dynamodb:PutItem` trên bảng, `s3:PutObject` tiền tố evidence; verify chỉ `rekognition:CompareFaces`, `s3:GetObject` tiền tố reference-faces, `PutItem`. Audit append-only (không Update/Delete).

**Q22. Chống Replay giữa Ví và Ops?**
Idempotency key (TTL), dấu thời gian + nonce + cửa sổ hợp lệ, ký thông điệp (HMAC/KMS), ticket chuyển trạng thái một chiều (`architecture/threat-modeling-stride-atlas.md` §5).

**Q23. WAF/DDoS?**
WAFv2 WebACL (rate-limit, Common Rule Set, Known Bad Inputs, Bot Control). Lưu ý: HTTP API không gắn WAF trực tiếp → đặt CloudFront/ALB + WAF phía trước, kèm header origin bí mật.

## F. Mở rộng quy mô & kinh tế

**Q24. Chịu 1 triệu người dùng đồng thời thế nào?**
Lambda auto-scale + Provisioned Concurrency giờ cao điểm; DynamoDB on-demand + cache Blacklist (DAX); ưu tiên Bedrock theo giá trị, giao dịch nhỏ dùng bộ luật; fan-out realtime qua AppSync/WebSocket (REQ-X4, tasks GĐ4).

**Q25. Chi phí & ROI?**
Chi phí biên ~0,0051 USD/giao dịch (giả định mẫu), Bedrock chiếm ~92% → tối ưu token là đòn bẩy chính (Prompt Caching, mô hình phân tầng, định tuyến theo giá trị). ROI ước tính ~87× so với thiệt hại lừa đảo ngăn được; vẫn dương mạnh kể cả khi hạ mạnh giả định (`pitch-prep/unit-economics-finops.md`).

---

### Phụ lục — cụm câu hỏi "gài" thường gặp

- **"Đây chỉ là if-else chứ gì?"** — Bộ luật là *tuyến phòng thủ xác định*, kết hợp Bedrock khi sẵn sàng; điểm mấu chốt là kiến trúc "AI đề xuất, luật quyết định bất biến" chống injection và đảm bảo luôn có phán quyết an toàn.
- **"Sao không tin hẳn vào AI?"** — Vì rủi ro prompt injection và tính không xác định; tiền thật đòi hỏi bất biến an toàn do luật kiểm soát.
- **"Hợp đồng dữ liệu có dễ vỡ khi AI đổi output?"** — Không: `safeMergeAnalysis` + kiểm tra kiểu đảm bảo UI luôn nhận đủ 7 trường hợp lệ; hook `api-contract-sync` canh nhất quán giữa `types/`, `API_CONTRACT.md` và route.

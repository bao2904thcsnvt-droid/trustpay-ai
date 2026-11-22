# TrustPay AI — Đặc tả Yêu cầu (Requirements Specification)

> **Phiên bản:** 1.0 · **Ngày:** 22/11/2026 · **Trạng thái:** Baseline cho MVP Hackathon MoMo TechDay 2026 và lộ trình Production
> **Nguồn sự thật về kiểu dữ liệu:** `types/trustpay.ts` · **Hợp đồng API:** `API_CONTRACT.md`
> **Tài liệu liên quan:** `design.md` (kiến trúc), `tasks.md` (WBS), `tests/fraud-adversarial-suite.ts` (kiểm thử đối kháng)

---

## 1. Giới thiệu

TrustPay AI là ví thanh toán thông minh đặt một **Lá Chắn AI** giữa người dùng và nút "Chuyển tiền". Mỗi lệnh chuyển tiền (văn bản tự nhiên, có thể kèm ảnh hóa đơn hoặc tin nhắn) được bóc tách, chấm điểm rủi ro lừa đảo và đối chiếu ngân sách **trước khi** tiền rời ví. Giao dịch rủi ro được đồng bộ thời gian thực sang **Fintech Future Workspace (Ops)** để chuyên viên rủi ro chặn hoặc phê duyệt, và quyết định của Ops quay ngược lại làm giàu Danh sách đen (Blacklist) cho Ví.

Tài liệu này đặc tả yêu cầu cho 2 phân hệ:

| Mã | Phân hệ | Thành phần hiện có trong mã nguồn |
|---|---|---|
| **A** | Ví Người Dùng & Lá Chắn AI | `app/page.tsx` (Tab 1), `components/user-wallet/*`, `components/BiometricModal.tsx`, `app/api/analyze/route.ts`, `app/api/verify-face/route.ts` |
| **B** | Fintech Future Workspace (Ops) | `app/page.tsx` (Tab 2), `components/fintech-ops/FraudOpsDashboard.tsx` |
| **X** | Yêu cầu xuyên suốt (bảo mật, tuân thủ, hiệu năng, vận hành) | `infra/`, `.kiro/steering/`, `.kiro/hooks/`, `tests/` |

### 1.1 Phạm vi

- **Trong phạm vi:** phân tích lệnh chuyển tiền, OCR ảnh, chấm điểm rủi ro, kiểm soát ngân sách, xác thực sinh trắc học khuôn mặt, hàng đợi ticket Ops, Blacklist 2 chiều, lưu vết kiểm toán, cơ chế Offline Fallback, hạ tầng AWS Serverless.
- **Ngoài phạm vi MVP:** hạch toán thật với core banking/NAPAS, eKYC mở tài khoản, đối soát chip CCCD qua C06/VNeID, ứng dụng di động native. Các mục này nằm trong lộ trình Production (`tasks.md`, Giai đoạn 2–4).

### 1.2 Cơ sở pháp lý được tham chiếu

| Mã | Văn bản | Nội dung áp dụng cho TrustPay AI |
|---|---|---|
| **LG-01** | Quyết định 2345/QĐ-NHNN (18/12/2023) về giải pháp an toàn, bảo mật trong thanh toán trực tuyến và thanh toán thẻ ngân hàng | Xác thực sinh trắc học khuôn mặt cho giao dịch chuyển tiền trực tuyến **trên 10.000.000 VNĐ/lần** hoặc khi **tổng giá trị trong ngày vượt 20.000.000 VNĐ**; đối chiếu với dữ liệu sinh trắc học đã xác minh của khách hàng |
| **LG-02** | Thông tư 50/2024/TT-NHNN (31/12/2024) quy định về an toàn, bảo mật cho việc cung cấp dịch vụ trực tuyến trong ngành Ngân hàng | Mở rộng yêu cầu xác thực mạnh và sinh trắc học cho các tổ chức cung ứng dịch vụ trung gian thanh toán (bao gồm **ví điện tử**); quản lý thiết bị, phiên đăng nhập và cảnh báo giao dịch bất thường |
| **LG-03** | Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân | Số CCCD/định danh cá nhân là **dữ liệu cá nhân cơ bản**; dữ liệu sinh trắc học và dữ liệu tài khoản/giao dịch là **dữ liệu cá nhân nhạy cảm**. Bắt buộc: sự đồng ý của chủ thể, tối thiểu hóa, che giấu (masking), mã hóa, hồ sơ đánh giá tác động xử lý dữ liệu, thông báo vi phạm trong 72 giờ |
| **LG-04** | Luật Bảo vệ dữ liệu cá nhân 2025 (có hiệu lực từ 01/01/2026) | Nâng các nguyên tắc của LG-03 lên cấp luật; TrustPay AI áp dụng mức kiểm soát cao nhất giữa LG-03 và LG-04 |

> **Lưu ý pháp chế:** Ngưỡng và điều khoản trên được tổng hợp phục vụ thiết kế kỹ thuật. Trước khi vận hành thật, bộ phận Pháp chế & Tuân thủ phải đối chiếu điều khoản gốc và các văn bản sửa đổi, bổ sung mới nhất. Mọi ngưỡng trong hệ thống được cấu hình qua biến môi trường để cập nhật mà không cần phát hành lại mã.

### 1.3 Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| **Lá Chắn AI (AI Shield)** | Dịch vụ `/api/analyze`: bóc tách giao dịch, chấm điểm rủi ro, cảnh báo ngân sách |
| **Bộ máy dự phòng (Smart Fallback Engine)** | Bộ luật xác định (rule-based) trong `app/api/analyze/route.ts`, trả về cùng schema khi AWS không khả dụng |
| **Offline Fallback / Demo Mode** | Trạng thái hệ thống chạy không cần AWS credentials, luôn trả HTTP 200 đúng hợp đồng |
| **riskScore / riskLevel** | Điểm rủi ro 0–100 và mức `LOW` (< 40), `MEDIUM` (40–69), `HIGH` (≥ 70) |
| **Step-up Authentication** | Yêu cầu xác thực sinh trắc học bổ sung trước khi cho phép chuyển tiền |
| **Ticket Ops** | Bản ghi `FintechOpsTicket` với trạng thái `PENDING` → `BLOCKED` hoặc `APPROVED` |
| **Blacklist** | Danh sách STK/tên đối tượng lừa đảo, dùng chung giữa Ví và Ops |
| **PII** | Dữ liệu định danh cá nhân (số CCCD, số điện thoại, STK, ảnh khuôn mặt) |
| **Audit Trail** | Nhật ký kiểm toán chỉ ghi thêm (append-only) trên DynamoDB |

### 1.4 Quy ước EARS

Mỗi tiêu chí chấp nhận được viết theo mẫu **EARS (Easy Approach to Requirements Syntax)** và gắn nhãn loại:

| Nhãn | Mẫu câu | Ý nghĩa |
|---|---|---|
| **[U] Ubiquitous** | Hệ thống **SẼ** … | Luôn đúng, không cần điều kiện kích hoạt |
| **[E] Event-driven** | **KHI** <sự kiện>, hệ thống **SẼ** … | Phản ứng với một sự kiện |
| **[S] State-driven** | **TRONG KHI** <trạng thái>, hệ thống **SẼ** … | Áp dụng suốt thời gian một trạng thái còn hiệu lực |
| **[UW] Unwanted behavior** | **NẾU** <tình huống không mong muốn>, **THÌ** hệ thống **SẼ** … | Xử lý lỗi, tấn công, sự cố |
| **[O] Optional** | **TẠI NƠI** <tính năng được bật>, hệ thống **SẼ** … | Chỉ áp dụng khi tính năng/cấu hình được kích hoạt |

Mỗi tiêu chí có mã `REQ-<Phân hệ><Số>.<Số>` để truy vết sang `design.md`, `tasks.md` và bộ kiểm thử `tests/fraud-adversarial-suite.ts` (mã `F01`–`F15`, `C01`–`C04`).

Cột **Trạng thái MVP** trong ma trận truy vết (mục 5) cho biết tiêu chí đã được mã nguồn hiện tại đáp ứng (`ĐÃ ĐÁP ỨNG`) hay là khoảng trống đã biết (`KNOWN-GAP`) được bộ kiểm thử phát hiện và có task khắc phục.

---

## 2. Phân hệ A — Ví Người Dùng & Lá Chắn AI

### REQ-A1. Bóc tách lệnh chuyển tiền bằng ngôn ngữ tự nhiên

**User Story:** Là người dùng ví, tôi muốn gõ lệnh chuyển tiền như nhắn tin, để không phải điền biểu mẫu nhiều bước.

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A1.1 | [E] | **KHI** người dùng gửi `TransactionAnalysisRequest` tới `POST /api/analyze`, Lá Chắn AI **SẼ** trả về `TransactionAnalysisResponse` với HTTP 200 chứa đủ 7 trường bắt buộc: `parsedAmount`, `recipient`, `category`, `budgetAlert`, `scamReport`, `requireBiometric`, `fintechOpsTicket`. |
| A1.2 | [U] | Lá Chắn AI **SẼ** nhận diện số tiền ở các định dạng `45k`, `50 nghìn`, `2.5 triệu`, `5tr`, `5 củ`, `12.000.000đ`, `2,500,000` và `500000đ`, quy đổi về số nguyên VNĐ. |
| A1.3 | [U] | Lá Chắn AI **SẼ** ưu tiên bóc tách người nhận theo thứ tự: mẫu `cho <Tên> STK <Số>` → `STK/số tài khoản/tài khoản <Số>` → mục Blacklist xuất hiện trong lệnh → cụm sau giới từ `cho/tại/tới/đến`. |
| A1.4 | [U] | Lá Chắn AI **SẼ** phân loại giao dịch vào đúng một trong 4 danh mục `Ăn uống`, `Mua sắm`, `Di chuyển`, `Khác` (kiểu `CategoryName`). |
| A1.5 | [UW] | **NẾU** không xác định được người nhận, **THÌ** Lá Chắn AI **SẼ** trả `recipient = "Người nhận chưa xác định"` thay vì để trống. |
| A1.6 | [UW] | **NẾU** body yêu cầu không phải JSON hợp lệ, **THÌ** Lá Chắn AI **SẼ** dùng ngân sách và Blacklist mặc định và vẫn trả HTTP 200 đúng schema. |
| A1.7 | [UW] | **NẾU** `currentBudgets` hoặc `blacklist` rỗng, **THÌ** Lá Chắn AI **SẼ** dùng `DEFAULT_BUDGETS` và `DEFAULT_BLACKLIST`. |

### REQ-A2. Phân tích bằng chứng hình ảnh (OCR) và hóa đơn giả mạo

**User Story:** Là người dùng, tôi muốn tải ảnh hóa đơn hoặc tin nhắn nghi vấn, để AI đọc nội dung và phát hiện dấu hiệu giả mạo.

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A2.1 | [E] | **KHI** yêu cầu có `imageBase64`, Lá Chắn AI **SẼ** gọi Amazon Rekognition `DetectText` và ghép các dòng văn bản (`Type = LINE`) vào ngữ cảnh phân tích. |
| A2.2 | [E] | **KHI** yêu cầu có `imageBase64`, Lá Chắn AI **SẼ** đính kèm ảnh vào `fintechOpsTicket.evidenceImageBase64` để Ops dùng làm bằng chứng. |
| A2.3 | [U] | Giao diện **SẼ** chỉ chấp nhận tệp `image/*` dung lượng ≤ 5 MB. |
| A2.4 | [UW] | **NẾU** OCR thất bại (ảnh mờ, quota, timeout), **THÌ** Lá Chắn AI **SẼ** bỏ qua OCR và tiếp tục phân tích bằng văn bản lệnh, không trả lỗi cho người dùng. |
| A2.5 | [E] | **KHI** lệnh là hoàn tiền/chuyển trả "chuyển dư" dựa trên ảnh hóa đơn, Lá Chắn AI **SẼ** nâng rủi ro tối thiểu lên `MEDIUM` và khuyến nghị xác minh giao dịch đến thực tế trong lịch sử ví trước khi hoàn tiền. |
| A2.6 | [O] | **TẠI NƠI** bật phân tích đa phương thức (Bedrock multimodal), Lá Chắn AI **SẼ** kiểm tra dấu hiệu chỉnh sửa ảnh (font lệch, mã giao dịch sai định dạng, thời gian không khớp) và ghi vào `redFlags`. |

### REQ-A3. Chấm điểm rủi ro lừa đảo

**User Story:** Là người dùng, tôi muốn biết giao dịch có dấu hiệu lừa đảo hay không kèm lời giải thích dễ hiểu, để quyết định có chuyển tiền hay không.

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A3.1 | [U] | Lá Chắn AI **SẼ** trả `scamReport.riskScore` là số nguyên trong khoảng [0, 100] và `riskLevel` suy ra nhất quán: `HIGH` khi ≥ 70, `MEDIUM` khi 40–69, `LOW` khi < 40. |
| A3.2 | [U] | `scamReport.redFlags` **SẼ** luôn có ít nhất 1 phần tử; với giao dịch an toàn, phần tử đó nêu rõ không phát hiện dấu hiệu lừa đảo. |
| A3.3 | [E] | **KHI** lệnh chứa dấu hiệu mạo danh cơ quan chức năng (công an, cán bộ điều tra, viện kiểm sát, tòa án, "xác minh tài khoản", "phong tỏa", "lệnh bắt") **kèm** yếu tố thúc ép hoặc Blacklist, Lá Chắn AI **SẼ** xếp `riskLevel = HIGH`. |
| A3.4 | [E] | **KHI** lệnh yêu cầu nộp phí để nhận thưởng, quà, bưu kiện quốc tế hoặc phí hải quan, Lá Chắn AI **SẼ** xếp `riskLevel = HIGH`. |
| A3.5 | [E] | **KHI** lệnh yêu cầu cài ứng dụng hoặc truy cập đường link lạ (giả mạo VNeID, ứng dụng Bộ Công an, ứng dụng ngân hàng), Lá Chắn AI **SẼ** thêm red flag riêng về nguy cơ mã độc chiếm quyền điều khiển thiết bị. |
| A3.6 | [E] | **KHI** lệnh thuộc kịch bản "việc nhẹ lương cao", nạp tiền làm nhiệm vụ nhận hoa hồng, đầu tư lợi nhuận bất thường, Lá Chắn AI **SẼ** xếp tối thiểu `riskLevel = MEDIUM`. |
| A3.7 | [U] | `scamReport.explanation` **SẼ** được viết bằng tiếng Việt, không dùng thuật ngữ kỹ thuật, và nêu hành động khuyến nghị. |
| A3.8 | [UW] | **NẾU** đầu ra của mô hình AI hạ mức rủi ro thấp hơn mức do bộ luật xác định (Blacklist, mạo danh, phí nhận thưởng) tính ra, **THÌ** Lá Chắn AI **SẼ** giữ mức rủi ro cao hơn (nguyên tắc "sàn rủi ro" chống prompt injection). |

### REQ-A4. Danh sách đen (Blacklist)

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A4.1 | [E] | **KHI** STK hoặc tên người nhận trong lệnh khớp (không phân biệt hoa thường) một mục Blacklist, Lá Chắn AI **SẼ** cộng điểm rủi ro, xếp `HIGH` và ghi mục khớp vào `redFlags`. |
| A4.2 | [E] | **KHI** Ops chặn một ticket, hệ thống **SẼ** thêm người nhận của ticket vào Blacklist và giao dịch kế tiếp tới **cùng STK** **SẼ** bị xếp `HIGH`. |
| A4.3 | [U] | Hệ thống **SẼ** chuẩn hóa mục Blacklist về khóa so khớp (STK chỉ gồm chữ số; tên đã bỏ khoảng trắng thừa) để mục dạng `Tên (STK)` vẫn khớp với lệnh `cho Tên STK <Số>`. |

### REQ-A5. Kiểm soát ngân sách

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A5.1 | [U] | Lá Chắn AI **SẼ** tính `budgetAlert.remainingAfter = limit − spent − parsedAmount` của danh mục được phân loại. |
| A5.2 | [E] | **KHI** `remainingAfter < 0`, Lá Chắn AI **SẼ** đặt `isExceeded = true`, nêu số tiền vượt trong `message` và đưa gợi ý trì hoãn hoặc điều chỉnh hạn mức. |
| A5.3 | [E] | **KHI** người dùng xác nhận chuyển tiền thành công, Ví **SẼ** trừ số dư và cộng `spent` của danh mục tương ứng. |
| A5.4 | [UW] | **NẾU** số tiền ≤ 0 hoặc lớn hơn số dư khả dụng, **THÌ** Ví **SẼ** vô hiệu hóa nút xác nhận và hiển thị cảnh báo. |

### REQ-A6. Xác thực sinh trắc học bắt buộc (LG-01, LG-02)

**User Story:** Là ví điện tử tuân thủ NHNN, chúng tôi phải xác thực khuôn mặt cho giao dịch giá trị lớn hoặc rủi ro cao, để chặn kẻ gian chiếm quyền tài khoản.

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A6.1 | [E] | **KHI** `riskLevel = HIGH`, Lá Chắn AI **SẼ** đặt `requireBiometric = true` và Ví **SẼ** khóa nút chuyển tiền cho tới khi xác thực khuôn mặt thành công. |
| A6.2 | [E] | **KHI** `parsedAmount > 10.000.000 VNĐ` (ngưỡng cấu hình `BIOMETRIC_SINGLE_TXN_THRESHOLD_VND`), Lá Chắn AI **SẼ** đặt `requireBiometric = true` bất kể `riskLevel`. |
| A6.3 | [U] | Giao dịch có `parsedAmount` đúng bằng 10.000.000 VNĐ **SẼ** không bị bắt buộc sinh trắc học chỉ vì giá trị (quy định áp dụng cho giá trị **trên** ngưỡng). |
| A6.4 | [E] | **KHI** tổng giá trị chuyển trong ngày (theo múi giờ Asia/Ho_Chi_Minh) cộng giao dịch hiện tại vượt 20.000.000 VNĐ, hệ thống **SẼ** đặt `requireBiometric = true` (yêu cầu sổ cái phía máy chủ, Giai đoạn 2). |
| A6.5 | [E] | **KHI** người dùng thực hiện giao dịch đầu tiên trên thiết bị mới, hệ thống **SẼ** yêu cầu xác thực sinh trắc học (Giai đoạn 2). |
| A6.6 | [S] | **TRONG KHI** `requireBiometric = true` và chưa xác thực thành công, Ví **SẼ** chỉ hiển thị 2 hành động: "Xác thực khuôn mặt" và "Hủy giao dịch". |

### REQ-A7. Đối chiếu khuôn mặt (Amazon Rekognition)

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A7.1 | [E] | **KHI** nhận `VerifyFaceRequest`, dịch vụ `/api/verify-face` **SẼ** gọi Rekognition `CompareFaces` giữa ảnh selfie và **ảnh tham chiếu đã đăng ký** của chủ tài khoản. |
| A7.2 | [U] | Dịch vụ **SẼ** trả `matched = true` chỉ khi `similarity ≥ FACE_SIMILARITY_THRESHOLD` (mặc định 80 ở Demo, khuyến nghị ≥ 90 ở Production). |
| A7.3 | [UW] | **NẾU** Rekognition trả về danh sách `FaceMatches` rỗng, **THÌ** dịch vụ **SẼ** trả `matched = false` và `similarity` bằng 0 hoặc độ tương đồng thực tế cao nhất. |
| A7.4 | [UW] | **NẾU** ảnh không có khuôn mặt, quá mờ, có nhiều khuôn mặt hoặc dịch vụ AWS lỗi, **THÌ** ở chế độ Production dịch vụ **SẼ** trả `matched = false` (fail-closed) kèm hướng dẫn chụp lại. |
| A7.5 | [O] | **TẠI NƠI** bật `TRUSTPAY_DEMO_MODE=true`, dịch vụ **SẼ** được phép trả kết quả Demo (`matched = true`, `similarity = 98.4`) khi thiếu credentials, và thông điệp **SẼ** ghi rõ "Demo Mode". |
| A7.6 | [O] | **TẠI NƠI** bật Rekognition Face Liveness, dịch vụ **SẼ** từ chối ảnh chụp màn hình, ảnh in, video phát lại và deepfake trước khi so khớp. |
| A7.7 | [U] | Ảnh selfie **SẼ** chỉ tồn tại trong bộ nhớ trong thời gian xử lý; không ghi log, không lưu đĩa, không đưa vào Audit Trail. |

### REQ-A8. Hủy giao dịch và trạng thái giao dịch

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A8.1 | [E] | **KHI** người dùng chọn "Hủy giao dịch", Ví **SẼ** giữ nguyên số dư và ngân sách, đặt trạng thái `cancelled` và thông báo hủy an toàn. |
| A8.2 | [E] | **KHI** người dùng bấm "Reset dữ liệu Demo", Ví **SẼ** khôi phục số dư 15.000.000đ, ngân sách, Blacklist và ticket mặc định. |

### REQ-A9. Khả năng tự phục hồi (Offline Fallback & Graceful Degradation)

**User Story:** Là ban tổ chức demo và là nhà vận hành, chúng tôi cần Lá Chắn AI luôn phản hồi đúng hợp đồng kể cả khi AWS gián đoạn.

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| A9.1 | [S] | **TRONG KHI** thiếu `AWS_ACCESS_KEY_ID` hoặc `AWS_SECRET_ACCESS_KEY`, cả hai API **SẼ** chạy Offline Fallback và trả HTTP 200 đúng schema. |
| A9.2 | [UW] | **NẾU** Bedrock, Rekognition hoặc Translate trả lỗi (throttling, quota, quyền, 5xx), **THÌ** API **SẼ** chuyển sang Smart Fallback Engine và trả HTTP 200 đúng schema. |
| A9.3 | [UW] | **NẾU** Bedrock trả văn bản không phải JSON hoặc JSON thiếu trường, **THÌ** API **SẼ** trộn (merge) với kết quả của bộ luật để mọi trường bắt buộc đều có giá trị hợp lệ. |
| A9.4 | [UW] | **NẾU** một lệnh gọi AWS vượt ngân sách thời gian (Bedrock 4 s, Rekognition 2,5 s, Translate 1,5 s), **THÌ** API **SẼ** hủy lệnh gọi và dùng kết quả dự phòng sao cho tổng thời gian phản hồi p99 ≤ 6 s. |
| A9.5 | [S] | **TRONG KHI** Circuit Breaker của một dịch vụ AWS ở trạng thái `OPEN`, API **SẼ** bỏ qua dịch vụ đó và đi thẳng nhánh dự phòng. |
| A9.6 | [U] | Kết quả dự phòng **SẼ** cho cùng mức rủi ro và cùng quyết định `requireBiometric` với cùng một đầu vào (tính xác định). |

---

## 3. Phân hệ B — Fintech Future Workspace (Ops)

### REQ-B1. Hàng đợi ticket thời gian thực

**User Story:** Là chuyên viên rủi ro, tôi muốn thấy ngay giao dịch nghi vấn kèm tóm tắt AI, để xử lý trước khi tiền bị chuyển đi.

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| B1.1 | [E] | **KHI** Lá Chắn AI trả `riskLevel` là `MEDIUM` hoặc `HIGH`, hệ thống **SẼ** đẩy một `FintechOpsTicket` trạng thái `PENDING` lên đầu hàng đợi Ops và tăng badge đếm cảnh báo. |
| B1.2 | [U] | Mỗi ticket **SẼ** có `ticketId` dạng `TCK-YYYYMMDD-NNN`, `timestamp` ISO 8601, cùng `recipient`, `amount`, `riskLevel`, `riskScore` khớp với phân tích gốc. |
| B1.3 | [E] | **KHI** ticket có cùng `ticketId` được đẩy lại, hệ thống **SẼ** thay thế bản cũ thay vì tạo bản trùng. |
| B1.4 | [U] | Dashboard **SẼ** hiển thị 3 KPI: số ticket `PENDING`, số ticket `BLOCKED` kèm kích thước Blacklist, tổng tiền rủi ro đã bảo vệ (tổng `amount` của ticket `BLOCKED`). |
| B1.5 | [U] | Dashboard **SẼ** cho phép lọc ticket theo `ALL`, `PENDING`, `BLOCKED`, `APPROVED`. |

### REQ-B2. Quyết định của Ops và đồng bộ 2 chiều

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| B2.1 | [E] | **KHI** chuyên viên chọn "Chặn & Thêm vào Blacklist", hệ thống **SẼ** chuyển ticket sang `BLOCKED` và thêm người nhận vào Blacklist hiển thị ở cả Tab 1 và Tab 2 trong cùng phiên. |
| B2.2 | [E] | **KHI** chuyên viên chọn "Phê duyệt an toàn", hệ thống **SẼ** chuyển ticket sang `APPROVED` và không thay đổi Blacklist. |
| B2.3 | [S] | **TRONG KHI** ticket ở trạng thái `BLOCKED` hoặc `APPROVED`, Dashboard **SẼ** ẩn các nút hành động và chỉ hiển thị kết luận. |
| B2.4 | [UW] | **NẾU** người nhận đã có trong Blacklist, **THÌ** hệ thống **SẼ** không thêm bản trùng (so khớp không phân biệt hoa thường). |
| B2.5 | [E] | **KHI** một ticket chuyển trạng thái, hệ thống **SẼ** phát sự kiện `TicketStatusChanged` lên Amazon EventBridge để Ví, Audit Trail và kênh thông báo cùng nhận (Giai đoạn 2). |

### REQ-B3. Bằng chứng và quyền riêng tư phía Ops (LG-03, LG-04)

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| B3.1 | [E] | **KHI** ticket có ảnh bằng chứng, Dashboard **SẼ** hiển thị ảnh thu nhỏ và cho phép phóng to trong modal. |
| B3.2 | [U] | Trường văn bản hiển thị cho Ops (`recipient`, `summary`) **SẼ** không chứa số CCCD đầy đủ; số CCCD 12 chữ số **SẼ** được che còn tối đa 3 số đầu và 3 số cuối (ví dụ `001******567`). |
| B3.3 | [O] | **TẠI NƠI** lưu ảnh bằng chứng bền vững, hệ thống **SẼ** lưu vào S3 mã hóa SSE-KMS, làm mờ vùng số CCCD/khuôn mặt bằng tọa độ từ Rekognition trước khi lưu, và ticket chỉ giữ khóa tham chiếu cùng URL ký trước hết hạn ≤ 5 phút. |
| B3.4 | [U] | Mọi lượt xem ảnh bằng chứng **SẼ** được ghi vào Audit Trail (ai, lúc nào, ticket nào). |

### REQ-B4. Lưu vết kiểm toán (Audit Trail)

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| B4.1 | [E] | **KHI** một phân tích, một lần xác thực khuôn mặt hoặc một quyết định Ops hoàn tất, hệ thống **SẼ** ghi một bản ghi bất biến vào bảng DynamoDB Audit Trail. |
| B4.2 | [U] | Bản ghi Audit **SẼ** chỉ chứa dữ liệu đã che giấu (STK che giữa, không ảnh, không văn bản lệnh thô) và mã băm SHA-256 của văn bản lệnh để đối chiếu khi cần. |
| B4.3 | [UW] | **NẾU** có thao tác ghi đè một bản ghi Audit đã tồn tại, **THÌ** hệ thống **SẼ** từ chối bằng điều kiện `attribute_not_exists`. |
| B4.4 | [U] | Bảng Audit **SẼ** bật Point-in-Time Recovery, mã hóa KMS và TTL theo chính sách lưu trữ đã được Pháp chế phê duyệt. |

### REQ-B5. Phân quyền vận hành

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| B5.1 | [U] | Workspace Ops **SẼ** yêu cầu đăng nhập SSO có MFA và phân vai trò `fraud-analyst`, `fraud-lead`, `auditor` (Giai đoạn 2). |
| B5.2 | [UW] | **NẾU** một mục Blacklist bị gỡ, **THÌ** hệ thống **SẼ** yêu cầu phê duyệt 4 mắt (người thứ hai có vai trò `fraud-lead`). |

---

## 4. Yêu cầu xuyên suốt (X)

### REQ-X1. Hợp đồng dữ liệu bất biến

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| X1.1 | [U] | Mọi mã Frontend, API, Lambda và kiểm thử **SẼ** import kiểu từ `@/types/trustpay`; không định nghĩa lại kiểu trùng lặp. |
| X1.2 | [U] | Chữ ký kiểu trong `types/trustpay.ts` và cấu trúc JSON trong `API_CONTRACT.md` **SẼ** chỉ thay đổi qua quy trình review hợp đồng có phiên bản. |
| X1.3 | [E] | **KHI** tệp route, `types/trustpay.ts` hoặc `API_CONTRACT.md` được lưu, hook `api-contract-sync` **SẼ** đối chiếu tính nhất quán giữa 3 nguồn. |

### REQ-X2. Bảo mật Zero-Trust và quản lý bí mật

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| X2.1 | [U] | Mã nguồn **SẼ** không chứa AWS Access Key (`AKIA…`/`ASIA…`), Secret Key hoặc Session Token; cấu hình chỉ đọc qua `process.env` hoặc IAM Role. |
| X2.2 | [U] | Mỗi Lambda **SẼ** có IAM Role riêng theo nguyên tắc đặc quyền tối thiểu: chỉ `bedrock:InvokeModel` trên ARN model được phép, chỉ `rekognition:CompareFaces`/`DetectText` trong region triển khai, chỉ `dynamodb:PutItem` trên bảng Audit. |
| X2.3 | [U] | Hệ thống **SẼ** coi `commandText`, văn bản OCR và đầu ra mô hình AI là dữ liệu không tin cậy: không thực thi, không dùng làm chỉ dẫn hệ thống, luôn kiểm tra schema trước khi dùng. |
| X2.4 | [UW] | **NẾU** mã nguồn ghi log số CCCD, ảnh base64 hoặc selfie, **THÌ** hook `fintech-pii-security-guard` **SẼ** chặn thao tác ghi tệp và nêu vị trí vi phạm. |
| X2.5 | [U] | Ở Production, Blacklist, ngân sách và hạn mức **SẼ** được đọc từ nguồn phía máy chủ; giá trị do client gửi chỉ dùng cho Demo. |
| X2.6 | [U] | Kết nối **SẼ** dùng TLS ≥ 1.2; dữ liệu lưu trữ **SẼ** mã hóa bằng AWS KMS. |

### REQ-X3. Bảo vệ dữ liệu cá nhân (LG-03, LG-04)

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| X3.1 | [U] | Hệ thống **SẼ** che giấu số CCCD (12 chữ số), số điện thoại và STK trong log, Audit Trail và giao diện Ops theo quy tắc của `design.md` mục 7. |
| X3.2 | [E] | **KHI** người dùng sử dụng xác thực khuôn mặt lần đầu, hệ thống **SẼ** thu thập sự đồng ý rõ ràng cho mục đích xác thực giao dịch và lưu bằng chứng đồng ý. |
| X3.3 | [E] | **KHI** phát hiện sự cố lộ lọt dữ liệu cá nhân, quy trình vận hành **SẼ** thông báo cho cơ quan chuyên trách bảo vệ dữ liệu cá nhân trong vòng 72 giờ. |
| X3.4 | [U] | Hệ thống **SẼ** duy trì hồ sơ đánh giá tác động xử lý dữ liệu cá nhân và hồ sơ chuyển dữ liệu ra nước ngoài nếu gọi dịch vụ AI ở region ngoài Việt Nam. |
| X3.5 | [UW] | **NẾU** số CCCD xuất hiện trong văn bản lệnh, **THÌ** Lá Chắn AI **SẼ** che số đó trước khi đưa vào `recipient`, `summary` hoặc prompt gửi Bedrock. |

### REQ-X4. Hiệu năng và khả năng mở rộng

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| X4.1 | [U] | `/api/analyze` **SẼ** đạt p95 ≤ 2,5 s khi gọi Bedrock và p95 ≤ 300 ms ở nhánh dự phòng. |
| X4.2 | [U] | Kiến trúc mục tiêu **SẼ** chịu 1.000.000 người dùng đồng thời với khoảng 20.000 yêu cầu phân tích/giây ở đỉnh, nhờ Lambda auto-scaling, DynamoDB on-demand và bộ nhớ đệm Blacklist. |
| X4.3 | [S] | **TRONG KHI** tải vượt hạn mức Bedrock, hệ thống **SẼ** ưu tiên giao dịch giá trị cao cho Bedrock và đưa giao dịch giá trị thấp qua bộ luật. |

### REQ-X5. Quan sát và vận hành

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| X5.1 | [U] | Mỗi yêu cầu **SẼ** mang `correlationId` xuyên suốt API Gateway → Lambda → Step Functions → EventBridge → Audit. |
| X5.2 | [U] | Hệ thống **SẼ** phát metric: tỷ lệ fallback, độ trễ từng dịch vụ AWS, phân bố `riskLevel`, tỷ lệ báo động giả (ticket `APPROVED`/tổng ticket). |
| X5.3 | [E] | **KHI** tỷ lệ fallback vượt 20% trong 5 phút, hệ thống **SẼ** cảnh báo trực ca. |

### REQ-X6. Chất lượng và tự động hóa phát triển

| Mã | Loại | Tiêu chí chấp nhận |
|---|---|---|
| X6.1 | [E] | **KHI** tệp `.ts/.tsx` trong `app/` hoặc `components/` được lưu, hook `verify-types-on-save` **SẼ** chạy `npx tsc --noEmit`. |
| X6.2 | [U] | Bộ kiểm thử đối kháng **SẼ** chạy được không cần AWS (`npm run test:fraud`) và kết thúc mã thoát khác 0 khi một tiêu chí bắt buộc bị vi phạm. |
| X6.3 | [O] | **TẠI NƠI** chạy với cờ `--strict` (cổng phát hành Production), bộ kiểm thử **SẼ** coi mọi `KNOWN-GAP` là lỗi. |

---

## 5. Ma trận truy vết (Traceability Matrix)

| Yêu cầu | Pháp lý | Thành phần | Kiểm thử | Trạng thái MVP |
|---|---|---|---|---|
| A1.1–A1.7 | — | `app/api/analyze/route.ts` | C01–C04, F01–F15 | ĐÃ ĐÁP ỨNG |
| A2.2, A2.4 | — | `analyze` (OCR, evidence) | F03, F15 | ĐÃ ĐÁP ỨNG |
| A2.5 | — | Bộ luật + Bedrock | F03 | KNOWN-GAP (T-2.4) |
| A3.1–A3.4 | — | Smart Fallback Engine | F01, F02, F07, F09, F10 | ĐÃ ĐÁP ỨNG |
| A3.5 | — | Bộ luật + Bedrock | F01 | KNOWN-GAP (T-2.4) |
| A3.6 | — | Bộ luật + Bedrock | F08 | KNOWN-GAP (T-2.4) |
| A3.8 | — | Merge Bedrock | F12 | KNOWN-GAP (T-2.3) |
| A4.1, A4.2 | — | Blacklist, `page.tsx` | F04, F13 | ĐÃ ĐÁP ỨNG |
| A4.3 | — | Chuẩn hóa Blacklist | F04 | KNOWN-GAP (T-2.5) |
| A5.1–A5.2 | — | `analyze` | C02, F05 | ĐÃ ĐÁP ỨNG |
| A6.1 | LG-01, LG-02 | `analyze`, `AiShieldResultPanel` | F01, F02, F07 | ĐÃ ĐÁP ỨNG |
| A6.2 | LG-01, LG-02 | `analyze` | F05 | KNOWN-GAP (T-2.1) |
| A6.3 | LG-01 | `analyze` | F05 | ĐÃ ĐÁP ỨNG |
| A6.4, A6.5 | LG-01, LG-02 | Sổ cái + Device binding | — | Giai đoạn 2 (T-3.6, T-3.7) |
| A7.3 | LG-01 | `verify-face` | F06 | KNOWN-GAP (T-2.2) |
| A7.4 | LG-01 | `verify-face` | F06 | KNOWN-GAP (T-2.2) |
| A7.1, A7.6 | LG-01, LG-02 | Rekognition + Liveness | — | Giai đoạn 2 (T-3.4) |
| A9.1–A9.3, A9.6 | — | `analyze`, `verify-face` | F11, F12, F14 | ĐÃ ĐÁP ỨNG |
| A9.4, A9.5 | — | Circuit Breaker | F14 | KNOWN-GAP (T-2.6) |
| B1.1–B1.5, B2.1–B2.4 | — | `page.tsx`, `FraudOpsDashboard` | F04, F13 | ĐÃ ĐÁP ỨNG |
| B3.2, X3.5 | LG-03, LG-04 | Masking | F06 | KNOWN-GAP (T-2.7) |
| B4.1–B4.4 | LG-03 | `infra/` DynamoDB | — | Hạ tầng sẵn sàng (T-3.1) |
| X2.1, X2.4 | LG-03 | Hook PII guard | — | ĐÃ ĐÁP ỨNG (hook) |
| X2.2 | — | `infra/trustpay-serverless-stack.ts` | — | ĐÃ ĐÁP ỨNG (IaC) |
| X6.1–X6.3 | — | Hooks, test suite | Toàn bộ | ĐÃ ĐÁP ỨNG |

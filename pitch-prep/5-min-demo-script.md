# TrustPay AI — Kịch bản Demo & Thuyết trình 5 phút

> **Sự kiện:** MoMo TechDay 2026 · **Thời lượng:** 5:00 (10 mốc × 30 giây) · **Đội hình:** 1 người nói (Presenter), 1 người điều khiển máy (Driver). Nếu chỉ có 1 người, Presenter tự thao tác và nói theo đúng cột "Câu thoại".
> **Nguyên tắc:** mọi nhãn nút trong tài liệu này là **nhãn thật** trên giao diện TrustPay AI. Mọi số liệu thị trường phải được thay bằng nguồn chính thức đã kiểm chứng trước giờ thi (xem ô `[CHÈN SỐ LIỆU]`).

---

## 0. Chuẩn bị trước giờ thi (T−30 phút)

| # | Việc cần làm | Lý do |
|---|---|---|
| 1 | Ở nơi có Internet ổn định: `npm ci` rồi `npm run build` | `next/font/google` tải font lúc build; sau build, font được phục vụ cục bộ, không cần mạng |
| 2 | Tại hội trường: `npm run start` và mở `http://localhost:3000` | Chạy trên laptop nên **không phụ thuộc mạng hội trường** |
| 3 | Chọn chế độ AI: có mạng tốt thì giữ `.env.local` (gọi AWS thật); mạng yếu thì đổi tên `.env.local` → `.env.local.bak` rồi khởi động lại | Thiếu AWS credentials ⇒ API chuyển ngay sang **Offline Fallback** (bộ luật xác định), phản hồi tức thì |
| 4 | Chạy thử 1 lượt cả 3 kịch bản, rồi bấm **"Reset dữ liệu Demo"** (nút chuyển thành "Đã khôi phục!") | Đưa số dư về 15.000.000đ, ticket Ops về trạng thái mặc định |
| 5 | Zoom trình duyệt 110–125%, bật chế độ toàn màn hình, tắt thông báo hệ điều hành | Chữ đủ to trên máy chiếu, không bị popup cắt ngang |
| 6 | Mở sẵn tab IDE: `.kiro/specs/trustpay-ai/requirements.md`, `.kiro/hooks/`, `.github/workflows/trustpay-enterprise-ci.yml` | Dùng cho mốc Kiro Spec-Driven (3:30–4:30) |
| 7 | Mở sẵn video dự phòng (theo `docs/DEMO_VIDEO_SCRIPT.md`) trên thiết bị thứ hai | Phương án cuối nếu laptop gặp sự cố |

**Trạng thái màn hình lúc bắt đầu:** màn hình đăng nhập TrustPay AI với nút **"Đăng nhập nhanh bằng Tài khoản Demo (Ban Giám Khảo)"**.

---

## 1. Timeline tổng quan

| Mốc | Phần | Màn hình | Mục tiêu với giám khảo |
|---|---|---|---|
| 0:00–0:30 | Hook mở đầu | Màn hình đăng nhập | Tạo tình huống mà ai cũng có thể là nạn nhân |
| 0:30–1:00 | Nỗi đau lừa đảo chuyển khoản tại Việt Nam | Màn hình đăng nhập → Tab 1 | Chỉ ra khoảng trống: cảnh báo đến **sau** khi tiền đã đi |
| 1:00–1:30 | Demo kịch bản 1 — An toàn (LOW) | Tab 1 | 99% giao dịch bình thường đi thẳng, không bị làm phiền |
| 1:30–2:00 | Demo kịch bản 2 — Vượt ngân sách | Tab 1 | AI nhắc nhở, không chặn — tôn trọng quyền quyết định |
| 2:00–2:30 | Demo kịch bản 3 — Lừa đảo mạo danh (HIGH 95) | Tab 1 | AI bóc tách và gọi tên chiêu lừa trước khi tiền rời ví |
| 2:30–3:00 | Xác thực khuôn mặt bắt buộc → Hủy giao dịch | Modal sinh trắc học | Step-up theo Thông tư 50 / QĐ 2345 |
| 3:00–3:30 | Fintech Ops chặn & cập nhật Blacklist | Tab 2 → Tab 1 | Vòng khép kín 2 chiều giữa người dùng và đội vận hành |
| 3:30–4:00 | Kiến trúc AWS Bedrock / Rekognition + Offline Fallback | Slide kiến trúc / README | Hệ thống chịu lỗi, chạy được cả khi mất AWS |
| 4:00–4:30 | Kiro Spec-Driven Development | IDE (specs, hooks, CI) | Chất lượng kỹ thuật kiểm chứng được, không chỉ là demo |
| 4:30–5:00 | Kinh tế học đơn vị & Kết luận | Slide kết | Chi phí thấp, ROI rõ, lời kêu gọi hành động |

---

## 2. Kịch bản chi tiết từng mốc 30 giây

### ⏱ 0:00–0:30 — Hook mở đầu

**Màn hình:** màn hình đăng nhập TrustPay AI (logo khiên, badge "AWS Serverless Powered").

**Thao tác:** chưa bấm gì. Presenter nhìn về phía giám khảo.

**Câu thoại:**
> "Thưa Ban Giám Khảo, hãy tưởng tượng điện thoại của quý vị đổ chuông: *'Tôi là cán bộ điều tra. Tài khoản của anh liên quan đến một vụ án. Anh cần chuyển gấp 12 triệu để xác minh.'*
> Câu hỏi hôm nay không phải là *người dùng có bị lừa không*. Câu hỏi là: **ví điện tử có kịp lên tiếng trước khi tiền rời đi hay không?**
> TrustPay AI là câu trả lời: mỗi lệnh chuyển tiền đều được AI *soát vé* trước khi tiền rời ví."

**Mẹo:** nói chậm câu in đậm. Không đọc slide.

---

### ⏱ 0:30–1:00 — Nỗi đau lừa đảo chuyển khoản tại Việt Nam

**Màn hình:** vẫn màn hình đăng nhập (hoặc 1 slide số liệu nếu có).

**Thao tác:** ở giây 0:55, Driver bấm **"Đăng nhập nhanh bằng Tài khoản Demo (Ban Giám Khảo)"** → vào Tab 1 **"Ví Người Dùng & Lá Chắn AI"**, số dư **15.000.000đ**.

**Câu thoại:**
> "`[CHÈN SỐ LIỆU]` — *số vụ / thiệt hại do lừa đảo trực tuyến tại Việt Nam năm gần nhất, trích nguồn Bộ Công an hoặc NHNN, ghi rõ năm.*
> Các chiêu quen thuộc: giả danh công an, 'trúng thưởng nộp phí', hóa đơn chuyển khoản giả, mã QR dán đè ở quầy thanh toán.
> Điểm chung: nạn nhân **tự tay** bấm chuyển. Hệ thống hiện nay thường cảnh báo **sau** giao dịch — khi tiền đã đi. Chúng tôi đặt lớp bảo vệ **ngay trước** nút chuyển tiền."

**Mẹo:** không dùng con số khi chưa kiểm chứng nguồn. Nếu không có số liệu, chỉ nói phần chiêu thức.

---

### ⏱ 1:00–1:30 — Demo kịch bản 1: Giao dịch an toàn (LOW)

**Thao tác:**
1. Chỉ nhanh cột trái: thẻ **"Số dư ví khả dụng"** (15.000.000đ, badge "AI Shield ON"), **"Ngân sách chi tiêu"** 4 danh mục, **"Danh sách cảnh báo (Blacklist)"** 3 mục.
2. Bấm thẻ **"Kịch bản 1: Giao dịch an toàn"** → ô lệnh tự điền *"Chuyển 45.000đ tiền bún bò cho Quán Cô Ba"*.
3. Bấm **"Phân tích giao dịch với Lá chắn AI"** (hoặc `Ctrl + Enter`).
4. Kết quả: badge **"LOW • AN TOÀN"**, **Điểm rủi ro 10/100**, danh mục **Ăn uống**, khung xanh **"Ngân sách trong hạn mức an toàn"** — còn lại 1.755.000đ.
5. Bấm **"Xác nhận chuyển tiền (45.000đ)"** → toast **"Chuyển tiền thành công 45.000đ"**, số dư còn 14.955.000đ.

**Câu thoại:**
> "Tôi gõ lệnh như nhắn tin. AI tự tách số tiền, người nhận, danh mục chi tiêu. Rủi ro 10 trên 100 — **đi thẳng, không một bước xác thực thừa.** Với 99% giao dịch bình thường, TrustPay AI vô hình."

---

### ⏱ 1:30–2:00 — Demo kịch bản 2: Vượt ngân sách

**Thao tác:**
1. Bấm **"Kịch bản 2: Vượt ngân sách"** → *"Thanh toán 2.500.000đ mua giày sneaker tại Shop XYZ"*.
2. Bấm **"Phân tích giao dịch với Lá chắn AI"**.
3. Kết quả: rủi ro lừa đảo **LOW**, danh mục **Mua sắm**, khung vàng **"Cảnh báo vượt hạn mức ngân sách"** — **Vượt mức: 1.000.000đ**, kèm dòng **"Gợi ý"**.
4. **Không** bấm xác nhận — chuyển ngay sang kịch bản 3.

**Câu thoại:**
> "Giao dịch hợp lệ, không lừa đảo — nhưng vượt hạn mức Mua sắm 1 triệu. AI **nhắc, không chặn**: người dùng vẫn toàn quyền quyết định. Lớp thứ hai này biến ví thành trợ lý tài chính, không chỉ là cổng thanh toán."

---

### ⏱ 2:00–2:30 — Demo kịch bản 3: Lừa đảo mạo danh & Blacklist (HIGH 95)

**Thao tác:**
1. Bấm **"Kịch bản 3: Lừa đảo mạo danh & Blacklist"** → *"Chuyển gấp 12.000.000đ cho Cán bộ điều tra STK 999988887777 để xác minh tài khoản"*.
2. Bấm **"Phân tích giao dịch với Lá chắn AI"**.
3. Kết quả: viền đỏ, badge **"HIGH • RỦI RO CAO"** (chấm đỏ nhấp nháy), **Điểm rủi ro 95/100**, người nhận bóc tách **"Cán bộ điều tra (999988887777)"**.
4. Chỉ vào mục **"Các dấu hiệu phát hiện (Red Flags)"**: Blacklist · mạo danh cơ quan chức năng · thúc ép "chuyển gấp" · vượt hạn mức.
5. Toast góc phải: **"Đã đẩy cảnh báo HIGH sang Fintech Ops"** — badge đếm ở tab Ops tăng lên **2**.

**Câu thoại:**
> "Đây là cuộc gọi lúc mở đầu. 95 trên 100. AI gọi đúng tên chiêu lừa: **mạo danh cơ quan công an**, số tài khoản đã nằm trong danh sách đen, ngôn từ thúc ép.
> Và hãy nhìn góc phải: cảnh báo **đã sang đội vận hành** trong cùng giây đó."

---

### ⏱ 2:30–3:00 — Xác thực khuôn mặt bắt buộc → Hủy giao dịch

**Thao tác:**
1. Bấm nút đỏ **"Cảnh báo rủi ro cao — Xác thực khuôn mặt trước khi chuyển"** → mở modal **"Xác thực Sinh trắc học Khuôn mặt"**, khung đỏ *"Giao dịch đang bị tạm khóa do phát hiện rủi ro cao (95/100)"*.
2. Bấm **"Dùng ảnh khuôn mặt Demo"** (không dùng webcam thật trên sân khấu) → lớp phủ *"Đang đối chiếu sinh trắc học… Amazon Rekognition CompareFaces"* → **"Xác thực khuôn mặt thành công"**, **Độ khớp 98.4%**.
3. Bấm **"Hủy giao dịch"** → toast **"Giao dịch đã được hủy an toàn"**; số dư giữ nguyên 14.955.000đ.

**Câu thoại:**
> "Nút chuyển tiền đã bị khóa. Theo Quyết định 2345 và Thông tư 50 của NHNN, giao dịch rủi ro cao hoặc trên 10 triệu phải qua **xác thực khuôn mặt** — Amazon Rekognition đối chiếu sinh trắc học.
> Nhưng điều quan trọng nhất: sau khi đọc cảnh báo, người dùng **tự chọn Hủy**. Tiền vẫn nằm trong ví."

**Nói rõ nếu bị hỏi:** thông báo có chữ *"Demo Mode"* vì máy demo không có ảnh eKYC tham chiếu; bản Production so khớp với ảnh eKYC và **fail-closed** khi không xác thực được (xem `infra/lambda/verify-face.ts`).

---

### ⏱ 3:00–3:30 — Fintech Ops chặn & cập nhật Blacklist (vòng khép kín)

**Thao tác:**
1. Bấm tab **"Fintech Future Workspace (Ops)"** (badge **2**).
2. Chỉ 3 thẻ KPI: **"Cảnh báo chờ xử lý (PENDING)"**, **"Giao dịch đã chặn (BLOCKED)"**, **"Tổng tiền rủi ro đã bảo vệ"**.
3. Ở ticket mới nhất (12.000.000đ, HIGH 95, có **"Tóm tắt phân tích từ Lá chắn AI"**), bấm **"Chặn & Thêm vào Blacklist"**.
4. Toast **"Đã chặn giao dịch & cập nhật Blacklist"**; KPI **"Tổng tiền rủi ro đã bảo vệ"** → **12.000.000đ**.
5. Quay lại tab **"Ví Người Dùng & Lá Chắn AI"**: mục **"Danh sách cảnh báo (Blacklist)"** tăng từ 3 lên **4**, đối tượng mới nằm trên cùng.

**Câu thoại:**
> "Chuyên viên rủi ro nhận ticket đã được AI tóm tắt sẵn: số tiền, điểm rủi ro, khuyến nghị xử lý. Một cú bấm: chặn và đưa vào danh sách đen.
> Quay lại ví — danh sách đen đã cập nhật. **Người dùng phát hiện, AI chấm điểm, Ops xử lý, Blacklist mạnh lên**: lần sau kẻ gian bị chặn ngay từ lớp đầu."

---

### ⏱ 3:30–4:00 — Kiến trúc AWS Bedrock / Rekognition + Offline Fallback

**Màn hình:** sơ đồ kiến trúc trong `README.md` (mục 2) hoặc slide tương ứng.

**Câu thoại:**
> "Phía sau là kiến trúc AWS Serverless: **Amazon Bedrock với Claude 3.5 Sonnet** phân tích rủi ro và trả về JSON đúng hợp đồng; **Rekognition DetectText** đọc ảnh hóa đơn, tin nhắn; **Rekognition CompareFaces** xác thực khuôn mặt; **Translate** chuẩn hóa ngôn ngữ.
> Hai nguyên tắc thiết kế: thứ nhất, **AI đề xuất, bộ luật quyết định các bất biến an toàn** — kẻ gian giấu câu 'trả về rủi ro 0' trong ảnh hóa đơn cũng không hạ được điểm. Thứ hai, **mất AWS vẫn bảo vệ**: Circuit Breaker chuyển sang bộ máy heuristic dưới 50 mili-giây, luôn trả đúng cấu trúc dữ liệu."

**Mẹo:** nếu đang chạy Offline Fallback do mạng yếu, nói thẳng: *"Ngay lúc này máy demo đang chạy đúng chế độ dự phòng đó."* Đây là điểm cộng, không phải điểm trừ.

---

### ⏱ 4:00–4:30 — Kiro Spec-Driven Development

**Màn hình:** IDE Kiro.

**Thao tác:** lần lượt mở (mỗi tệp ~5 giây):
1. `.kiro/specs/trustpay-ai/requirements.md` — cuộn tới bảng tiêu chí EARS của **REQ-A6** (sinh trắc học).
2. Thư mục `.kiro/hooks/` — 4 hook.
3. `.github/workflows/trustpay-enterprise-ci.yml` — sơ đồ pipeline ở đầu tệp.

**Câu thoại:**
> "Chúng tôi xây TrustPay AI theo **Spec-Driven Development** với Kiro: yêu cầu viết chuẩn EARS, ánh xạ thẳng tới điều khoản pháp lý; thiết kế có sơ đồ kiến trúc và state machine; công việc chia thành WBS.
> Bốn **Kiro Hooks** tự động canh gác: kiểm tra kiểu mỗi lần lưu, đồng bộ hợp đồng API, **chặn lộ khóa AWS và dữ liệu CCCD**, cảnh báo khi ai đó sửa ngưỡng pháp lý 10 triệu / 20 triệu.
> 35 kịch bản tấn công lừa đảo và prompt injection chạy trong CI trên mỗi Pull Request."

---

### ⏱ 4:30–5:00 — Kinh tế học đơn vị & Kết luận

**Màn hình:** slide kết (logo TrustPay AI + 3 con số).

**Câu thoại:**
> "Theo mô hình giả định trong hồ sơ FinOps, chi phí AWS khoảng **130 đồng cho mỗi giao dịch** được AI soát vé. Chặn được **một** vụ lừa 8 triệu đủ trả chi phí AI cho **khoảng 60.000 giao dịch**.
> TrustPay AI: **chặn rủi ro trước khi tiền rời ví, chỉ làm phiền đúng giao dịch nguy hiểm, và để người dùng cùng đội vận hành nhìn thấy cùng một sự thật.**
> Chúng tôi sẵn sàng đưa Lá Chắn AI vào luồng chuyển tiền P2P và thanh toán QR của MoMo. Xin cảm ơn!"

**Mẹo:** dừng đúng 5:00. Câu cuối nói chậm, nhìn giám khảo.

---

## 3. Bảng xử lý sự cố trên sân khấu

| Tình huống | Dấu hiệu | Xử lý ngay | Câu thoại cứu nguy |
|---|---|---|---|
| **Mạng hội trường yếu / mất** | Panel "Lá chắn AI đang quét giao dịch…" quay quá 3 giây | Driver tắt server, đổi tên `.env.local` → `.env.local.bak`, chạy lại `npm run start` (≈ 10 giây). API phát hiện thiếu credentials và chạy **Offline Fallback** tức thì | *"Mạng hội trường vừa cho chúng tôi cơ hội minh họa tính năng quan trọng nhất: hệ thống vẫn bảo vệ người dùng khi mất kết nối AWS."* |
| Phân tích chậm do AWS (không phải do mạng) | Có mạng nhưng phản hồi > 5 giây | Như trên: chuyển sang Offline Fallback cho phần còn lại của buổi demo | *"Trong Production, Circuit Breaker tự làm việc này dưới 50 mili-giây."* |
| Trình duyệt hỏi quyền camera | Popup quyền truy cập | Không bấm **"Bật Webcam thật"**; luôn dùng **"Dùng ảnh khuôn mặt Demo"** | — |
| Lỡ bấm **"Xác nhận chuyển tiền"** ở kịch bản 3 | Số dư giảm 12.000.000đ | Không giải thích dài: bấm **"Reset dữ liệu Demo"**, làm lại kịch bản 3 (≈ 20 giây) | *"Đây chính là lý do người dùng cần một lớp bảo vệ trước nút bấm."* |
| Máy chiếu cắt mép, chữ nhỏ | Không đọc được điểm rủi ro | `Ctrl` + `+` để zoom; giao diện tự co giãn | — |
| Laptop treo / hết pin | Màn hình đen | Chuyển sang video dự phòng trên thiết bị thứ hai, Presenter tiếp tục nói theo timeline | *"Chúng tôi chuyển sang bản ghi hình cùng kịch bản."* |
| Trễ giờ | Đồng hồ quá 3:30 khi còn ở Tab Ops | Gộp mốc 3:30–4:30 thành 1 câu: *"Kiến trúc AWS Serverless, Offline Fallback dưới 50 ms, xây bằng Kiro Spec-Driven với 35 kịch bản tấn công trong CI"*, rồi vào kết luận | — |

**Quy tắc vàng:** không bao giờ để khoảng lặng quá 3 giây. Driver xử lý kỹ thuật, Presenter tiếp tục nói.

---

## 4. Phương án rút gọn (nếu chỉ có 3 phút)

| Mốc | Nội dung |
|---|---|
| 0:00–0:30 | Hook mở đầu |
| 0:30–1:30 | Kịch bản 3 (HIGH 95) → modal sinh trắc học → **"Hủy giao dịch"** |
| 1:30–2:15 | Tab Ops → **"Chặn & Thêm vào Blacklist"** → Blacklist cập nhật ở Tab 1 |
| 2:15–3:00 | Kiến trúc + Offline Fallback + chi phí ~130 đồng/giao dịch + kết luận |

---

## 5. Cầu nối sang phần Hỏi đáp

Khi giám khảo hỏi sâu, trả lời ngắn rồi dẫn chiếu tài liệu:

| Chủ đề câu hỏi | Tài liệu |
|---|---|
| Prompt injection, deepfake, replay | `architecture/threat-modeling-stride-atlas.md` |
| Bedrock sập / throttling | `architecture/disaster-recovery-runbook.md` |
| Ngưỡng 10 triệu / 20 triệu, thiết bị tin cậy | `compliance/nhnn-circular-50-decision-2345-matrix.md` |
| CCCD, sinh trắc học, lưu trú dữ liệu | `compliance/decree-13-dpia-report.md` |
| Chi phí, ROI | `pitch-prep/unit-economics-finops.md` |
| Tích hợp vào SuperApp MoMo | `pitch-prep/momo-superapp-sdk-integration.md` |
| 25 câu hỏi CTO/CISO đã chuẩn bị | `pitch-prep/cto-ciso-deep-dive-qa.md` |

**Câu trả lời trung thực cho câu hỏi khó:** nếu giám khảo chỉ ra một khoảng trống (ví dụ route hiện chưa bắt sinh trắc học cho giao dịch rủi ro thấp trên 10 triệu), xác nhận thẳng thắn và dẫn tới task khắc phục đã lên kế hoạch trong `.kiro/specs/trustpay-ai/tasks.md` (T-2.1). Bộ kiểm thử đã đánh dấu sẵn các khoảng trống này là `KNOWN-GAP`.

# TrustPay AI — Kịch bản Demo & Thuyết trình 5 phút (bản vòng chung kết)

> **Sự kiện:** MoMo TechDay 2026 · **Thời lượng:** 5:00 (10 mốc × 30 giây) · **Đội hình:** 1 người nói (Presenter), 1 người điều khiển máy (Driver). Nếu chỉ có 1 người, Presenter tự thao tác và nói theo đúng cột "Câu thoại".
> **Nguyên tắc:** mọi nhãn nút trong ngoặc kép **"…"** là **nhãn thật** trên giao diện tiếng Việt của TrustPay AI. Mọi số liệu thị trường phải được thay bằng nguồn chính thức đã kiểm chứng trước giờ thi (ô `[CHÈN SỐ LIỆU]`). Mọi đơn giá AWS là giả định mẫu (xem `pitch-prep/unit-economics-finops.md` mục 1.4).

---

## 0. Chuẩn bị trước giờ thi (T−30 phút)

| # | Việc cần làm | Lý do |
|---|---|---|
| 1 | Ở nơi có Internet ổn định: `npm ci` → `npx tsc --noEmit` → `npm run test:fraud` → `npm run test:injection` → `npm run build` | Cổng chất lượng phải sạch (F01–F25, P01–P20); `next/font/google` tải font lúc build |
| 2 | Tại hội trường: `npm run start`, mở `http://localhost:3000` bằng **Chrome hoặc Edge** | Chạy trên laptop nên không phụ thuộc mạng hội trường; Chrome/Edge hỗ trợ đọc QR từ ảnh (BarcodeDetector) trên nhiều hệ điều hành |
| 3 | Chọn chế độ AI: mạng tốt thì giữ `.env.local` (gọi AWS thật); mạng yếu thì đổi tên `.env.local` → `.env.local.bak` rồi khởi động lại | Thiếu AWS credentials ⇒ API chạy **Offline Heuristic** tức thì; bảng FinOps ghi rõ lý do *"chưa cấu hình AWS credentials (chế độ demo)"* |
| 4 | Chạy thử 1 lượt toàn bộ kịch bản, sau đó bấm **"Reset Demo"** 2 lần (**"Bấm lần nữa để xác nhận"** → **"Đã khôi phục!"**) | Số dư về 15.000.000đ, ticket/Blacklist/cuộc gọi mô phỏng/QR/Copilot về mặc định. Reset **không** đổi ngôn ngữ và theme |
| 5 | Chọn theme theo máy chiếu: phòng sáng → **"☀️ Light"**, phòng tối → **"🌙 Dark"** (góc phải header, cạnh **VI \| EN**) | Lựa chọn được lưu; lần đầu mở app tự theo theme hệ điều hành |
| 6 | Zoom trình duyệt 110–125%, toàn màn hình, tắt thông báo hệ điều hành | Chữ đủ to trên máy chiếu |
| 7 | Mở sẵn DevTools ở chế độ thiết bị **iPhone 12 Pro (390 px)** trong một cửa sổ riêng | Dùng cho mốc 4:00–4:30 (mobile-first) |
| 8 | Mở sẵn tab IDE: `.kiro/specs/trustpay-ai/requirements.md`, `.kiro/hooks/`, `tests/fraud-adversarial-suite.ts` (F21–F25) | Dẫn chứng nhanh khi được hỏi |
| 9 | Mở sẵn video dự phòng (theo `docs/DEMO_VIDEO_SCRIPT.md`) trên thiết bị thứ hai | Phương án cuối nếu laptop gặp sự cố |

**Trạng thái màn hình lúc bắt đầu:** thẻ **"Chào mừng đến với TrustPay AI"** với 2 nút **"Vào Ví ngay"** và **"Vào Ops ngay"**.

---

## 1. Timeline tổng quan

| Mốc | Phần | Màn hình | Mục tiêu với giám khảo |
|---|---|---|---|
| 0:00–0:30 | Hook: cuộc gọi "cán bộ điều tra" | Thẻ chào mừng → Ví | Ai cũng có thể là nạn nhân, kể cả khi lệnh chuyển trông vô hại |
| 0:30–1:00 | AI Payment Copilot chuyển tiền bằng lời | Tab "Chuyển tiền & Lá chắn AI" | 99% giao dịch bình thường đi thẳng, không bị làm phiền |
| 1:00–1:30 | Copilot tra hạn mức thật & soát gói trừ tiền ngầm | Copilot → "Subscription Guard" | Ví là trợ lý tài chính, không chỉ là cổng thanh toán |
| 1:30–2:00 | Soi mã VietQR: mã thật được trả, mã dán đè bị chặn | Tab "Soi mã VietQR (QR Inspector)" | Chặn chiêu QR dán đè ngay tại quầy, trước khi quét tiền |
| 2:00–2:30 | Active Call Shield: chuyển tiền khi đang nghe máy | Khung chuyển tiền | Ngữ cảnh cuộc gọi biến lệnh "sạch" thành rủi ro CAO, tạm giữ 15 giây |
| 2:30–3:00 | Người giám hộ chặn & biên bản bảo vệ | Thẻ Hạ nhiệt + điện thoại mô phỏng | Người thân là lớp phòng thủ thứ hai, có bằng chứng che PII |
| 3:00–3:30 | Fintech Ops phong tỏa đường dây 1903xxxx | Tab "Fintech Future Workspace (Ops)" | Vòng khép kín 2 chiều Ví ↔ Ops |
| 3:30–4:00 | AWS Security & FinOps | Bảng "AWS Security & FinOps" | Che PII theo NĐ 13 trước Bedrock, Circuit Breaker, ~$0.0012/GD |
| 4:00–4:30 | Light/Dark, mobile-first, Hướng dẫn 5 chủ đề, Kiro | Header, DevTools 390 px, IDE | Sẵn sàng cho người dùng thật và kiểm chứng được chất lượng |
| 4:30–5:00 | Kết luận & lời kêu gọi | Slide kết | Chi phí thấp, ROI rõ, sẵn sàng tích hợp MoMo |

---

## 2. Kịch bản chi tiết từng mốc 30 giây

### ⏱ 0:00–0:30 — Hook mở đầu

**Màn hình:** thẻ **"Chào mừng đến với TrustPay AI"**.

**Thao tác:** ở giây 0:25, Driver bấm **"Vào Ví ngay"** → tab **"Ví Người Dùng & Lá Chắn AI"**, thẻ **"Số dư ví khả dụng"** hiển thị **15.000.000đ**.

**Câu thoại:**
> "Thưa Ban Giám Khảo, điện thoại đổ chuông: *'Tôi là cán bộ điều tra. Tài khoản của anh liên quan vụ án rửa tiền, sẽ bị phong tỏa trong 30 phút. Anh chuyển gấp sang tài khoản an toàn.'*
> Kẻ gian không cần nạn nhân gõ chữ 'công an' vào lệnh chuyển. Hắn chỉ cần nạn nhân **đang cầm máy**.
> TrustPay AI soát mọi lệnh chuyển **trước khi tiền rời ví**, và nhìn được cả bối cảnh: cuộc gọi, mã QR, gói trừ tiền ngầm."

`[CHÈN SỐ LIỆU]` — *số vụ / thiệt hại lừa đảo trực tuyến tại Việt Nam năm gần nhất, nguồn Bộ Công an hoặc NHNN.* Không nói số khi chưa kiểm chứng nguồn.

---

### ⏱ 0:30–1:00 — AI Payment Copilot: chuyển tiền bằng lời (LOW)

**Màn hình:** tab **"Chuyển tiền & Lá chắn AI"** trong khung **"Trợ lý AI hành động thay bạn"**; hộp **"Mẹo nhanh"** ở đầu khu vực.

**Thao tác:**
1. Trong khung **"AI Payment Copilot"**, bấm gợi ý **"Chuyển 250.000đ tiền ăn trưa cho Nguyễn Minh"**.
2. Copilot trả lời và hiện 3 thẻ đã bóc tách: **Số tiền 250.000đ · Người nhận Nguyễn Minh · Danh mục Ăn uống**; form **"Chuyển tiền thông minh & Quét Lá chắn AI"** được điền sẵn, viền vàng nhấp nháy.
3. Bấm **"Phân tích giao dịch với Lá chắn AI"** → badge **"LOW • AN TOÀN"**, khung **"Ngân sách trong hạn mức an toàn"**, thanh luồng AWS ở cuối thẻ kết quả kèm độ trễ thật.
4. Bấm **"Xác nhận chuyển tiền (250.000đ)"** → toast **"Chuyển tiền thành công 250.000đ"**.

**Câu thoại:**
> "Tôi nói như nhắn tin. Copilot tách số tiền, người nhận, danh mục và điền sẵn lệnh — nhưng **không tự chuyển**: mọi lệnh vẫn đi qua Lá chắn AI trên Amazon Bedrock và bộ luật.
> Rủi ro thấp, đi thẳng, không một bước xác thực thừa. Với giao dịch bình thường, TrustPay AI vô hình."

---

### ⏱ 1:00–1:30 — Copilot tra hạn mức thật & soát gói trừ tiền ngầm

**Thao tác:**
1. Bấm gợi ý **"Kiểm tra hạn mức Mua sắm còn bao nhiêu?"** → Copilot trả lời **"Hạn mức Mua sắm còn 1.500.000đ (đã dùng 2.500.000đ / 4.000.000đ)."** — số đọc từ dữ liệu Ví thật (khớp thẻ **"Ngân sách chi tiêu"** ở cột trái).
2. Bấm gợi ý **"Soát giúp tôi các gói đăng ký đang bị trừ tiền ngầm"** → app tự mở tab **"Subscription Guard"**, Copilot báo số gói đáng ngờ và tổng tiền/tháng.
3. Ở một gói bị gắn cờ, bấm **"Hủy gia hạn ngay"** → toast **"Đã hủy gia hạn …"**.

**Câu thoại:**
> "Copilot trả lời bằng **số liệu thật trong ví**, không bịa. Và nó mở đúng công cụ: Subscription Guard chỉ ra gói dùng thử sắp tự gia hạn, gói ít dùng — hủy một chạm, tiết kiệm mỗi tháng."

---

### ⏱ 1:30–2:00 — Soi mã VietQR: mã thật được trả, mã dán đè bị chặn

**Thao tác:**
1. Bấm tab **"Soi mã VietQR (QR Inspector)"** trong khung **"Trợ lý AI hành động thay bạn"**.
2. Bấm mẫu **"QR Quán Cà Phê Hợp Lệ"** → **"AN TOÀN — có thể thanh toán"**: Tag 59 **CA PHE MOC MIEN**, chủ tài khoản **CONG TY TNHH CA PHE MOC MIEN**, **CRC-16 (Tag 63): Hợp lệ**. Bấm **"Thanh toán 45.000đ"** → toast **"Đã thanh toán 45.000đ qua VietQR"** (trừ tiền thật, cập nhật hạn mức Ăn uống).
3. Bấm mẫu **"QR Bị Dán Đè / Chứa Liên Kết Lạ"** → khung đỏ **"NGUY HIỂM — đã chặn thanh toán"**, **100/100**, các dấu hiệu: *Tên trên mã không khớp chủ tài khoản: CA PHE MOC MIEN ≠ TRAN VAN B* · *Mã chứa liên kết lạ: https://momo-hoantien.xyz/otp* · *STK khớp Blacklist: 1903xxxx…*. Toast **"Đã chặn mã VietQR nguy hiểm • TCK-…"**.
4. Chỉ thanh luồng ở đáy khung: **Amazon Rekognition (Quét QR) → EMVCo TLV Parser (Giải mã) → Amazon Bedrock & Blacklist (Đối chiếu)**, có độ trễ từng chặng.

**Câu thoại:**
> "Chiêu dán mã QR giả đè lên mã của quán quen: tên quán vẫn đúng, nhưng tiền chảy vào tài khoản kẻ gian. TrustPay AI giải mã chuẩn **EMVCo/NAPAS ngay trên máy**, kiểm tra CRC, đối chiếu tên chủ tài khoản, bắt liên kết lạ và Blacklist sống — mã giả bị chặn, ticket tự sang Ops."

**Nói rõ nếu bị hỏi:** tra cứu tên chủ tài khoản NAPAS đang **mô phỏng** cho 2 tài khoản demo; đọc QR từ ảnh dùng BarcodeDetector của trình duyệt (Production: Amazon Rekognition/Lambda phía máy chủ).

---

### ⏱ 2:00–2:30 — Active Call Shield: chuyển tiền khi đang nghe máy

**Thao tác:**
1. Bấm tab **"Chuyển tiền & Lá chắn AI"**. Ở đầu khung chuyển tiền, dòng **"Trạng thái cuộc gọi: Bình thường"** → bấm **"Mô phỏng cuộc gọi lạ"**.
2. Dòng đổi thành **"Đang nghe cuộc gọi từ số lạ (+84 9xx xxx 247)"**, biểu tượng đỏ nhấp nháy; khung **"Phụ đề trực tiếp — Amazon Transcribe (mô phỏng streaming)"** chạy từng câu, tô đỏ từ khóa *cán bộ điều tra, phong tỏa, chuyển gấp, tài khoản an toàn, mã OTP*; **"Mức nghi vấn cuộc gọi"** tăng dần.
3. Trong ô Copilot, gõ **Chuyển 12.000.000đ cho Nguyễn Văn Hùng** → Enter (lệnh "sạch", không có từ khóa lừa đảo).
4. Bấm **"Phân tích giao dịch với Lá chắn AI"** → toast **"Phát hiện chuyển tiền khi đang nghe máy"**; badge **"FROZEN"**; thẻ **"Cơ chế Hạ nhiệt tâm lý — Vui lòng bình tĩnh kiểm tra lại"** bật lên ở **góc phải dưới** (điện thoại: bottom sheet), nhãn **"FROZEN • Đang tạm giữ"**, đồng hồ 15 giây.

**Câu thoại:**
> "Lệnh này hoàn toàn 'sạch' — không có chữ công an, không có tài khoản đen. Nhưng nó được tạo **trong lúc nạn nhân đang nghe một số lạ** đọc từng câu thúc ép.
> Active Call Shield nâng rủi ro lên CAO, tạm giữ giao dịch 15 giây và **khóa FaceID cho tới khi hết thời gian hạ nhiệt**. Âm thanh không được lưu — chỉ phân tích từ khóa trong RAM theo Nghị định 13."

---

### ⏱ 2:30–3:00 — Người giám hộ chặn & biên bản bảo vệ

**Thao tác:**
1. Trong thẻ Hạ nhiệt, bấm **"Gửi cảnh báo cho Người giám hộ duyệt"** → nút đổi thành **"Đã gửi tới Nguyễn Văn A"**.
2. Bên phải, **"📱 Điện thoại Người giám hộ: Nguyễn Văn A"** nhận thông báo **"Cảnh báo giao dịch rủi ro cao"** với tóm tắt AI đã che PII.
3. Bấm **"Chặn & Hủy giao dịch ngay"** trên điện thoại → **"Đã bảo vệ thành công!"**, số dư giữ nguyên.
4. Bấm **"Tải biên bản (.txt)"** → tệp biên bản bảo vệ giao dịch (chỉ chứa dữ liệu đã che + mã băm SHA-256 của lệnh).
5. Bấm **"Đóng"** trên thẻ Hạ nhiệt, rồi bấm **"Kết thúc cuộc gọi"** trên thanh Call Shield.

**Câu thoại:**
> "15 giây đủ để người thân lên tiếng. Người giám hộ nhận cảnh báo do AI soạn — số tài khoản đã che — và chặn bằng một chạm. Biên bản chỉ lưu mã băm của lệnh, không lưu văn bản thô.
> Nếu người giám hộ xác nhận an toàn, giao dịch được mở khóa và trừ tiền thật; ngưỡng FaceID 10 triệu/lần và 20 triệu/ngày theo Thông tư 50 vẫn giữ nguyên."

---

### ⏱ 3:00–3:30 — Fintech Ops phong tỏa đường dây 1903xxxx

**Thao tác:**
1. Bấm tab **"Fintech Future Workspace (Ops)"** (badge đếm cảnh báo đã tăng).
2. Banner đỏ **"KHẨN CẤP"**: *"⚠️ Cảnh báo An ninh mạng: Phát hiện bất thường — Có 5 tài khoản khác nhau cùng chuyển tiền vào STK 1903xxxx trong vòng 5 phút…"* → bấm **"Truy vết & Phong tỏa cụm STK"** → toast **"Đã phong tỏa cụm STK 1903xxxx"**.
3. Trong hàng đợi, chỉ 2 ticket mới: ticket **Soi mã VietQR** (mã dán đè) và ticket **Active Call Shield**; bấm **"Chặn & Thêm vào Blacklist"** ở ticket cuộc gọi.
4. KPI **"Tổng tiền rủi ro đã bảo vệ"** tăng; quay lại Ví: **"Danh sách cảnh báo (Blacklist)"** đã có cụm mới.

**Câu thoại:**
> "Đội vận hành thấy đúng những gì người dùng vừa gặp: mã QR dán đè, cuộc gọi thúc ép. Một cú bấm phong tỏa cả đường dây 1903xxxx — đúng tài khoản mà mã QR giả trỏ tới. Blacklist đồng bộ ngược về ví ngay lập tức."

---

### ⏱ 3:30–4:00 — AWS Security & FinOps

**Thao tác:**
1. Ở tab Ops, bấm **"AWS Security & FinOps"** (hoặc nút **"FinOps"** trên header).
2. Khối **"Live PII Masking Preview"**: bên trái **"Dữ liệu gốc (chỉ tồn tại trong RAM)"**, bên phải **"Dữ liệu gửi Amazon Bedrock (đã che)"**: `STK 19*****999`, `SĐT 090***888`, `CCCD 079******234`, số tiền **12.000.000đ giữ nguyên**; dòng *"Che phía máy chủ … • khứ hồi …"* là độ trễ đo thật; *"Lệnh gốc chỉ lưu dạng băm SHA-256"*.
3. Khối **"Resilience — Circuit Breaker"**: 3 dịch vụ Bedrock / Rekognition / Translate hiển thị **"Circuit Breaker: CLOSED (Healthy)"**, ngân sách ≤ 4000 / 2500 / 1500 ms; dòng **"Phân tích gần nhất"** ghi engine và độ trễ thật của lệnh vừa phân tích.
4. Khối **"Unit Economics"**: **~$0.0012** mỗi giao dịch (≈ 31 VNĐ), **"Giảm 78% chi phí"** so với baseline Sonnet-only $0.0056.

**Câu thoại:**
> "Ba cam kết kỹ thuật, nhìn được tận mắt. Một: **dữ liệu cá nhân được che trước khi rời biên tin cậy sang Bedrock** — đúng hàm máy chủ đang dùng, theo Nghị định 13. Hai: mỗi dịch vụ AWS có **Circuit Breaker và ngân sách thời gian**; khi mạch mở, hệ thống chuyển sang bộ luật dưới 50 mili-giây, vẫn trả đúng cấu trúc dữ liệu. Ba: định tuyến theo giá trị, phân tầng Haiku/Sonnet, Prompt Caching — **khoảng 0,0012 đô mỗi giao dịch**."

**Nếu đang chạy Offline:** dòng **"Phân tích gần nhất"** ghi *"Offline Heuristic (< 50 ms) • Độ trễ thực đo: … • chưa cấu hình AWS credentials (chế độ demo)"* — nói thẳng: *"Ngay lúc này máy demo đang chạy đúng chế độ dự phòng đó."*

---

### ⏱ 4:00–4:30 — Light/Dark, mobile-first, Hướng dẫn sử dụng, Kiro

**Thao tác:**
1. Đóng bảng FinOps. Trên header bấm **"🌙 Dark"** rồi **"☀️ Light"** — toàn bộ thẻ, form, modal đổi theme, không chói, không mất chữ.
2. Chuyển sang cửa sổ DevTools **390 px**: thanh phân hệ và thanh trợ lý cuộn ngang, nút cao tối thiểu 44 px, thẻ Hạ nhiệt hiển thị dạng **bottom sheet**.
3. Bấm **"📖 Hướng dẫn sử dụng"** → modal **"📖 Hướng dẫn sử dụng TrustPay AI"** với 5 chủ đề: *Chuyển tiền & Trợ lý AI Copilot · Quét & Soi mã VietQR an toàn · Trợ lý Mua sắm & Soát gói đăng ký · Lá chắn cuộc gọi lạ & Người giám hộ · Trung tâm Vận hành Ops*. Bấm **"Dùng thử ngay"** ở chủ đề *Quét & Soi mã VietQR an toàn* → app nhảy thẳng tới khung soi mã.
4. (Nếu còn thời gian) mở `tests/fraud-adversarial-suite.ts` ở F21–F25.

**Câu thoại:**
> "Người dùng thật cầm điện thoại 6 inch, dùng cả ngày lẫn đêm: giao diện mobile-first, sáng/tối, và một **Hướng dẫn sử dụng 5 chủ đề** với nút 'Dùng thử ngay' cho người mới. Mẹo nhanh ở đầu mỗi khu vực, tắt được.
> Chúng tôi xây theo **Spec-Driven Development với Kiro**: 25 kịch bản lừa đảo và 20 kịch bản prompt injection chạy trong CI — kể cả kiểm thử CRC của VietQR, Call Shield chỉ được *nâng* rủi ro, và che PII trước Bedrock."

---

### ⏱ 4:30–5:00 — Kết luận & lời kêu gọi

**Màn hình:** slide kết (logo TrustPay AI + 3 con số: **~$0.0012/GD**, **15 giây hạ nhiệt**, **< 50 ms dự phòng**).

**Câu thoại:**
> "Theo mô hình giả định trong hồ sơ FinOps, chi phí AI khoảng **31 đồng mỗi giao dịch**. Chặn được **một** vụ lừa 8 triệu đủ trả chi phí AI cho **khoảng 260.000 giao dịch**.
> TrustPay AI: **chặn rủi ro trước khi tiền rời ví — kể cả khi kẻ gian đang ở đầu dây bên kia hay dán mã QR giả trước mặt bạn — và để người dùng, người thân, đội vận hành cùng nhìn một sự thật.**
> Chúng tôi sẵn sàng đưa Lá Chắn AI vào luồng chuyển tiền P2P và thanh toán QR của MoMo. Xin cảm ơn!"

**Mẹo:** dừng đúng 5:00. Câu cuối nói chậm, nhìn giám khảo.

---

## 3. Bảng xử lý sự cố trên sân khấu

| Tình huống | Dấu hiệu | Xử lý ngay | Câu thoại cứu nguy |
|---|---|---|---|
| **Mạng hội trường yếu / mất** | Nút **"Lá chắn AI đang phân tích rủi ro..."** quay quá 3 giây | Driver tắt server, đổi tên `.env.local` → `.env.local.bak`, chạy lại `npm run start` (≈ 10 giây) → Offline Heuristic tức thì | *"Mạng hội trường vừa cho chúng tôi cơ hội minh họa tính năng quan trọng nhất: hệ thống vẫn bảo vệ người dùng khi mất kết nối AWS."* |
| AWS chậm / lỗi lặp lại | Bảng FinOps hiện **"OPEN (đang chạy Offline Heuristic)"** | Không cần làm gì: mạch OPEN tự đi thẳng bộ luật; sau 30 giây tự thử lại (HALF-OPEN) | *"Đây chính là Circuit Breaker đang làm việc."* |
| Quên kết thúc cuộc gọi mô phỏng | Mọi lệnh chuyển sau đó đều bị tạm giữ | Bấm **"Kết thúc cuộc gọi"** trên thanh Call Shield | *"Đúng thiết kế: còn nghe máy là còn tạm giữ."* |
| Ảnh QR không đọc được | Thông báo *"Trình duyệt này chưa hỗ trợ đọc QR từ ảnh…"* | Dùng 2 nút mẫu hoặc dán chuỗi QR vào ô **"Chuỗi mã QR (EMVCo)"** | — |
| Trình duyệt hỏi quyền camera | Popup quyền truy cập | Không bấm **"Dùng Webcam thật"** / **"Bật Webcam thật"**; luôn dùng **"Xác thực FaceID (ảnh Demo) & mở khóa"** hoặc **"Dùng ảnh khuôn mặt Demo"** | — |
| Lỡ cho phép giao dịch rủi ro | Số dư giảm | Bấm **"Reset Demo"** 2 lần, làm lại mốc 2:00 (≈ 25 giây) | *"Đây chính là lý do người dùng cần một lớp bảo vệ trước nút bấm."* |
| Máy chiếu Dark mode khó đọc | Chữ nhạt | Bấm **"☀️ Light"** | — |
| Laptop treo / hết pin | Màn hình đen | Chuyển sang video dự phòng, Presenter tiếp tục nói theo timeline | *"Chúng tôi chuyển sang bản ghi hình cùng kịch bản."* |
| Trễ giờ | Quá 3:30 khi còn ở tab Ops | Bỏ mốc 4:00–4:30, chỉ nói 1 câu: *"Giao diện mobile-first, sáng/tối, hướng dẫn 5 chủ đề, 45 kịch bản kiểm thử trong CI"*, rồi vào kết luận | — |

**Quy tắc vàng:** không bao giờ để khoảng lặng quá 3 giây. Driver xử lý kỹ thuật, Presenter tiếp tục nói.

---

## 4. Phương án rút gọn (nếu chỉ có 3 phút)

| Mốc | Nội dung |
|---|---|
| 0:00–0:30 | Hook mở đầu |
| 0:30–1:15 | **"Mô phỏng cuộc gọi lạ"** → Copilot gõ *Chuyển 12.000.000đ cho Nguyễn Văn Hùng* → **FROZEN** → **"Gửi cảnh báo cho Người giám hộ duyệt"** → **"Chặn & Hủy giao dịch ngay"** |
| 1:15–1:45 | **"Soi mã VietQR (QR Inspector)"** → mẫu **"QR Bị Dán Đè / Chứa Liên Kết Lạ"** bị chặn |
| 1:45–2:15 | Ops → **"Truy vết & Phong tỏa cụm STK"** |
| 2:15–3:00 | **"AWS Security & FinOps"** (che PII, CLOSED, ~$0.0012/GD) + kết luận |

---

## 5. Cầu nối sang phần Hỏi đáp

Khi giám khảo hỏi sâu, trả lời ngắn rồi dẫn chiếu tài liệu / mã nguồn:

| Chủ đề câu hỏi | Tài liệu / mã nguồn |
|---|---|
| VietQR / EMVCo, CRC-16, mã dán đè | `lib/qr/emvco.ts`, `lib/qr/vietqr-inspector.ts`, kiểm thử F21–F22 |
| Active Call Shield, Amazon Transcribe | `lib/call-shield/call-shield.ts`, kiểm thử F24 (chỉ nâng rủi ro, ADR-1) |
| AI Payment Copilot | `lib/copilot/payment-copilot.ts`, kiểm thử F23 |
| Che PII trước Bedrock (NĐ 13/2023) | `lib/security/prompt-redaction.ts`, `app/api/analyze/route.ts`, `app/api/pii-preview/route.ts`, kiểm thử F25 |
| Circuit Breaker & ngân sách thời gian | `lib/aws/service-breakers.ts`, `lib/resilience/circuit-breaker.ts`, `architecture/disaster-recovery-runbook.md` |
| Chi phí, ROI | `pitch-prep/unit-economics-finops.md` (mục 1.3 baseline, 1.4 FinOps), `lib/finops/unit-economics.ts` |
| Prompt injection, deepfake, replay | `architecture/threat-modeling-stride-atlas.md` |
| Ngưỡng 10 triệu / 20 triệu, thiết bị tin cậy | `compliance/nhnn-circular-50-decision-2345-matrix.md` |
| CCCD, sinh trắc học, lưu trú dữ liệu | `compliance/decree-13-dpia-report.md` |
| Tích hợp vào SuperApp MoMo | `pitch-prep/momo-superapp-sdk-integration.md` |
| 25 câu hỏi CTO/CISO đã chuẩn bị | `pitch-prep/cto-ciso-deep-dive-qa.md` |

**Trả lời trung thực những điểm đang mô phỏng:**
- Phụ đề cuộc gọi là **kịch bản phát lại theo thời gian** mô phỏng Amazon Transcribe Streaming; bản demo không thu âm.
- Tra cứu tên chủ tài khoản NAPAS là **mô phỏng** cho 2 tài khoản demo; Production gọi API ngân hàng/NAPAS phía máy chủ.
- Copilot hiểu ý định bằng bộ luật chạy trên trình duyệt; lệnh chuyển tiền vẫn đi qua Lá chắn AI (Bedrock + bộ luật).
- Đơn giá AWS là **giả định mẫu**; con số ~$0.0012/GD là kịch bản FinOps mục 1.4, baseline hiện tại ≈ $0.0056/GD. Trong mã hiện tại, đòn bẩy "chỉ dịch văn bản không phải tiếng Việt" đã chạy thật; định tuyến 40% và phân tầng Haiku/Sonnet là mục tiêu triển khai.
- Nếu giám khảo chỉ ra một khoảng trống khác, xác nhận thẳng thắn và dẫn tới task khắc phục trong `.kiro/specs/trustpay-ai/tasks.md`; bộ kiểm thử đánh dấu sẵn các khoảng trống là `KNOWN-GAP`.

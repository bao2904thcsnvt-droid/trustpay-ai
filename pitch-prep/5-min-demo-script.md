# TrustPay AI — Kịch bản Demo & Thuyết trình 5 phút (bản vòng chung kết · v3)

> **Sự kiện:** MoMo TechDay 2026 · **Thời lượng:** 5:00 (10 mốc × 30 giây) · **Đội hình:** 1 người nói (Presenter), 1 người điều khiển máy (Driver). Nếu chỉ có 1 người, Presenter tự thao tác và nói theo đúng cột "Câu thoại".
> **Nguyên tắc:** mọi nhãn nút trong ngoặc kép **"…"** là **nhãn thật** trên giao diện tiếng Việt của TrustPay AI. Mọi số liệu thị trường phải được thay bằng nguồn chính thức đã kiểm chứng trước giờ thi (ô `[CHÈN SỐ LIỆU]`). Mọi đơn giá AWS là giả định mẫu (xem `pitch-prep/unit-economics-finops.md` mục 1.4).
> **v3 bổ sung:** chuyển tiền THẬT qua VietQR / DeepLink (Real Payment Handoff) và **Chế độ Nhúng SDK MoMo** với Decision Token `postMessage`.

---

## 0. Chuẩn bị trước giờ thi (T−30 phút)

| # | Việc cần làm | Lý do |
|---|---|---|
| 1 | Ở nơi có Internet ổn định: `npm ci` → `npx tsc --noEmit` → `npm run test:fraud` → `npm run test:injection` → `npm run build` | Cổng chất lượng phải sạch (F01–F28, P01–P20); `next/font/google` tải font lúc build |
| 2 | Tại hội trường: `npm run start`, mở `http://localhost:3000` bằng **Chrome hoặc Edge** | Chạy trên laptop nên không phụ thuộc mạng hội trường |
| 3 | Chọn chế độ AI: mạng tốt thì giữ `.env.local` (gọi AWS thật); mạng yếu thì đổi tên `.env.local` → `.env.local.bak` rồi khởi động lại | Thiếu AWS credentials ⇒ API chạy **Offline Heuristic** tức thì |
| 4 | **Chuẩn bị tài khoản nhận THẬT của đội** (có sự đồng ý của chủ tài khoản): ghi sẵn ngân hàng + STK + tên không dấu trên giấy | Dùng ở mốc 0:30–1:30 để Ban Giám Khảo quét VietQR bằng app ngân hàng thật. **Không** dùng STK của người khác |
| 5 | Chuẩn bị 1 điện thoại có app ngân hàng / MoMo của đội để quét thử trước giờ thi | Xác nhận app hiện đúng tên người nhận, số tiền, nội dung |
| 6 | Mở thử `https://img.vietqr.io` trên mạng hội trường | Bị chặn hay mất mạng: hộp chuyển tiền tự chuyển sang **"QR tạo trên máy"** — quét vẫn chuyển tiền thật |
| 7 | Mở sẵn tab thứ hai `http://localhost:3000/sdk-host-demo.html` | Trang Host App mẫu nhúng TrustPay SDK trong iframe, in gói tin `postMessage` thật (mốc 3:00–3:30) |
| 8 | Chạy thử 1 lượt toàn bộ kịch bản, sau đó bấm **"Reset Demo"** 2 lần (**"Bấm lần nữa để xác nhận"** → **"Đã khôi phục!"**) | Số dư về 15.000.000đ, ticket/Blacklist/cuộc gọi mô phỏng/QR/Copilot/Decision Token về mặc định. Reset **không** đổi ngôn ngữ, theme và chế độ nhúng |
| 9 | Chọn theme theo máy chiếu: phòng sáng → **"☀️ Light"**, phòng tối → **"🌙 Dark"** | Lựa chọn được lưu |
| 10 | Zoom trình duyệt 110–125%, toàn màn hình, tắt thông báo hệ điều hành | Chữ đủ to trên máy chiếu |
| 11 | Mở sẵn video dự phòng (theo `docs/DEMO_VIDEO_SCRIPT.md`) trên thiết bị thứ hai | Phương án cuối nếu laptop gặp sự cố |

**Trạng thái màn hình lúc bắt đầu:** thẻ **"Chào mừng đến với TrustPay AI"** với 2 nút **"Vào Ví ngay"** và **"Vào Ops ngay"**.

> ⚠️ **An toàn tiền thật:** mã VietQR trong demo là mã chuyển tiền THẬT. Khi mời giám khảo quét, nói rõ: *"Quý vị chỉ cần xem app hiện đúng người nhận và số tiền, không cần bấm xác nhận."*

---

## 1. Timeline tổng quan

| Mốc | Phần | Màn hình | Mục tiêu với giám khảo |
|---|---|---|---|
| 0:00–0:30 | Hook: cuộc gọi "cán bộ điều tra" | Thẻ chào mừng → Ví | Ai cũng có thể là nạn nhân, kể cả khi lệnh chuyển trông vô hại |
| 0:30–1:00 | Copilot + Ngân hàng nhận THẬT → AN TOÀN | Tab "Chuyển tiền & Lá chắn AI" | Lá chắn AI kiểm tra đúng STK sẽ nhận tiền thật |
| 1:00–1:30 | **Real Payment Handoff:** quét VietQR thật, DeepLink, sao chép | Hộp "Chuyển tiền thật qua Ngân hàng / MoMo" | Dùng được ngay ngoài đời thật, TrustPay không giữ tiền |
| 1:30–2:00 | Soi mã VietQR: mã dán đè bị chặn | Tab "Soi mã VietQR (QR Inspector)" | Chặn chiêu QR dán đè trước khi quét tiền |
| 2:00–2:30 | Active Call Shield: chuyển tiền khi đang nghe máy | Khung chuyển tiền | Ngữ cảnh cuộc gọi biến lệnh "sạch" thành rủi ro CAO, tạm giữ 15 giây |
| 2:30–3:00 | Người giám hộ chặn — hộp chuyển tiền thật bị khóa | Thẻ Hạ nhiệt + điện thoại mô phỏng | Tiền thật chỉ đi khi AN TOÀN hoặc người thân cho phép |
| 3:00–3:30 | **🔌 Chế độ Nhúng SDK (MoMo Embedded)** + Decision Token | Khung Host App MoMo + Inspector | Tích hợp vào MoMo / ngân hàng bằng 1 hook, kiểm chứng được |
| 3:30–4:00 | Fintech Ops phong tỏa đường dây 1903xxxx | Tab "Fintech Future Workspace (Ops)" | Vòng khép kín 2 chiều Ví ↔ Ops |
| 4:00–4:30 | AWS Security & FinOps + Mô hình Triển khai Thực tế | Bảng "AWS Security & FinOps" | Che PII theo NĐ 13, Circuit Breaker, ~$0.0012/GD, Zero-License |
| 4:30–5:00 | Kết luận & lời kêu gọi | Slide kết | Triển khai thương mại ngay, sẵn sàng tích hợp MoMo |

---

## 2. Kịch bản chi tiết từng mốc 30 giây

### ⏱ 0:00–0:30 — Hook mở đầu

**Màn hình:** thẻ **"Chào mừng đến với TrustPay AI"**.

**Thao tác:** ở giây 0:25, Driver bấm **"Vào Ví ngay"** → tab **"Ví Người Dùng & Lá Chắn AI"**, thẻ **"Số dư ví khả dụng"** hiển thị **15.000.000đ**.

**Câu thoại:**
> "Thưa Ban Giám Khảo, điện thoại đổ chuông: *'Tôi là cán bộ điều tra. Tài khoản của anh liên quan vụ án rửa tiền, sẽ bị phong tỏa trong 30 phút. Anh chuyển gấp sang tài khoản an toàn.'*
> Kẻ gian không cần nạn nhân gõ chữ 'công an' vào lệnh chuyển. Hắn chỉ cần nạn nhân **đang cầm máy**.
> TrustPay AI là lớp lá chắn AI đứng **trước nút chuyển tiền** — và hôm nay quý vị sẽ thấy nó hoạt động với **tiền thật, ngân hàng thật**."

`[CHÈN SỐ LIỆU]` — *số vụ / thiệt hại lừa đảo trực tuyến tại Việt Nam năm gần nhất, nguồn Bộ Công an hoặc NHNN.* Không nói số khi chưa kiểm chứng nguồn.

---

### ⏱ 0:30–1:00 — Copilot + Ngân hàng nhận tiền thật (AN TOÀN)

**Màn hình:** tab **"Chuyển tiền & Lá chắn AI"** trong khung **"Trợ lý AI hành động thay bạn"**.

**Thao tác:**
1. Trong **"AI Payment Copilot"**, bấm gợi ý **"Chuyển 250.000đ tiền ăn trưa cho Nguyễn Minh"** → form **"Chuyển tiền thông minh & Quét Lá chắn AI"** được điền sẵn.
2. Trong khối **"Ngân hàng / Ví nhận tiền thật"**: chọn ngân hàng của đội (vd **"VCB — Vietcombank (970436)"**), nhập **"Số tài khoản"** thật của đội và **"Tên người nhận (không dấu)"**.
3. Chỉ dòng gợi ý ngay bên dưới: *"Khi phân tích, Lá chắn AI kiểm tra cả STK … — đối chiếu Blacklist & cụm 1903xxxx."*
4. Bấm **"Phân tích giao dịch với Lá chắn AI"** → badge **"LOW • AN TOÀN"**.

**Câu thoại:**
> "Tôi nói như nhắn tin, Copilot điền sẵn lệnh. Điểm khác biệt: tôi chọn **ngân hàng và số tài khoản thật** — Lá chắn AI đối chiếu Blacklist trên **chính tài khoản sẽ nhận tiền**, không phải trên một cái tên. Rủi ro thấp — đi thẳng."

---

### ⏱ 1:00–1:30 — Real Payment Handoff: quét VietQR thật

**Thao tác:**
1. Ngay dưới kết quả, hộp **"Chuyển tiền thật qua Ngân hàng / MoMo (Real Payment Handoff)"** hiện badge **"AN TOÀN — đã mở chuyển tiền thật"** với mã **"Ảnh VietQR (img.vietqr.io)"**.
2. **Mời một giám khảo mở app ngân hàng hoặc MoMo của chính họ và quét mã** → app hiện đúng tên chủ tài khoản của đội, **250.000đ** và nội dung **"tien an trua"**. Nhắc: *không cần bấm xác nhận*.
3. Chỉ 3 nút: **"Mở App Ngân hàng (VietQR DeepLink)"** (trên máy tính: tự sao chép và hiện hướng dẫn), **"Mở Ví MoMo chuyển thật"** (hiện 3 bước quét bằng MoMo), **"Sao chép STK & Nội dung"** → toast **"Đã sao chép STK & nội dung chuyển khoản"**.
4. Bấm **"QR tạo trên máy"** → mã được vẽ ngay trên laptop (không gửi dữ liệu ra ngoài); mở **"Chuỗi EMVCo"** để thấy **"CRC-16 hợp lệ (…)"**.

**Câu thoại:**
> "Đây là mã VietQR chuẩn EMVCo của NAPAS — app ngân hàng nào cũng quét được. TrustPay AI **không giữ một đồng nào**: tiền đi thẳng từ app của quý vị qua NAPAS 247.
> Mất mạng? Mã QR được vẽ ngay trên máy, CRC-16 tính tại chỗ — vẫn chuyển được tiền thật."

**Nói rõ nếu bị hỏi:** điện thoại không tự quét được màn hình của chính nó — trên điện thoại dùng **"Lưu ảnh QR (PNG)"** rồi chọn ảnh trong app ngân hàng, hoặc **"Sao chép STK & Nội dung"**.

---

### ⏱ 1:30–2:00 — Soi mã VietQR: mã dán đè bị chặn

**Thao tác:**
1. Bấm tab **"Soi mã VietQR (QR Inspector)"**.
2. Bấm mẫu **"QR Bị Dán Đè / Chứa Liên Kết Lạ"** → khung đỏ **"NGUY HIỂM — đã chặn thanh toán"**, **100/100**: *Tên trên mã không khớp chủ tài khoản* · *Mã chứa liên kết lạ: https://momo-hoantien.xyz/otp* · *STK khớp Blacklist: 1903xxxx…*. Toast **"Đã chặn mã VietQR nguy hiểm • TCK-…"**.
3. (Nếu còn giây) bấm **"QR Quán Cà Phê Hợp Lệ"** → **"AN TOÀN — có thể thanh toán"**.

**Câu thoại:**
> "Mã vừa rồi do chính TrustPay tạo và đi qua đúng bộ giải mã này. Còn đây là chiêu dán mã giả đè lên mã của quán quen: tên vẫn đúng, nhưng tiền chảy vào đường dây 1903xxxx. Bị chặn trước khi quét tiền."

---

### ⏱ 2:00–2:30 — Active Call Shield: chuyển tiền khi đang nghe máy

**Thao tác:**
1. Về tab **"Chuyển tiền & Lá chắn AI"**. Dòng **"Trạng thái cuộc gọi: Bình thường"** → bấm **"Mô phỏng cuộc gọi lạ"** → **"Đang nghe cuộc gọi từ số lạ (+84 9xx xxx 247)"**, phụ đề **"Phụ đề trực tiếp — Amazon Transcribe (mô phỏng streaming)"** tô đỏ *cán bộ điều tra, phong tỏa, chuyển gấp, tài khoản an toàn, mã OTP*.
2. Giữ nguyên người nhận thật của đội, sửa lệnh thành **Chuyển 12.000.000đ cho Nguyễn Minh** → bấm **"Phân tích giao dịch với Lá chắn AI"**.
3. Toast **"Phát hiện chuyển tiền khi đang nghe máy"**; thẻ **"Cơ chế Hạ nhiệt tâm lý — Vui lòng bình tĩnh kiểm tra lại"** (laptop: góc phải dưới) với **"FROZEN • Đang tạm giữ"**, đồng hồ 15 giây.
4. Chỉ nhanh hộp bên dưới kết quả: **"Chuyển tiền thật đang bị khóa"**.

**Câu thoại:**
> "Cùng người nhận đó, lệnh hoàn toàn 'sạch' — nhưng được tạo **trong lúc đang nghe một số lạ** đọc từng câu thúc ép. Rủi ro lên CAO, giao dịch bị giữ 15 giây, và **mã chuyển tiền thật bị khóa**: kẻ gian không thể bắt nạn nhân quét mã ngay lúc này."

---

### ⏱ 2:30–3:00 — Người giám hộ chặn

**Thao tác:**
1. Bấm **"Gửi cảnh báo cho Người giám hộ duyệt"** → **"Đã gửi tới Nguyễn Văn A"**; **"📱 Điện thoại Người giám hộ: Nguyễn Văn A"** nhận **"Cảnh báo giao dịch rủi ro cao"**.
2. Bấm **"Chặn & Hủy giao dịch ngay"** → **"Đã bảo vệ thành công!"**, số dư giữ nguyên; bấm **"Tải biên bản (.txt)"**.
3. Bấm **"Đóng"**, rồi **"Kết thúc cuộc gọi"**.

**Câu thoại:**
> "15 giây đủ để người thân lên tiếng. Nếu người giám hộ bấm **'Xác nhận an toàn – Cho phép chuyển'**, hộp chuyển tiền thật mới mở — kèm nút **'Mở chuyển tiền thật (VietQR)'**. Tiền thật chỉ đi khi AI nói an toàn, hoặc người thân cho phép."

---

### ⏱ 3:00–3:30 — 🔌 Chế độ Nhúng SDK (MoMo Embedded)

**Thao tác:**
1. Trên header bấm **"🔌 Chế độ Nhúng SDK (MoMo Embedded)"** (màn hình dưới 1024 px hiện gọn **"🔌 Nhúng SDK"**; hoặc mở `http://localhost:3000/?embed=momo`) → toast **"Đã bật Chế độ Nhúng SDK (MoMo Embedded)"**.
2. Khung **"MoMo · Chuyển tiền"** (Host App) bao bọc khung nét đứt **"TrustPay AI SDK · onBeforeTransferConfirm"**. Bên phải: **"Tầng 1 – Host App (MoMo / Ngân hàng)"** (Server Ledger, C06 cho giao dịch > 10.000.000 VNĐ, NAPAS 247) và **"Tầng 2 – TrustPay AI SDK (onBeforeTransferConfirm)"**.
3. Xem **"SDK Event & Decision Token Inspector"** (mới nhất ở trên): **SDK → HOST · onGuardianDecision · BLOCK** (mốc 2:30), **onBeforeTransferConfirm · HOLD_GUARDIAN** (mốc 2:00), các dòng **onQrInspected** (mốc 1:30) và **onBeforeTransferConfirm · ALLOW** (mốc 0:30). Mở một dòng để thấy JSON: `decision`, `riskScore`, `biometricRequired`, `signatureHash`, STK đã che.
4. (Nếu còn giây) chuyển sang tab **sdk-host-demo.html**: Host mẫu bấm **"Gửi yêu cầu kiểm duyệt"** → SDK trong iframe điền sẵn lệnh → phân tích → Host in gói tin `TRUSTPAY_SDK_DECISION` và **"signatureHash hợp lệ"**.

**Câu thoại:**
> "Với MoMo hay ngân hàng, TrustPay là một **SDK cắm vào đúng một hook — onBeforeTransferConfirm**. Host vẫn giữ tiền, sổ cái, xác thực CCCD gắn chip C06 và NAPAS 247. SDK chỉ trả về một **Decision Token**: ALLOW, HOLD_GUARDIAN hoặc BLOCK — kèm điểm rủi ro, yêu cầu sinh trắc và **signatureHash** để Host tự kiểm tra. Không có số tài khoản thô nào rời SDK."

---

### ⏱ 3:30–4:00 — Fintech Ops phong tỏa đường dây 1903xxxx

**Thao tác:**
1. Bấm **"🔌 Thoát chế độ nhúng"**, rồi tab **"Fintech Future Workspace (Ops)"**.
2. Banner **"KHẨN CẤP"** → bấm **"Truy vết & Phong tỏa cụm STK"** → toast **"Đã phong tỏa cụm STK 1903xxxx"**.
3. Chỉ ticket **Soi mã VietQR** (mã dán đè) và ticket **Active Call Shield** trong hàng đợi.

**Câu thoại:**
> "Đội vận hành thấy đúng những gì người dùng vừa gặp. Một cú bấm phong tỏa cả đường dây — đúng tài khoản mà mã QR giả trỏ tới. Blacklist đồng bộ ngược về ví và về SDK ngay lập tức."

---

### ⏱ 4:00–4:30 — AWS Security & FinOps + Mô hình Triển khai Thực tế

**Thao tác:**
1. Bấm **"AWS Security & FinOps"** → **"Live PII Masking Preview"**: CCCD/SĐT/STK bị che trước khi gửi Amazon Bedrock (NĐ 13/2023), số tiền giữ nguyên.
2. **"Resilience — Circuit Breaker"**: 3 dịch vụ **"Circuit Breaker: CLOSED (Healthy)"**; **"Unit Economics"**: **~$0.0012** mỗi giao dịch.
3. Cuộn xuống thẻ **"Mô hình Triển khai Thực tế (Zero-License SDK & VietQR Handoff)"**.

**Câu thoại:**
> "Dữ liệu cá nhân được che trước khi rời biên tin cậy; mỗi dịch vụ AWS có Circuit Breaker; chi phí khoảng 0,0012 đô mỗi giao dịch.
> Và mô hình kinh doanh: TrustPay **không giữ tiền hộ** khách hàng — không mở ví, không giữ số dư — nên không cần giấy phép trung gian thanh toán với vốn 50 tỷ đồng. Chúng tôi là lớp lá chắn AI đứng trước cổng thanh toán của MoMo và NAPAS 247: **triển khai thương mại được ngay**."

---

### ⏱ 4:30–5:00 — Kết luận & lời kêu gọi

**Màn hình:** slide kết (logo TrustPay AI + 3 con số: **~$0.0012/GD**, **15 giây hạ nhiệt**, **1 hook tích hợp**).

**Câu thoại:**
> "Quý vị vừa quét một mã VietQR thật, thấy một lệnh bị khóa khi đang nghe điện thoại lạ, và thấy Decision Token mà MoMo sẽ nhận.
> TrustPay AI: **chặn rủi ro trước khi tiền rời ví, không giữ tiền của ai, và cắm vào siêu ứng dụng bằng một hook duy nhất.** Giao diện sáng/tối, mobile-first, có hướng dẫn 5 chủ đề cho người mới.
> Chúng tôi sẵn sàng đưa Lá Chắn AI vào luồng chuyển tiền P2P và thanh toán QR của MoMo. Xin cảm ơn!"

**Mẹo:** dừng đúng 5:00. Câu cuối nói chậm, nhìn giám khảo.

---

## 3. Bảng xử lý sự cố trên sân khấu

| Tình huống | Dấu hiệu | Xử lý ngay | Câu thoại cứu nguy |
|---|---|---|---|
| **Mạng hội trường yếu / mất** | Nút **"Lá chắn AI đang phân tích rủi ro..."** quay quá 3 giây | Driver đổi tên `.env.local` → `.env.local.bak`, chạy lại `npm run start` (≈ 10 giây) → Offline Heuristic | *"Hệ thống vẫn bảo vệ người dùng khi mất kết nối AWS."* |
| Ảnh VietQR không tải | Dòng *"Không tải được ảnh VietQR — đã chuyển sang mã QR vẽ ngay trên máy."* | Không cần làm gì — mã trên máy vẫn quét chuyển tiền thật | *"Đây chính là chế độ dự phòng Offline."* |
| App ngân hàng của giám khảo không nhận mã | Báo mã không hợp lệ | Bấm **"Sao chép STK & Nội dung"**, đọc STK; hoặc chọn **"QR tạo trên máy"** và quét lại | — |
| **"Mở App Ngân hàng (VietQR DeepLink)"** trên laptop không mở app | Hiện *"Trên máy tính: đã sao chép STK & nội dung…"* | Đúng thiết kế — DeepLink chỉ mở app trên điện thoại | — |
| Quên kết thúc cuộc gọi mô phỏng | Mọi lệnh chuyển sau đó đều bị tạm giữ | Bấm **"Kết thúc cuộc gọi"** | *"Đúng thiết kế: còn nghe máy là còn tạm giữ."* |
| Inspector trống khi bật chế độ nhúng | Chưa có giao dịch nào | Phân tích lại một lệnh trong khung SDK | — |
| `sdk-host-demo.html` không nhận gói tin | Inspector ghi *"Không gửi: chưa khai báo hostOrigin tin cậy"* | Mở trang bằng `http://localhost:3000/...` (http qua IP mạng LAN bị từ chối theo thiết kế; Production dùng https + `NEXT_PUBLIC_TRUSTPAY_HOST_ORIGINS`) | *"SDK chỉ nói chuyện với Host đã khai báo."* |
| Trình duyệt hỏi quyền camera | Popup quyền truy cập | Luôn dùng **"Xác thực FaceID (ảnh Demo) & mở khóa"** hoặc **"Dùng ảnh khuôn mặt Demo"** | — |
| Lỡ cho phép giao dịch rủi ro | Số dư giảm | Bấm **"Reset Demo"** 2 lần, làm lại mốc 2:00 | *"Đây chính là lý do người dùng cần một lớp bảo vệ trước nút bấm."* |
| Laptop treo / hết pin | Màn hình đen | Chuyển sang video dự phòng | *"Chúng tôi chuyển sang bản ghi hình cùng kịch bản."* |
| Trễ giờ | Quá 3:30 khi còn ở chế độ nhúng | Bỏ mốc Ops, nói 1 câu: *"Ops phong tỏa cụm 1903xxxx bằng một cú bấm"*, vào FinOps | — |

**Quy tắc vàng:** không bao giờ để khoảng lặng quá 3 giây. Driver xử lý kỹ thuật, Presenter tiếp tục nói.

---

## 4. Phương án rút gọn (nếu chỉ có 3 phút)

| Mốc | Nội dung |
|---|---|
| 0:00–0:30 | Hook mở đầu |
| 0:30–1:15 | Copilot + **"Ngân hàng / Ví nhận tiền thật"** → AN TOÀN → giám khảo quét VietQR thật trong **"Chuyển tiền thật qua Ngân hàng / MoMo (Real Payment Handoff)"** |
| 1:15–2:00 | **"Mô phỏng cuộc gọi lạ"** → cùng người nhận, 12.000.000đ → **FROZEN**, hộp chuyển tiền thật bị khóa → **"Chặn & Hủy giao dịch ngay"** |
| 2:00–2:30 | **"🔌 Chế độ Nhúng SDK (MoMo Embedded)"** → Inspector: `HOLD_GUARDIAN` / `BLOCK` / `ALLOW` + `signatureHash` |
| 2:30–3:00 | Thẻ **"Mô hình Triển khai Thực tế (Zero-License SDK & VietQR Handoff)"** + kết luận |

---

## 5. Phần mở rộng (nếu còn thời gian / Hỏi đáp)

- **Copilot tra hạn mức thật:** gợi ý **"Kiểm tra hạn mức Mua sắm còn bao nhiêu?"** → *"Hạn mức Mua sắm còn 1.500.000đ (đã dùng 2.500.000đ / 4.000.000đ)."*
- **Soát gói trừ tiền ngầm:** **"Soát giúp tôi các gói đăng ký đang bị trừ tiền ngầm"** → mở **"Subscription Guard"** → **"Hủy gia hạn ngay"**.
- **Hướng dẫn người mới:** **"📖 Hướng dẫn sử dụng"** → 5 chủ đề + thẻ Mô hình Triển khai Thực tế, nút **"Dùng thử ngay"**.
- **Mobile-first:** DevTools 390 px — thanh tab cuộn ngang, nút ≥ 44 px, thẻ Hạ nhiệt dạng bottom sheet.

---

## 6. Cầu nối sang phần Hỏi đáp

| Chủ đề câu hỏi | Tài liệu / mã nguồn |
|---|---|
| VietQR thật, CRC-16, vẽ QR trên máy | `lib/payments/vietqr-builder.ts`, `lib/qr/qr-matrix.ts`, `lib/qr/emvco.ts`, kiểm thử F26–F27 |
| Danh bạ ngân hàng / BIN NAPAS | `lib/payments/banks.ts` |
| Decision Token, `postMessage`, Host bridge | `lib/sdk/decision-token.ts`, `lib/sdk/host-bridge.ts`, `public/sdk-host-demo.html`, kiểm thử F28 |
| VietQR Inspector (mã dán đè) | `lib/qr/vietqr-inspector.ts`, kiểm thử F21–F22 |
| Active Call Shield | `lib/call-shield/call-shield.ts`, kiểm thử F24 |
| Che PII trước Bedrock (NĐ 13/2023) | `lib/security/prompt-redaction.ts`, `app/api/analyze/route.ts`, kiểm thử F25 |
| Chi phí, ROI | `pitch-prep/unit-economics-finops.md` (mục 1.3, 1.4), `lib/finops/unit-economics.ts` |
| Ngưỡng 10 triệu / 20 triệu (TT 50) | `compliance/nhnn-circular-50-decision-2345-matrix.md` |
| Tích hợp vào SuperApp MoMo | `pitch-prep/momo-superapp-sdk-integration.md` |

**Trả lời trung thực những điểm cần nói rõ:**
- **Pháp lý "Zero-License":** TrustPay không giữ tiền, không mở ví; câu "không cần giấy phép trung gian thanh toán (vốn tối thiểu 50 tỷ đồng theo NĐ 52/2024/NĐ-CP)" là lập luận của đội — **cần luật sư xác nhận** trước khi ký hợp đồng. Khi làm nhà cung cấp công nghệ cho ngân hàng, đối tác vẫn áp dụng quy định thuê ngoài CNTT của NHNN.
- **Ví MoMo nhận tiền:** mã BIN 971025 cho ví MoMo trong danh bạ demo **chưa được kiểm chứng** với danh sách NAPAS mới nhất; vì vậy với MoMo, ảnh từ img.vietqr.io bị tắt và nên dùng **"Sao chép STK & Nội dung"** hoặc mã nhận tiền MoMo của chính người nhận.
- **DeepLink `dl.vietqr.io/pay?app=…`:** mở app ngân hàng của người trả; người dùng quét / chọn ảnh QR trong app. Trên máy tính chỉ sao chép thông tin.
- **`signatureHash`:** bản demo là SHA-256 trên JSON chuẩn hóa (kiểm tra toàn vẹn). Production: HMAC-SHA256 / ECDSA ký bằng AWS KMS phía máy chủ, Host xác minh bằng khóa công khai; chỉ nhận/gửi `postMessage` với origin trong `NEXT_PUBLIC_TRUSTPAY_HOST_ORIGINS`.
- **Host App mô phỏng:** khung MoMo, C06 và NAPAS 247 trong chế độ nhúng là **mô phỏng giao diện**; số dư là sổ cái demo trên trình duyệt.
- Phụ đề cuộc gọi là kịch bản phát lại mô phỏng Amazon Transcribe; tra tên chủ tài khoản trong QR Inspector chỉ có 2 tài khoản demo.

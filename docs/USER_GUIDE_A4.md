# TrustPay AI — Hướng dẫn trải nghiệm nhanh (1 trang A4)

**Dành cho:** Ban Giám Khảo MoMo TechDay 2026 · **Thời gian:** ~5 phút · **Số dư Demo:** 15.000.000đ

### Bước 0 — Đăng nhập 1-click
Mở ứng dụng → bấm **"Đăng nhập nhanh bằng Tài khoản Demo (Ban Giám Khảo)"** (không cần mật khẩu).
Giao diện gồm 2 tab trên thanh header: **Ví Người Dùng & Lá Chắn AI** (Tab 1) và **Fintech Future Workspace (Ops)** (Tab 2, có badge đếm cảnh báo — ban đầu là **1**).

> Mỗi kịch bản: chọn thẻ trong mục **"Kịch bản Demo nhanh (1-click cho Ban Giám Khảo)"** → lệnh tự điền → bấm **"Phân tích giao dịch với Lá chắn AI"** (hoặc `Ctrl + Enter`).

### Bước 1 — Kịch bản 1: Giao dịch an toàn
- **Lệnh:** *Chuyển 45.000đ tiền bún bò cho Quán Cô Ba*
- **Kỳ vọng:** Rủi ro **LOW** · danh mục **Ăn uống** · hạn mức còn **1.755.000đ**.
- **Thao tác:** bấm **"Xác nhận chuyển tiền (45.000đ)"** → toast thành công, số dư còn **14.955.000đ**, thanh ngân sách Ăn uống cập nhật.

### Bước 2 — Kịch bản 2: Vượt ngân sách
- **Lệnh:** *Thanh toán 2.500.000đ mua giày sneaker tại Shop XYZ*
- **Kỳ vọng:** Rủi ro **LOW** nhưng **vượt hạn mức Mua sắm 1.000.000đ** + gợi ý trì hoãn/điều chỉnh hạn mức.
- **Thao tác:** có thể xác nhận hoặc bấm **"Hủy giao dịch"** (số dư & ngân sách giữ nguyên). Không tạo ticket Ops (vì rủi ro thấp).

### Bước 3 — Kịch bản 3: Lừa đảo mạo danh & Blacklist
- **Lệnh:** *Chuyển gấp 12.000.000đ cho Cán bộ điều tra STK 999988887777 để xác minh tài khoản*
- **Kỳ vọng:** Rủi ro **HIGH – 95/100** · loại: *Mạo danh Cơ quan Công an / Cán bộ điều tra* · red flags: Blacklist, mạo danh, thúc ép "chuyển gấp", vượt hạn mức.
- **Toast:** "Đã đẩy cảnh báo HIGH sang Fintech Ops" → badge Tab 2 tăng lên **2**.

### Bước 4 — Xác thực sinh trắc học (FaceID)
- Bấm nút đỏ **"Cảnh báo rủi ro cao — Xác thực khuôn mặt trước khi chuyển"** → mở modal *Amazon Rekognition CompareFaces*.
- Chọn **"Dùng ảnh khuôn mặt Demo"** (hoặc **"Bật Webcam thật"**) → **"Chụp & Xác thực ngay"** → hiển thị độ khớp (ngưỡng ≥ 80%; chế độ demo ≈ 98,4%).
- Khuyến nghị: bấm **"Hủy giao dịch"** để minh họa người dùng được bảo vệ thành công.

### Bước 5 — Kịch bản 4: Bẫy trúng thưởng / Phí nhận quà
- **Lệnh:** *Chuyển 3.000.000đ phí nhận thưởng iPhone 16 Pro Max cho Trung tâm CSKH*
- **Kỳ vọng:** Rủi ro **HIGH – 88/100** · *Lừa đảo đóng phí nhận thưởng / Quà tặng giá trị cao* · bắt buộc FaceID · badge Tab 2 lên **3**.
- *(Tùy chọn)* Bấm **"Tải ảnh / Chụp hóa đơn & tin nhắn"** để đính kèm ảnh tin nhắn — OCR qua Rekognition, ảnh hiển thị làm bằng chứng ở Tab 2.

### Bước 6 — Kiểm tra đồng bộ sang Tab 2 (Ops)
1. Chuyển sang **Fintech Future Workspace (Ops)** → thấy ticket mới (trạng thái **PENDING**) với điểm rủi ro AI, tóm tắt, hành động đề xuất, ảnh bằng chứng (nếu có).
2. Với ticket Kịch bản 3/4: bấm **"Chặn & Thêm vào Blacklist"** → ticket chuyển **BLOCKED**, badge giảm.
3. Quay lại **Tab 1** → người nhận vừa chặn đã xuất hiện trong **Blacklist** ở cột trái (đồng bộ thời gian thực).
4. Thử **"Phê duyệt an toàn"** với ticket mẫu có sẵn để xem trạng thái **APPROVED**.

### Mẹo & lưu ý
- **Reset dữ liệu Demo** (góc phải header) đưa mọi thứ về ban đầu: số dư 15.000.000đ, ngân sách, Blacklist, ticket.
- Có thể tự gõ lệnh tự do (vd: *"chuyển 5tr cho …"*, *"45k cà phê"*). Khi AWS không khả dụng, **Smart Fallback** vẫn trả kết quả cùng định dạng; điểm số thực tế khi gọi Bedrock có thể chênh nhẹ so với điểm tham chiếu ở trên.
- Ngân sách mặc định: Ăn uống 1,2/3tr · Mua sắm 2,5/4tr · Di chuyển 0,4/1tr · Khác 0,5/2tr. Blacklist mặc định: `999988887777`, `1903888999`, `Cán bộ điều tra`.

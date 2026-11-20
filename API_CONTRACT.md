# TrustPay AI - API Contract

Tài liệu này khóa chặt chuẩn giao tiếp API giữa Frontend, Backend và Fintech Ops Dashboard cho dự án **TrustPay AI**. Tất cả các bên bắt buộc phải import kiểu dữ liệu từ `@/types/trustpay`.

---

## 1. Phân tích giao dịch & Rủi ro lừa đảo

- **Endpoint:** `/api/analyze`
- **Method:** `POST`
- **Request Body:** `TransactionAnalysisRequest`
- **Response Body:** `TransactionAnalysisResponse` (HTTP `200 OK`)

### Ví dụ JSON mẫu (`POST /api/analyze`)

#### Request (`TransactionAnalysisRequest`)
```json
{
  "commandText": "Chuyển gấp 5 triệu cho tài khoản 1903888999 để đóng phí hải quan nhận quà quốc tế",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "currentBudgets": [
    {
      "id": "b1",
      "name": "Ăn uống",
      "limit": 3000000,
      "spent": 1200000
    },
    {
      "id": "b2",
      "name": "Mua sắm",
      "limit": 4000000,
      "spent": 2500000
    },
    {
      "id": "b3",
      "name": "Di chuyển",
      "limit": 1000000,
      "spent": 400000
    },
    {
      "id": "b4",
      "name": "Khác",
      "limit": 2000000,
      "spent": 500000
    }
  ],
  "blacklist": ["1903888999", "0912345678"]
}
```

#### Response (`TransactionAnalysisResponse`)
```json
{
  "parsedAmount": 5000000,
  "recipient": "1903888999",
  "category": "Khác",
  "budgetAlert": {
    "isExceeded": true,
    "remainingAfter": -3500000,
    "message": "Giao dịch này sẽ làm vượt ngân sách mục 'Khác' 3,500,000 VNĐ.",
    "suggestion": "Hãy trì hoãn giao dịch hoặc điều chỉnh lại hạn mức chi tiêu."
  },
  "scamReport": {
    "riskLevel": "HIGH",
    "riskScore": 95,
    "scamType": "Lừa đảo phí hải quan / Nhận quà quốc tế",
    "redFlags": [
      "Tài khoản người nhận nằm trong danh sách đen (Blacklist)",
      "Yêu cầu chuyển tiền gấp để nộp phí hải quan nhận quà",
      "Số tiền vượt quá hạn mức ngân sách hiện tại"
    ],
    "explanation": "Kịch bản yêu cầu đóng phí hải quan để nhận bưu kiện/quà tặng quốc tế là chiêu trò lừa đảo phổ biến. Ngoài ra, số tài khoản người nhận đã bị báo cáo trong danh sách đen."
  },
  "requireBiometric": true,
  "fintechOpsTicket": {
    "ticketId": "TCK-20261120-001",
    "timestamp": "2026-11-20T14:38:00.000Z",
    "recipient": "1903888999",
    "amount": 5000000,
    "riskLevel": "HIGH",
    "riskScore": 95,
    "summary": "Phát hiện giao dịch chuyển 5,000,000 VNĐ tới tài khoản Blacklist (1903888999) với dấu hiệu lừa đảo phí hải quan.",
    "recommendedAction": "Tạm khóa giao dịch, yêu cầu xác thực sinh trắc học khuôn mặt và cảnh báo khách hàng.",
    "evidenceImageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "status": "PENDING"
  }
}
```

---

## 2. Xác thực sinh trắc học khuôn mặt (Biometric Face Verification)

- **Endpoint:** `/api/verify-face`
- **Method:** `POST`
- **Request Body:** `VerifyFaceRequest`
- **Response Body:** `VerifyFaceResponse` (HTTP `200 OK`)

### Ví dụ JSON mẫu (`POST /api/verify-face`)

#### Request (`VerifyFaceRequest`)
```json
{
  "selfieBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
}
```

#### Response (`VerifyFaceResponse`)
```json
{
  "matched": true,
  "similarity": 98.75,
  "message": "Xác thực khuôn mặt thành công qua Amazon Rekognition (Độ khớp: 98.75%)."
}
```

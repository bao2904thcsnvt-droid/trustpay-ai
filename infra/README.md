# TrustPay AI — Hạ tầng AWS Serverless (CDK TypeScript)

Thư mục `infra/` là **một dự án TypeScript độc lập** với ứng dụng Next.js. Nó có `package.json`, `tsconfig.json` riêng và **được loại khỏi** `tsconfig.json` chính (xem `exclude: ["node_modules", "infra"]`) cùng ESLint của ứng dụng, nên không ảnh hưởng tới `npx tsc --noEmit` hay `npm run build` của web.

## Thành phần (3 stack)

| Stack | Tệp | Nội dung |
|---|---|---|
| `TrustPayNetworkSecurityStack` | `lib/network-security-stack.ts` | VPC cô lập (no NAT), VPC Endpoints (Bedrock, Rekognition, Translate, Comprehend, KMS, Logs, Secrets Manager; Gateway cho DynamoDB & S3), KMS CMK, AWS WAFv2 WebACL |
| `TrustPayServerlessStack` | `trustpay-serverless-stack.ts` | API Gateway HTTP API, 2 Lambda (`/api/analyze`, `/api/verify-face`), DynamoDB Single-Table (Audit Trail), S3 tài sản, IAM least-privilege |
| `TrustPayObservabilityFinOpsStack` | `lib/observability-finops-stack.ts` | CloudWatch Dashboard, Alarms (P99, lỗi, Anomaly Detection), SNS, AWS Budgets, X-Ray |

Mã Lambda nằm ở `infra/lambda/` và **tái sử dụng** hợp đồng kiểu (`@/types/trustpay`) cùng thư viện bảo mật dùng chung (`@/lib/...`) của dự án qua alias cấu hình trong `infra/tsconfig.json` (`"@/*": ["../*"]`). Khi đóng gói, `@aws-sdk/*` được đánh dấu **external** (runtime Lambda Node 20 đã có sẵn).

## Yêu cầu

- Node.js ≥ 20, npm
- AWS CLI đã cấu hình thông tin đăng nhập (`aws configure`) với quyền triển khai
- AWS CDK v2: `npm install -g aws-cdk` (hoặc dùng `npx cdk`)

## Cài đặt & triển khai

```bash
cd infra
npm install

# Chỉ lần đầu cho mỗi account/region (tạo tài nguyên bootstrap của CDK)
npx cdk bootstrap aws://<ACCOUNT_ID>/ap-southeast-1

# Kiểm tra tổng hợp CloudFormation (không triển khai)
npm run synth

# Xem khác biệt trước khi triển khai
npm run diff

# Triển khai toàn bộ 3 stack
npm run deploy          # tương đương: cdk deploy --all

# Hoặc chỉ triển khai lõi serverless
npm run deploy:serverless
```

## Biến môi trường tùy chọn

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `CDK_DEFAULT_ACCOUNT` | Account triển khai | (từ AWS CLI) |
| `CDK_DEFAULT_REGION` | Region triển khai | `ap-southeast-1` (Singapore) |
| `TRUSTPAY_ALARM_EMAIL` | Email nhận cảnh báo CloudWatch & Budgets | (không đăng ký) |
| `TRUSTPAY_MONTHLY_BUDGET_USD` | Hạn mức ngân sách tháng | `500` |

Region và Bedrock Model ID cũng có thể đặt qua `context` trong `cdk.json` (`trustpay:defaultRegion`, `trustpay:bedrockModelId`).

## Nguyên tắc bảo mật đã áp dụng

- **Least Privilege:** mỗi Lambda một Role riêng; `bedrock:InvokeModel` chỉ trên ARN model cho phép; `rekognition:CompareFaces`/`DetectText`; `dynamodb:PutItem` chỉ trên bảng Audit; `s3:GetObject`/`PutObject` giới hạn theo tiền tố.
- **Mã hóa:** DynamoDB & S3 dùng KMS CMK (tự xoay vòng khóa); biến môi trường Lambda mã hóa KMS; bắt buộc TLS.
- **Cô lập mạng:** Lambda chạy trong PRIVATE_ISOLATED subnets, gọi AWS qua PrivateLink, không ra Internet.
- **Audit bất biến:** Lambda chỉ có quyền `PutItem` (không `UpdateItem`/`DeleteItem`); bảng bật PITR và TTL.
- **verify-face fail-closed:** Production so khớp selfie với ảnh tham chiếu eKYC; thiếu ảnh/lỗi → từ chối (trừ khi `TRUSTPAY_DEMO_MODE=true`).

## Lưu ý về WAF

API Gateway **HTTP API** không hỗ trợ gắn trực tiếp AWS WAF. WebACL (REGIONAL) được tạo sẵn và xuất ARN; hãy gắn qua CloudFront hoặc ALB đứng trước API khi đưa vào Production, kèm header bí mật `x-origin-verify` để chống truy cập vòng.

## Gỡ bỏ

```bash
npm run destroy   # cdk destroy --all
```

> Các tài nguyên lưu dữ liệu (DynamoDB, S3, KMS) đặt `RemovalPolicy.RETAIN` để tránh mất dữ liệu kiểm toán; cần xóa thủ công sau khi `destroy` nếu muốn dọn sạch.

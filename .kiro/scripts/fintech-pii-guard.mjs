#!/usr/bin/env node
/**
 * TrustPay AI — PreToolUse guard (fs_write | str_replace | fs_append).
 *
 * Ngăn chặn:
 *  1) Hardcode AWS Access Key (AKIA.../ASIA...) hoặc Secret Key trong mã nguồn.
 *  2) Ghi log dữ liệu nhạy cảm chưa che (ảnh selfie/CCCD thô, base64 sinh trắc).
 *
 * Giao thức hook: đọc JSON ngữ cảnh trên stdin. Nếu phát hiện vi phạm → exit 2
 * (chặn thao tác, stderr được chuyển tiếp). Ngược lại exit 0 (cho phép).
 */

import process from "node:process";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve(data);
      }
    };
    try {
      process.stdin.setEncoding("utf8");
    } catch {
      /* ignore */
    }
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
    // An toàn: nếu không có stdin, không treo hook.
    setTimeout(done, 1500);
  });
}

// Dựng mẫu khóa AWS động để chính tệp này không tự khớp.
const AWS_ACCESS_KEY = new RegExp(`(?:A${"KIA"}|A${"SIA"})[0-9A-Z]{16}`);
const HARDCODED_SECRET = new RegExp(
  "(aws_secret_access_key|secretAccessKey|AWS_SECRET_ACCESS_KEY)\\s*[:=]\\s*[\"'][A-Za-z0-9/+=]{20,}[\"']",
);
// Ghi log dữ liệu sinh trắc/PII thô.
const SENSITIVE_LOG = new RegExp(
  "console\\.(log|info|debug|warn|error)\\s*\\([^)]*(selfieBase64|evidenceImageBase64|rawCccd|cccdRaw|soCCCD)",
);

function findViolations(payloadText) {
  const violations = [];
  if (AWS_ACCESS_KEY.test(payloadText)) {
    violations.push("Phát hiện AWS Access Key ID bị hardcode (AKIA.../ASIA...). Dùng process.env hoặc IAM Role.");
  }
  if (HARDCODED_SECRET.test(payloadText)) {
    violations.push("Phát hiện AWS Secret/credential bị hardcode. Chỉ đọc qua biến môi trường hoặc Secrets Manager.");
  }
  if (SENSITIVE_LOG.test(payloadText)) {
    violations.push("Phát hiện ghi log dữ liệu nhạy cảm chưa che (selfie/CCCD/base64 sinh trắc). Hãy che giấu qua lib/security/pii-masking.");
  }
  return violations;
}

const raw = await readStdin();
let payloadText = raw;
try {
  // Chuẩn hóa: nếu là JSON ngữ cảnh hook, quét toàn bộ chuỗi hóa để bắt mọi trường nội dung.
  const parsed = JSON.parse(raw);
  payloadText = JSON.stringify(parsed);
} catch {
  /* dùng raw nếu không phải JSON */
}

const violations = findViolations(payloadText);
if (violations.length > 0) {
  process.stderr.write(
    "⛔ TrustPay PII/Secret Guard CHẶN thao tác ghi:\n" +
      violations.map((v) => `  - ${v}`).join("\n") +
      "\n",
  );
  process.exit(2);
}

process.exit(0);

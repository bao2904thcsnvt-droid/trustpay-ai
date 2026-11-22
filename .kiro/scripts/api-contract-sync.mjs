#!/usr/bin/env node
/**
 * TrustPay AI — PostFileSave: đối chiếu tính nhất quán giữa hợp đồng dữ liệu
 * (`types/trustpay.ts`), tài liệu `API_CONTRACT.md` và các API route.
 *
 * Mang tính cảnh báo (advisory): luôn exit 0, in phát hiện ra stdout để agent/
 * lập trình viên lưu ý. Không chặn thao tác.
 */

import { readFileSync, existsSync } from "node:fs";
import process from "node:process";

const ROOT = process.cwd();
const files = {
  types: `${ROOT}/types/trustpay.ts`,
  contract: `${ROOT}/API_CONTRACT.md`,
  analyze: `${ROOT}/app/api/analyze/route.ts`,
  verify: `${ROOT}/app/api/verify-face/route.ts`,
};

function read(path) {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}

const typesSrc = read(files.types);
const contractSrc = read(files.contract);
const analyzeSrc = read(files.analyze);
const verifySrc = read(files.verify);

const findings = [];

// 1. Trích tên interface/type export từ hợp đồng kiểu.
const exported = Array.from(typesSrc.matchAll(/export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g)).map(
  (m) => m[1],
);

// 2. Các kiểu cốt lõi phải xuất hiện trong API_CONTRACT.md.
const coreTypes = [
  "TransactionAnalysisRequest",
  "TransactionAnalysisResponse",
  "VerifyFaceRequest",
  "VerifyFaceResponse",
];
for (const t of coreTypes) {
  if (!exported.includes(t)) {
    findings.push(`Thiếu export kiểu cốt lõi '${t}' trong types/trustpay.ts`);
  }
  if (contractSrc && !contractSrc.includes(t)) {
    findings.push(`API_CONTRACT.md không đề cập kiểu '${t}'`);
  }
}

// 3. Route phải import từ @/types/trustpay.
if (analyzeSrc && !/@\/types\/trustpay/.test(analyzeSrc)) {
  findings.push("app/api/analyze/route.ts không import từ @/types/trustpay");
}
if (verifySrc && !/@\/types\/trustpay/.test(verifySrc)) {
  findings.push("app/api/verify-face/route.ts không import từ @/types/trustpay");
}

// 4. Một số field bắt buộc của response phải có trong hợp đồng kiểu.
const requiredFields = [
  "parsedAmount",
  "recipient",
  "scamReport",
  "requireBiometric",
  "fintechOpsTicket",
];
for (const f of requiredFields) {
  if (typesSrc && !typesSrc.includes(f)) {
    findings.push(`Field '${f}' không còn trong types/trustpay.ts (có thể phá vỡ hợp đồng)`);
  }
}

if (findings.length === 0) {
  console.log("✅ api-contract-sync: types/trustpay.ts ⇄ API_CONTRACT.md ⇄ routes NHẤT QUÁN.");
} else {
  console.log("⚠️ api-contract-sync phát hiện điểm cần rà soát:");
  for (const f of findings) {
    console.log(`  - ${f}`);
  }
}

process.exit(0);

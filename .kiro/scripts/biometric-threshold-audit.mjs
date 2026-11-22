#!/usr/bin/env node
/**
 * TrustPay AI — PreToolUse: cảnh báo khi một thao tác ghi có thể làm sai lệch
 * ngưỡng pháp lý sinh trắc học của Thông tư 50/QĐ 2345 NHNN
 * (10.000.000 VNĐ/lần, 20.000.000 VNĐ/ngày).
 *
 * Không chặn cứng: nếu phát hiện đụng chạm tới ngưỡng/chính sách sinh trắc, trả
 * quyết định "ask" để người dùng xác nhận chủ đích trước khi tiếp tục.
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
    setTimeout(done, 1500);
  });
}

const raw = await readStdin();
let text = raw;
try {
  text = JSON.stringify(JSON.parse(raw));
} catch {
  /* dùng raw */
}

const touchesPolicyFile = /biometric-policy/.test(text);
const touchesThresholdConst =
  /BIOMETRIC_SINGLE_TXN_THRESHOLD_VND|BIOMETRIC_DAILY_CUMULATIVE_THRESHOLD_VND/.test(text);
// Có đề cập giá trị ngưỡng (ở nhiều định dạng số).
const mentionsThresholdValue =
  /10[_.,]?000[_.,]?000|20[_.,]?000[_.,]?000|10_000_000|20_000_000/.test(text);

const suspicious = touchesPolicyFile || touchesThresholdConst || (mentionsThresholdValue && /biometric|sinh trắc|threshold|ngưỡng/i.test(text));

if (suspicious) {
  const reason =
    "Thao tác này đụng chạm tới ngưỡng xác thực sinh trắc học theo QĐ 2345/TT 50 " +
    "(10.000.000 VNĐ/lần, 20.000.000 VNĐ/ngày). Hãy xác nhận thay đổi là chủ đích và " +
    "đã được Pháp chế phê duyệt trước khi tiếp tục.";
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

process.exit(0);

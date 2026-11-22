/**
 * TrustPay AI — Công cụ giả lập tải đồng thời (thuần Node/TypeScript, không thư
 * viện ngoài). Mô phỏng ~500 giao dịch/giây vào `/api/analyze` ở chế độ Offline
 * để đo độ trễ P50/P95/P99, thông lượng và mức tiêu thụ RAM của bộ máy dự phòng.
 *
 * Chạy trực tiếp: `npm run test:bench`
 *   (hoặc `npx --yes tsx tests/concurrency-benchmark-suite.ts`)
 *
 * Tham số qua biến môi trường:
 *   BENCH_TPS           (mặc định 500)  — số giao dịch mỗi "giây" mô phỏng
 *   BENCH_DURATION_SEC  (mặc định 4)    — số giây mô phỏng
 *   BENCH_MAX_P99_MS    (tùy chọn)      — nếu đặt, P99 vượt ngưỡng sẽ thoát mã 1
 */

import { analyze, configureOfflineMode } from "./_harness";
import { DEFAULT_BLACKLIST, DEFAULT_BUDGETS } from "@/lib/mock-scenarios";
import type { TransactionAnalysisRequest } from "@/types/trustpay";

configureOfflineMode();

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const TARGET_TPS = intFromEnv("BENCH_TPS", 500);
const DURATION_SEC = intFromEnv("BENCH_DURATION_SEC", 4);
const MAX_P99 = process.env.BENCH_MAX_P99_MS ? Number(process.env.BENCH_MAX_P99_MS) : undefined;

const COMMANDS: readonly string[] = [
  "Chuyển 45.000đ tiền bún bò cho Quán Cô Ba",
  "Thanh toán 2.500.000đ mua giày sneaker tại Shop XYZ",
  "Chuyển gấp 12.000.000đ cho Cán bộ điều tra STK 999988887777 để xác minh tài khoản",
  "Chuyển 3.000.000đ phí nhận thưởng iPhone 16 Pro Max cho Trung tâm CSKH",
];

function payloadFor(i: number): TransactionAnalysisRequest {
  return {
    commandText: COMMANDS[i % COMMANDS.length],
    currentBudgets: DEFAULT_BUDGETS,
    blacklist: DEFAULT_BLACKLIST,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) {
    return 0;
  }
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx];
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function fireWave(count: number, offset: number): Promise<number[]> {
  const latencies: number[] = new Array<number>(count);
  const tasks: Array<Promise<void>> = [];
  for (let i = 0; i < count; i += 1) {
    const index = offset + i;
    const start = performance.now();
    tasks.push(
      analyze(payloadFor(index)).then(() => {
        latencies[i] = performance.now() - start;
      }),
    );
  }
  await Promise.all(tasks);
  return latencies;
}

void (async () => {
  const line = "─".repeat(72);
  console.log(`\n${line}\nTRUSTPAY AI — BENCHMARK TẢI ĐỒNG THỜI (Offline Fallback Engine)\n${line}`);
  console.log(`Mục tiêu: ${TARGET_TPS} giao dịch/giây × ${DURATION_SEC} giây = ${TARGET_TPS * DURATION_SEC} yêu cầu`);

  // Khởi động (không tính vào kết quả) để ổn định JIT/bộ nhớ.
  await fireWave(Math.min(TARGET_TPS, 200), 0);

  const allLatencies: number[] = [];
  let peakRss = 0;
  const wallStart = performance.now();

  for (let sec = 0; sec < DURATION_SEC; sec += 1) {
    const waveLatencies = await fireWave(TARGET_TPS, sec * TARGET_TPS);
    for (const l of waveLatencies) {
      allLatencies.push(l);
    }
    const rss = process.memoryUsage().rss;
    if (rss > peakRss) {
      peakRss = rss;
    }
  }

  const wallSeconds = (performance.now() - wallStart) / 1000;
  const sorted = [...allLatencies].sort((a, b) => a - b);
  const total = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = total > 0 ? sum / total : 0;
  const throughput = wallSeconds > 0 ? total / wallSeconds : 0;
  const mem = process.memoryUsage();

  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  console.log(`\nKết quả độ trễ (mỗi yêu cầu, ms):`);
  console.log(`  P50      : ${p50.toFixed(2)} ms`);
  console.log(`  P95      : ${p95.toFixed(2)} ms`);
  console.log(`  P99      : ${p99.toFixed(2)} ms`);
  console.log(`  Max      : ${(sorted[total - 1] ?? 0).toFixed(2)} ms`);
  console.log(`  Trung bình: ${avg.toFixed(2)} ms`);

  console.log(`\nThông lượng & tài nguyên:`);
  console.log(`  Tổng yêu cầu  : ${total}`);
  console.log(`  Thời gian thực: ${wallSeconds.toFixed(2)} s`);
  console.log(`  Thông lượng   : ${throughput.toFixed(0)} yêu cầu/giây`);
  console.log(`  RSS đỉnh      : ${mb(peakRss)}`);
  console.log(`  Heap đang dùng: ${mb(mem.heapUsed)}`);
  console.log(line);

  if (MAX_P99 !== undefined && Number.isFinite(MAX_P99)) {
    if (p99 > MAX_P99) {
      console.log(`✗ P99 ${p99.toFixed(2)}ms VƯỢT ngưỡng ${MAX_P99}ms`);
      process.exitCode = 1;
      return;
    }
    console.log(`✓ P99 ${p99.toFixed(2)}ms trong ngưỡng ${MAX_P99}ms`);
  }
  process.exitCode = 0;
})();

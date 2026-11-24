/**
 * Bộ mã hóa QR Code (ISO/IEC 18004) tối giản, thuần TypeScript, chạy được trên
 * trình duyệt lẫn Node — dùng để vẽ mã VietQR NGAY TRÊN MÁY khi mất mạng hoặc khi
 * người dùng không muốn gửi dữ liệu tới dịch vụ ảnh bên ngoài.
 *
 * Thuật toán theo bản tham chiếu công khai của Project Nayuki (MIT): chế độ byte,
 * mức sửa lỗi L/M/Q/H, phiên bản 1–40, mã Reed-Solomon trên GF(2^8) với đa thức
 * 0x11D, chọn mặt nạ (mask) có điểm phạt thấp nhất.
 */

export type QrEcc = "L" | "M" | "Q" | "H";

export interface QrMatrix {
  version: number;
  /** Số ô mỗi cạnh = version * 4 + 17. */
  size: number;
  ecc: QrEcc;
  mask: number;
  /** `modules[y][x] === true` → ô tối. */
  modules: boolean[][];
}

const ECC_ORDINAL: Record<QrEcc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Số codeword sửa lỗi mỗi khối, theo [mức ECC][phiên bản] (chỉ số 0 không dùng).
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Số khối sửa lỗi, theo [mức ECC][phiên bản] (chỉ số 0 không dùng).
const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 40;

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

/** Số ô dữ liệu (kể cả sửa lỗi và bit thừa) của một phiên bản, sau khi trừ các mẫu chức năng. */
export function getNumRawDataModules(version: number): number {
  if (version < QR_MIN_VERSION || version > QR_MAX_VERSION) {
    throw new RangeError("Phiên bản QR ngoài khoảng 1–40");
  }
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

/** Số codeword dữ liệu (8 bit) chứa được ở phiên bản + mức sửa lỗi đã cho. */
export function getNumDataCodewords(version: number, ecc: QrEcc): number {
  const ordinal = ECC_ORDINAL[ecc];
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ordinal][version] * NUM_ERROR_CORRECTION_BLOCKS[ordinal][version]
  );
}

// ------------------------------------------------------------ Reed-Solomon

/** Nhân hai phần tử trong GF(2^8) với đa thức rút gọn 0x11D. */
function rsMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Đa thức sinh bậc `degree` (bỏ hệ số dẫn đầu luôn bằng 1), hệ số từ bậc cao xuống thấp. */
export function reedSolomonDivisor(degree: number): number[] {
  if (degree < 1 || degree > 255) {
    throw new RangeError("Bậc đa thức Reed-Solomon ngoài khoảng");
  }
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) {
        result[j] ^= result[j + 1];
      }
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

/** Phần dư Reed-Solomon (các codeword sửa lỗi) của `data` chia cho `divisor`. */
export function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= rsMultiply(coefficient, factor);
    });
  }
  return result;
}

// --------------------------------------------------- Format & version info

/** 15 bit thông tin định dạng (mức ECC + mask) kèm mã BCH và mặt nạ 0x5412. */
export function formatBitsFor(ecc: QrEcc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

/** 18 bit thông tin phiên bản (chỉ dùng cho phiên bản ≥ 7). */
export function versionInfoBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i++) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | remainder;
}

// ------------------------------------------------------------ Bộ dựng ma trận

class QrBuilder {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(
    readonly version: number,
    readonly ecc: QrEcc,
  ) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const positions = this.alignmentPatternPositions();
    const count = positions.length;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < count; j++) {
        const onFinder = (i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0);
        if (!onFinder) {
          this.drawAlignmentPattern(positions[i], positions[j]);
        }
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private alignmentPatternPositions(): number[] {
    if (this.version === 1) {
      return [];
    }
    const numAlign = Math.floor(this.version / 7) + 2;
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let position = this.size - 7; result.length < numAlign; position -= step) {
      result.splice(1, 0, position);
    }
    return result;
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunctionModule(xx, yy, distance !== 2 && distance !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormatBits(mask: number): void {
    const bits = formatBitsFor(this.ecc, mask);
    // Bản sao thứ nhất (quanh mẫu định vị trên-trái).
    for (let i = 0; i <= 5; i++) {
      this.setFunctionModule(8, i, getBit(bits, i));
    }
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) {
      this.setFunctionModule(14 - i, 8, getBit(bits, i));
    }
    // Bản sao thứ hai (trên-phải và dưới-trái).
    for (let i = 0; i < 8; i++) {
      this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    }
    for (let i = 8; i < 15; i++) {
      this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    }
    this.setFunctionModule(8, this.size - 8, true); // Ô tối cố định
  }

  private drawVersion(): void {
    if (this.version < 7) {
      return;
    }
    const bits = versionInfoBits(this.version);
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  drawCodewords(data: readonly number[]): void {
    let bitIndex = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) {
        right = 5;
      }
      for (let vertical = 0; vertical < this.size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (!this.isFunction[y][x] && bitIndex < data.length * 8) {
            this.modules[y][x] = getBit(data[bitIndex >>> 3], 7 - (bitIndex & 7));
            bitIndex++;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            throw new RangeError("Mask ngoài khoảng 0–7");
        }
        if (!this.isFunction[y][x] && invert) {
          this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  }

  penaltyScore(): number {
    let result = 0;

    // Hàng: chuỗi cùng màu và mẫu giống mẫu định vị.
    for (let y = 0; y < this.size; y++) {
      let runColor = false;
      let runLength = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < this.size; x++) {
        if (this.modules[y][x] === runColor) {
          runLength++;
          if (runLength === 5) {
            result += PENALTY_N1;
          } else if (runLength > 5) {
            result++;
          }
        } else {
          this.finderPenaltyAddHistory(runLength, history);
          if (!runColor) {
            result += this.finderPenaltyCountPatterns(history) * PENALTY_N3;
          }
          runColor = this.modules[y][x];
          runLength = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runLength, history) * PENALTY_N3;
    }

    // Cột.
    for (let x = 0; x < this.size; x++) {
      let runColor = false;
      let runLength = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < this.size; y++) {
        if (this.modules[y][x] === runColor) {
          runLength++;
          if (runLength === 5) {
            result += PENALTY_N1;
          } else if (runLength > 5) {
            result++;
          }
        } else {
          this.finderPenaltyAddHistory(runLength, history);
          if (!runColor) {
            result += this.finderPenaltyCountPatterns(history) * PENALTY_N3;
          }
          runColor = this.modules[y][x];
          runLength = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runLength, history) * PENALTY_N3;
    }

    // Khối 2×2 cùng màu.
    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const color = this.modules[y][x];
        if (color === this.modules[y][x + 1] && color === this.modules[y + 1][x] && color === this.modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }

    // Cân bằng ô tối / sáng.
    let dark = 0;
    for (const row of this.modules) {
      for (const cell of row) {
        if (cell) dark++;
      }
    }
    const total = this.size * this.size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * PENALTY_N4;
    return result;
  }

  private finderPenaltyCountPatterns(history: readonly number[]): number {
    const n = history[1];
    const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
  }

  private finderPenaltyTerminateAndCount(runColor: boolean, runLength: number, history: number[]): number {
    let length = runLength;
    if (runColor) {
      this.finderPenaltyAddHistory(length, history);
      length = 0;
    }
    length += this.size;
    this.finderPenaltyAddHistory(length, history);
    return this.finderPenaltyCountPatterns(history);
  }

  private finderPenaltyAddHistory(runLength: number, history: number[]): void {
    let length = runLength;
    if (history[0] === 0) {
      length += this.size;
    }
    history.pop();
    history.unshift(length);
  }
}

function addEccAndInterleave(data: readonly number[], version: number, ecc: QrEcc): number[] {
  const ordinal = ECC_ORDINAL[ecc];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ordinal][version];
  const blockEccLength = ECC_CODEWORDS_PER_BLOCK[ordinal][version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLength = Math.floor(rawCodewords / numBlocks);
  const divisor = reedSolomonDivisor(blockEccLength);

  const blocks: number[][] = [];
  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const chunk = data.slice(offset, offset + shortBlockLength - blockEccLength + (i < numShortBlocks ? 0 : 1));
    offset += chunk.length;
    const eccBytes = reedSolomonRemainder(chunk, divisor);
    if (i < numShortBlocks) {
      chunk.push(0);
    }
    blocks.push(chunk.concat(eccBytes));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      // Bỏ byte đệm của các khối ngắn.
      if (i !== shortBlockLength - blockEccLength || j >= numShortBlocks) {
        result.push(block[i]);
      }
    });
  }
  return result;
}

function appendBits(value: number, length: number, out: number[]): void {
  for (let i = length - 1; i >= 0; i--) {
    out.push((value >>> i) & 1);
  }
}

/** Số bit của trường "độ dài" ở chế độ byte theo phiên bản. */
function byteModeCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Mã hóa dãy byte (chế độ byte) thành ma trận QR ở phiên bản nhỏ nhất vừa đủ. */
export function encodeQrBytes(bytes: readonly number[], ecc: QrEcc = "M"): QrMatrix {
  let version = QR_MIN_VERSION;
  for (; ; version++) {
    if (version > QR_MAX_VERSION) {
      throw new RangeError("Dữ liệu quá dài cho mã QR");
    }
    const countBits = byteModeCountBits(version);
    const usedBits = 4 + countBits + bytes.length * 8;
    if (bytes.length < 2 ** countBits && usedBits <= getNumDataCodewords(version, ecc) * 8) {
      break;
    }
  }

  const capacityBits = getNumDataCodewords(version, ecc) * 8;
  const bits: number[] = [];
  appendBits(0x4, 4, bits);
  appendBits(bytes.length, byteModeCountBits(version), bits);
  for (const byte of bytes) {
    appendBits(byte & 0xff, 8, bits);
  }
  appendBits(0, Math.min(4, capacityBits - bits.length), bits);
  appendBits(0, (8 - (bits.length % 8)) % 8, bits);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
    appendBits(pad, 8, bits);
  }

  const codewords = new Array<number>(bits.length / 8).fill(0);
  bits.forEach((bit, index) => {
    codewords[index >>> 3] |= bit << (7 - (index & 7));
  });

  const builder = new QrBuilder(version, ecc);
  builder.drawFunctionPatterns();
  builder.drawCodewords(addEccAndInterleave(codewords, version, ecc));

  let bestMask = 0;
  let minPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    builder.applyMask(mask);
    builder.drawFormatBits(mask);
    const penalty = builder.penaltyScore();
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
    }
    builder.applyMask(mask); // XOR lần 2 → hoàn tác
  }
  builder.applyMask(bestMask);
  builder.drawFormatBits(bestMask);

  return { version, size: builder.size, ecc, mask: bestMask, modules: builder.modules };
}

function utf8Bytes(text: string): number[] {
  if (typeof TextEncoder !== "undefined") {
    return Array.from(new TextEncoder().encode(text));
  }
  return Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

/** Mã hóa chuỗi văn bản (UTF-8) thành ma trận QR. */
export function encodeQrText(text: string, ecc: QrEcc = "M"): QrMatrix {
  return encodeQrBytes(utf8Bytes(text), ecc);
}

/** Đường SVG (`path d`) cho các ô tối, kèm viền tĩnh `border` ô quanh mã. */
export function qrSvgPath(matrix: QrMatrix, border = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        parts.push(`M${x + border},${y + border}h1v1h-1z`);
      }
    }
  }
  return parts.join("");
}

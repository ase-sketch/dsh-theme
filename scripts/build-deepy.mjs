#!/usr/bin/env node
/**
 * build-deepy.mjs — M6 Deepy 素材流水线（T1）
 *
 * 源  ：E:/dsh-ui/preview/assets/deepy/<state>.png
 *        2080px 宽 = 8 列 x 260px/帧，高 = rows x 260，colorType 6 / bitDepth 8 / 非隔行
 * 产出：plugins/dsh-theme/assets/deepy/<state>.png   512px 宽 = 8 列 x 64px/帧
 *       plugins/dsh-theme/assets/deepy/deepy.json   {cols,frameMs,displayPx,states}
 * 契约：ARCHITECTURE.md「Deepy 子系统（M6）」接口契约表（三份实现共用的唯一约定）
 *
 * 实现口径
 *  - 逐帧独立降采样：每个 260x260 帧格单独 box filter 到 64x64，绝不跨帧边界。
 *    整图统一缩放会让 64px 输出与 260px 帧边界错位，切帧整体偏移。
 *  - 面积加权（box filter）而非最近邻：260/64 = 4.0625 非整数，最近邻会丢像素/抖动。
 *  - 预乘 alpha 后平均、再反预乘：RGBA 直接平均会在半透明抗锯齿边产生色晕。
 *  - 整数权重（1/64 单位）+ 整数累加：结果与浮点累加顺序无关，逐字节可复现。
 *  - 重编码固定 filter 0（None）+ zlib level 9：不写 tIME/文本块，无时间戳、无随机源。
 *
 * 守卫（任一不满足即抛错、退出码 1，绝不静默降级）
 *  1 源图宽 = 2080、高 = rows x 260
 *  2 产出 PNG 宽 = 512、高 = rows x 64（回读落盘文件的 IHDR 复核，守后果不守意图）
 *  3 源图非空格数 = manifest 的 frames（格内 alpha 全 0 记为空格）
 *  4 8 态全部产出成功后才原子落盘 manifest（临时文件 + rename）
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync, deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- 契约常量
// 唯一来源：改这里就是改契约，必须同步改任务书、ARCHITECTURE.md 与验收。
const SRC_DIR = 'E:/dsh-ui/preview/assets/deepy';
const COLS = 8;
const SRC_FRAME = 260;
const OUT_FRAME = 64;
const FRAME_MS = 50;
const STATES = [
  { key: 'idle', frames: 48 },
  { key: 'thinking', frames: 48 },
  { key: 'typing', frames: 48 },
  { key: 'happy', frames: 52 },
  { key: 'error', frames: 48 },
  { key: 'notification', frames: 32 },
  { key: 'music', frames: 32 },
  { key: 'building', frames: 48 },
];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(REPO_ROOT, 'plugins', 'dsh-theme', 'assets', 'deepy');

// ---------------------------------------------------------------- 小工具
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const md5 = (buf) => createHash('md5').update(buf).digest('hex');

// ---------------------------------------------------------------- CRC32
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- PNG 解码
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(buf, file) {
  assert(buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIG), `${file}: 不是 PNG（签名不匹配）`);

  let off = 8;
  let ihdr = null;
  const idat = [];
  let sawIend = false;
  const chunkTypes = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    assert(off + 12 + len <= buf.length, `${file}: chunk 越界（offset=${off}, len=${len}）`);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const want = buf.readUInt32BE(off + 8 + len);
    const got = crc32(buf.subarray(off + 4, off + 8 + len));
    assert(want === got, `${file}: chunk ${type} CRC 不匹配（期望 ${want}, 实际 ${got}）`);
    chunkTypes.push(type);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { sawIend = true; break; }
    off += 12 + len;
  }
  assert(ihdr, `${file}: 缺 IHDR`);
  assert(sawIend, `${file}: 缺 IEND`);
  assert(idat.length > 0, `${file}: 缺 IDAT`);
  assert(chunkTypes[0] === 'IHDR', `${file}: 首个 chunk 不是 IHDR（实际 ${chunkTypes[0]}）`);

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filterMethod = ihdr[11];
  const interlace = ihdr[12];

  assert(colorType === 6, `${file}: colorType 期望 6(RGBA)，实际 ${colorType}`);
  assert(bitDepth === 8, `${file}: bitDepth 期望 8，实际 ${bitDepth}`);
  assert(interlace === 0, `${file}: interlace 期望 0(非隔行)，实际 ${interlace}`);
  assert(compression === 0, `${file}: compression 期望 0，实际 ${compression}`);
  assert(filterMethod === 0, `${file}: filterMethod 期望 0，实际 ${filterMethod}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  assert(raw.length === (stride + 1) * height,
    `${file}: IDAT 解压后长度 ${raw.length}，期望 ${(stride + 1) * height}（${width}x${height} RGBA8）`);

  const rgba = Buffer.alloc(width * height * bpp);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    assert(ft >= 0 && ft <= 4, `${file}: 第 ${y} 行 filter 类型 ${ft} 非法`);
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const x = line[i];
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        default: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, bitDepth, colorType, interlace, rgba };
}

// ---------------------------------------------------------------- PNG 编码
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bitDepth
  ihdr[9] = 6;  // colorType RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 只读 IHDR，用于回读落盘文件复核尺寸 */
function readIhdr(buf) {
  assert(buf.subarray(0, 8).equals(PNG_SIG), '回读：不是 PNG');
  assert(buf.toString('latin1', 12, 16) === 'IHDR', '回读：首个 chunk 不是 IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------- 降采样
/**
 * 把 src 中以 (ox0,oy0) 为左上角、边长 srcSize 的方形区域，
 * 面积加权平均到 outSize x outSize。
 * 权重取整数（1/outSize 单位），累加为整数，除法只在最后做一次并四舍五入，
 * 故同一输入在任何运行中结果逐位相同。alpha=0 的像素跳过（不贡献色）。
 */
function boxDownsample(src, srcW, ox0, oy0, srcSize, outSize) {
  const out = Buffer.alloc(outSize * outSize * 4);
  const total = srcSize * srcSize; // 每个输出像素的总权重（1/outSize 单位）
  for (let oy = 0; oy < outSize; oy++) {
    const y0 = oy * srcSize, y1 = (oy + 1) * srcSize;
    const syA = Math.floor(y0 / outSize), syB = Math.ceil(y1 / outSize);
    for (let ox = 0; ox < outSize; ox++) {
      const x0 = ox * srcSize, x1 = (ox + 1) * srcSize;
      const sxA = Math.floor(x0 / outSize), sxB = Math.ceil(x1 / outSize);
      let sumA = 0, sumR = 0, sumG = 0, sumB = 0;
      for (let sy = syA; sy < syB; sy++) {
        const wy = Math.min((sy + 1) * outSize, y1) - Math.max(sy * outSize, y0);
        if (wy <= 0) continue;
        const rowBase = (oy0 + sy) * srcW;
        for (let sx = sxA; sx < sxB; sx++) {
          const wx = Math.min((sx + 1) * outSize, x1) - Math.max(sx * outSize, x0);
          if (wx <= 0) continue;
          const p = (rowBase + ox0 + sx) * 4;
          const a = src[p + 3];
          if (a === 0) continue; // 全透明像素不参与（其 RGB 无意义）
          const w = wx * wy;
          sumA += a * w;
          sumR += src[p] * a * w;
          sumG += src[p + 1] * a * w;
          sumB += src[p + 2] * a * w;
        }
      }
      const o = (oy * outSize + ox) * 4;
      if (sumA === 0) {
        out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0;
      } else {
        // 反预乘：sumR/sumA 已消掉权重与 alpha 归一化因子
        out[o] = clampByte(Math.round(sumR / sumA));
        out[o + 1] = clampByte(Math.round(sumG / sumA));
        out[o + 2] = clampByte(Math.round(sumB / sumA));
        out[o + 3] = clampByte(Math.round(sumA / total));
      }
    }
  }
  return out;
}

/** 帧格是否为空：格内所有像素 alpha 全 0 */
function cellIsEmpty(src, srcW, ox0, oy0, size) {
  for (let y = 0; y < size; y++) {
    const rowBase = (oy0 + y) * srcW;
    for (let x = 0; x < size; x++) {
      if (src[(rowBase + ox0 + x) * 4 + 3] !== 0) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- 原子写
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function atomicWrite(target, buf) {
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, buf);
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, target);
      return;
    } catch (err) {
      if (attempt >= 3) {
        try { rmSync(tmp, { force: true }); } catch { /* 清不掉就留着，报错优先 */ }
        throw new Error(`原子写失败：${target}（rename 重试 4 次仍失败：${err.message}）`);
      }
      sleepSync(50); // 目标被占用（杀软/编辑器）时短暂退避
    }
  }
}

// ---------------------------------------------------------------- 主流程
function buildState(state) {
  const srcFile = path.join(SRC_DIR, `${state.key}.png`);
  const rows = Math.ceil(state.frames / COLS);
  const src = decodePng(readFileSync(srcFile), srcFile);

  // 守卫 1：源图尺寸
  assert(src.width === COLS * SRC_FRAME,
    `守卫1 失败 [${srcFile}]：源图宽期望 ${COLS * SRC_FRAME}（${COLS} 列 x ${SRC_FRAME}px），实际 ${src.width}`);
  assert(src.height === rows * SRC_FRAME,
    `守卫1 失败 [${srcFile}]：源图高期望 ${rows * SRC_FRAME}（${state.frames} 帧 -> ${rows} 行 x ${SRC_FRAME}px），实际 ${src.height}`);

  // 守卫 3：非空格数 = 真实帧数
  let nonEmpty = 0;
  const cells = [];
  for (let i = 0; i < rows * COLS; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const empty = cellIsEmpty(src.rgba, src.width, col * SRC_FRAME, row * SRC_FRAME, SRC_FRAME);
    if (!empty) nonEmpty++;
    cells.push(empty ? '.' : '#');
  }
  assert(nonEmpty === state.frames,
    `守卫3 失败 [${srcFile}]：源图非空格数期望 ${state.frames}（manifest 的 frames），实际 ${nonEmpty}\n` +
    `  逐格（'.' = 该 260x260 格内 alpha 全 0）：${cells.join('')}`);

  // 逐帧独立降采样；尾部 padding 格保持全透明
  const outW = COLS * OUT_FRAME;
  const outH = rows * OUT_FRAME;
  const outRgba = Buffer.alloc(outW * outH * 4);
  for (let i = 0; i < state.frames; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const cell = boxDownsample(src.rgba, src.width, col * SRC_FRAME, row * SRC_FRAME, SRC_FRAME, OUT_FRAME);
    for (let y = 0; y < OUT_FRAME; y++) {
      cell.copy(
        outRgba,
        ((row * OUT_FRAME + y) * outW + col * OUT_FRAME) * 4,
        y * OUT_FRAME * 4,
        (y + 1) * OUT_FRAME * 4,
      );
    }
  }

  const png = encodePng(outW, outH, outRgba);
  const outFile = path.join(OUT_DIR, `${state.key}.png`);
  atomicWrite(outFile, png);

  // 守卫 2：回读落盘文件复核尺寸（守后果）
  const back = readIhdr(readFileSync(outFile));
  assert(back.width === COLS * OUT_FRAME,
    `守卫2 失败 [${outFile}]：产出 PNG 宽期望 ${COLS * OUT_FRAME}，实际 ${back.width}`);
  assert(back.height === rows * OUT_FRAME,
    `守卫2 失败 [${outFile}]：产出 PNG 高期望 ${rows * OUT_FRAME}，实际 ${back.height}`);

  return {
    key: state.key,
    srcW: src.width, srcH: src.height, cells: rows * COLS, frames: state.frames, rows,
    outW: back.width, outH: back.height, bytes: png.length, md5: md5(png),
  };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`build-deepy: 源 ${SRC_DIR}`);
  console.log(`build-deepy: 出 ${OUT_DIR}\n`);

  const report = [];
  for (const state of STATES) report.push(buildState(state));

  // 守卫 4：8 态全部产出成功后才落盘 manifest
  const manifest = {
    cols: COLS,
    frameMs: FRAME_MS,
    displayPx: OUT_FRAME,
    states: Object.fromEntries(report.map((r) => [r.key, {
      file: `${r.key}.png`, frames: r.frames, rows: r.rows,
    }])),
  };
  const manifestBuf = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const manifestFile = path.join(OUT_DIR, 'deepy.json');
  atomicWrite(manifestFile, manifestBuf);

  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('state', 14) + pad('src', 12) + pad('srcCells', 10) + pad('frames', 8) + pad('out', 12) + pad('bytes', 9) + 'md5');
  for (const r of report) {
    console.log(
      pad(r.key, 14) + pad(`${r.srcW}x${r.srcH}`, 12) + pad(r.cells, 10) + pad(r.frames, 8) +
      pad(`${r.outW}x${r.outH}`, 12) + pad(r.bytes, 9) + r.md5,
    );
  }
  console.log(pad('deepy.json', 14) + pad('-', 12) + pad('-', 10) + pad('-', 8) + pad('-', 12) + pad(manifestBuf.length, 9) + md5(manifestBuf));
  console.log(`\nbuild-deepy: OK — ${report.length} 态 + 1 manifest 全部产出，守卫 1-4 全绿`);
}

try {
  main();
} catch (err) {
  console.error(`\nbuild-deepy: FAILED\n${err && err.message ? err.message : err}`);
  process.exit(1);
}

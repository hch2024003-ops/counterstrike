#!/usr/bin/env node
'use strict';
// Tạo thư viện texture PBR chất lượng cao (liền mạch, tileable) ngay trên máy: albedo + normal + roughness cho tường gạch, đá, cát, vữa, gạch lát, cỏ, kim loại, gỗ.
// Dành cho tiệm net/máy mạnh: chạy một lần (vài chục giây), kết quả đặt ở thư mục dùng chung cho cả máy, game tự nhận khi khởi động.
//   node tools/gen-textures.js [thư-mục-đích] [--size 2048] [--all]
//   Mặc định đích: %ProgramData%\HACHIHI\assets (Windows) hoặc ./hachihi-assets. --size 1024|2048|4096. --all thêm concrete/asphalt/rust.
// Albedo được tạo gần trung tính (sáng) để game nhân với màu của từng khối; không tải gì từ internet, không có bản quyền bên thứ ba.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ------------------------------------------------------------------ nhiễu liền mạch
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483629)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Nhiễu giá trị tuần hoàn: lưới px×py ô, bao quanh nên ghép gạch không thấy đường nối.
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x); const yi = Math.floor(y);
  const xf = x - xi; const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px; const x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py; const y1 = (y0 + 1) % py;
  const a = hash2(x0, y0, seed); const b = hash2(x1, y0, seed); const c = hash2(x0, y1, seed); const d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(u, v, per, oct, seed, gain = 0.5) {
  let s = 0; let a = 1; let t = 0; let p = per;
  for (let o = 0; o < oct; o++) { s += a * vnoise(u * p, v * p, p, p, seed + o * 17); t += a; a *= gain; p *= 2; }
  return s / t;
}

// Worley tuần hoàn: trả về [F1, F2] khoảng cách tới hai điểm đặc trưng gần nhất (đơn vị ô).
function worley(u, v, n, seed) {
  const x = u * n; const y = v * n;
  const xi = Math.floor(x); const yi = Math.floor(y);
  let f1 = 9; let f2 = 9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx; const cy = yi + dy;
      const wx = ((cx % n) + n) % n; const wy = ((cy % n) + n) % n;
      const px = cx + hash2(wx, wy, seed); const py = cy + hash2(wx, wy, seed + 91);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  return [f1, f2];
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ------------------------------------------------------------------ các loại bề mặt: hàm (u,v) -> { h, r, g, b, rough } ghi vào out
// Mỗi hàm tạo ĐẶC TRƯNG nguyên chu kỳ trên [0,1) nên ghép gạch liền mạch.
const KINDS = {
  brick(u, v, o) {
    const rows = 8; const cols = 4;
    const rowRaw = Math.floor(v * rows); const row = rowRaw % rows; // chỉ số hàng bao quanh: v=1 cho kết quả như v=0
    let uu = u - (row % 2) * 0.5 / cols; uu -= Math.floor(uu);
    const cu = uu * cols; const cell = Math.floor(cu) % cols;
    const fu = cu - Math.floor(cu); const fv = v * rows - rowRaw;
    const edge = Math.min(fu * 1.0, (1 - fu) * 1.0, fv, 1 - fv); // khoảng cách tới mép viên gạch
    const tone = hash2(cell, row, 5);
    const grain = fbm(u, v, 48, 5, 3);
    const mortar = edge < 0.07;
    const chip = sstep(0.07, 0.2, edge);
    o.h = mortar ? 0.25 + 0.08 * grain : 0.55 + 0.4 * chip + 0.12 * grain - 0.1 * (hash2(Math.floor(u * 90) % 90, Math.floor(v * 90) % 90, 8) > 0.97 ? 1 : 0);
    const base = mortar ? 0.66 + 0.12 * fbm(u, v, 32, 4, 11) : 0.74 + 0.2 * tone + 0.14 * (grain - 0.5) + 0.06 * (fbm(u, v, 8, 3, 21) - 0.5);
    o.r = base * (mortar ? 1.0 : 1.04); o.g = base * (mortar ? 1.0 : 0.98); o.b = base * (mortar ? 0.98 : 0.94);
    o.rough = mortar ? 0.96 : 0.82 + 0.12 * grain;
  },
  stone(u, v, o) {
    const rows = 4; const rowRaw = Math.floor(v * rows); const row = rowRaw % rows;
    const off = hash2(row, 0, 3);
    let uu = u + off; uu -= Math.floor(uu);
    const cols = 3; const cu = uu * cols; const cell = Math.floor(cu) % cols;
    const fu = cu - Math.floor(cu); const fv = v * rows - rowRaw;
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
    const [f1, f2] = worley(u, v, 9, 7);
    const crack = sstep(0.035, 0.0, f2 - f1) * (hash2(cell, row, 12) > 0.8 ? 1 : 0);
    const grain = fbm(u, v, 40, 6, 5);
    const joint = edge < 0.05;
    o.h = joint ? 0.2 : 0.6 + 0.3 * sstep(0.05, 0.16, edge) + 0.15 * grain - 0.3 * crack;
    const base = 0.72 + 0.22 * hash2(cell, row, 9) + 0.16 * (grain - 0.5) - 0.18 * crack - (joint ? 0.2 : 0) + 0.05 * (fbm(u, v, 6, 3, 31) - 0.5);
    o.r = base; o.g = base * 0.98; o.b = base * 0.94;
    o.rough = joint ? 0.97 : 0.78 + 0.18 * grain + 0.1 * crack;
  },
  sand(u, v, o) {
    const warp = fbm(u, v, 6, 3, 2);
    const ripple = 0.5 + 0.5 * Math.sin((v * 12 + warp * 2.2) * Math.PI * 2);
    const g = fbm(u, v, 96, 5, 4);
    o.h = 0.35 * ripple + 0.4 * g + 0.25 * fbm(u, v, 12, 4, 9);
    const base = 0.84 + 0.1 * (g - 0.5) + 0.05 * (ripple - 0.5);
    o.r = base * 1.03; o.g = base; o.b = base * 0.9;
    o.rough = 0.93 + 0.06 * g;
  },
  plaster(u, v, o) {
    const g = fbm(u, v, 64, 6, 6);
    const stain = fbm(u, v, 4, 4, 14);
    const speck = hash2(Math.floor(u * 512) % 512, Math.floor(v * 512) % 512, 30) > 0.985 ? 0.12 : 0;
    o.h = 0.5 * g + 0.3 * fbm(u, v, 16, 4, 8) - speck;
    const base = 0.9 - 0.2 * stain * stain - speck + 0.06 * (g - 0.5);
    o.r = base; o.g = base * 0.99; o.b = base * 0.96;
    o.rough = 0.86 + 0.1 * g;
  },
  tile(u, v, o) {
    const n = 8; const cu = u * n; const cv = v * n;
    const cx = Math.floor(cu) % n; const cy = Math.floor(cv) % n;
    const fu = cu - Math.floor(cu); const fv = cv - Math.floor(cv);
    const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
    const grout = edge < 0.035;
    const tone = hash2(cx, cy, 5);
    const scuff = fbm(u, v, 80, 4, 12);
    o.h = grout ? 0.15 : 0.7 + 0.25 * sstep(0.035, 0.09, edge) + 0.04 * scuff;
    const base = grout ? 0.58 + 0.1 * scuff : 0.82 + 0.1 * tone + 0.06 * (scuff - 0.5);
    o.r = base; o.g = base * 0.99; o.b = base * 0.97;
    o.rough = grout ? 0.95 : 0.42 + 0.22 * scuff + 0.1 * tone;
  },
  grass(u, v, o) {
    const g = fbm(u, v, 64, 5, 3);
    const blades = vnoise(u * 256, v * 20, 256, 20, 7) * 0.6 + vnoise(u * 512, v * 40, 512, 40, 8) * 0.4;
    const clump = fbm(u, v, 10, 4, 15);
    o.h = 0.4 * g + 0.5 * blades;
    const base = 0.72 + 0.2 * blades + 0.1 * (clump - 0.5);
    o.r = base * 0.92; o.g = base * 1.0; o.b = base * 0.8;
    o.rough = 0.9 + 0.08 * g;
  },
  metal(u, v, o) {
    const brushed = vnoise(u * 8, v * 512, 8, 512, 4) * 0.6 + vnoise(u * 16, v * 256, 16, 256, 5) * 0.4;
    const px = (u * 4) % 1; const py = (v * 4) % 1;
    const seam = Math.min(px, 1 - px, py, 1 - py) < 0.012 ? 1 : 0;
    const rivet = [0.04, 0.96].some((a) => [0.04, 0.96].some((b) => Math.hypot(px - a, py - b) < 0.018)) ? 1 : 0;
    const scratch = vnoise(u * 6, v * 700, 6, 700, 9) > 0.93 ? 1 : 0;
    const rust = sstep(0.66, 0.86, fbm(u, v, 5, 5, 19)) * 0.7;
    o.h = 0.6 + 0.1 * brushed - 0.3 * seam + 0.12 * rivet - 0.05 * scratch - 0.1 * rust;
    const base = 0.84 + 0.1 * (brushed - 0.5) - 0.2 * seam + 0.08 * scratch - 0.35 * rust;
    o.r = base * (1 + 0.12 * rust); o.g = base * (1 - 0.1 * rust); o.b = base * (1 - 0.3 * rust);
    o.rough = 0.38 + 0.15 * brushed + 0.45 * rust + 0.2 * scratch;
  },
  wood(u, v, o) {
    const planks = 8; const pc = Math.floor(u * planks) % planks;
    const fu = u * planks - Math.floor(u * planks);
    const gap = fu < 0.02 || fu > 0.98;
    const warp = fbm(u, v, 4, 3, 2);
    const rings = 0.5 + 0.5 * Math.sin((fu * 7 + warp * 3 + hash2(pc, 0, 6) * 6) * Math.PI * 2);
    const fiber = vnoise(u * 160, v * 6, 160, 6, 7);
    o.h = gap ? 0.1 : 0.55 + 0.1 * fiber + 0.08 * rings;
    const base = gap ? 0.3 : 0.62 + 0.18 * hash2(pc, 0, 4) + 0.1 * rings + 0.08 * (fiber - 0.5);
    o.r = base * 1.12; o.g = base * 0.92; o.b = base * 0.7;
    o.rough = gap ? 0.95 : 0.62 + 0.15 * fiber;
  },
  concrete(u, v, o) {
    const g = fbm(u, v, 48, 6, 6);
    const pit = hash2(Math.floor(u * 300) % 300, Math.floor(v * 300) % 300, 9) > 0.992 ? 1 : 0;
    const form = Math.abs(((v * 4) % 1) - 0.5) > 0.495 ? 1 : 0; // vết ván khuôn
    o.h = 0.5 * g + 0.3 * fbm(u, v, 10, 3, 3) - 0.3 * pit - 0.2 * form;
    const base = 0.8 + 0.1 * (g - 0.5) - 0.12 * pit - 0.08 * form - 0.12 * Math.pow(fbm(u, v, 3, 4, 21), 2);
    o.r = base; o.g = base; o.b = base * 0.98;
    o.rough = 0.88 + 0.1 * g;
  },
  asphalt(u, v, o) {
    const g = fbm(u, v, 128, 5, 3);
    const stone = hash2(Math.floor(u * 200) % 200, Math.floor(v * 200) % 200, 11) > 0.82 ? 1 : 0;
    const [f1, f2] = worley(u, v, 6, 5);
    const crack = sstep(0.04, 0.0, f2 - f1);
    o.h = 0.4 * g + 0.25 * stone - 0.4 * crack;
    const base = 0.58 + 0.16 * (g - 0.5) + 0.12 * stone - 0.2 * crack;
    o.r = base; o.g = base; o.b = base * 1.02;
    o.rough = 0.93 + 0.05 * g;
  },
  rust(u, v, o) {
    const g = fbm(u, v, 32, 6, 13);
    const m = sstep(0.45, 0.7, fbm(u, v, 6, 5, 7));
    o.h = 0.5 * g + 0.25 * m;
    const base = 0.7 + 0.1 * (g - 0.5);
    o.r = base * (1 + 0.5 * m); o.g = base * (1 - 0.1 * m); o.b = base * (1 - 0.6 * m);
    o.rough = 0.75 + 0.2 * m + 0.05 * g;
  },
};
const BASE = ['brick', 'stone', 'sand', 'plaster', 'tile', 'grass', 'metal', 'wood'];
const EXTRA = ['concrete', 'asphalt', 'rust'];
// Cạnh vùng phủ (m) của một ô texture: PHẢI khớp SURFACE_TILE trong client/src/gfx/textures.js
const TILE_M = { brick: 2.4, stone: 3, sand: 5, plaster: 3, tile: 3, grass: 4, metal: 2, wood: 1.6, concrete: 3, asphalt: 4, rust: 2 };
const NORMAL_STRENGTH = { brick: 4, stone: 4, sand: 2.2, plaster: 2, tile: 3.5, grass: 2.5, metal: 2.5, wood: 2.5, concrete: 2.5, asphalt: 3, rust: 3 };

// Tạo một loại bề mặt: trả về { size, color: Uint8Array(RGB), normal: Uint8Array(RGB), roughness: Uint8Array(1 kênh) }.
function generateKind(kind, size) {
  const fn = KINDS[kind];
  if (!fn) throw new Error('loại bề mặt không có: ' + kind);
  const N = size;
  const H = new Float32Array(N * N);
  const color = new Uint8Array(N * N * 3);
  const rough = new Uint8Array(N * N);
  const o = { h: 0, r: 0, g: 0, b: 0, rough: 0 };
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      fn(x / N, v, o);
      const i = y * N + x;
      H[i] = o.h;
      color[i * 3] = Math.round(clamp01(o.r) * 255); color[i * 3 + 1] = Math.round(clamp01(o.g) * 255); color[i * 3 + 2] = Math.round(clamp01(o.b) * 255);
      rough[i] = Math.round(clamp01(o.rough) * 255);
    }
  }
  // normal map từ height (lấy mẫu có bao quanh để liền mạch), quy ước OpenGL (+Y lên) như three.js/glTF
  const k = (NORMAL_STRENGTH[kind] || 3) * (N / 512);
  const normal = new Uint8Array(N * N * 3);
  for (let y = 0; y < N; y++) {
    const ym = ((y - 1 + N) % N) * N; const yp = ((y + 1) % N) * N; const yc = y * N;
    for (let x = 0; x < N; x++) {
      const xm = (x - 1 + N) % N; const xp = (x + 1) % N;
      const nx = -(H[yc + xp] - H[yc + xm]) * 0.5 * k;
      const ny = (H[yp + x] - H[ym + x]) * 0.5 * k;
      const len = Math.hypot(nx, ny, 1);
      const i = (yc + x) * 3;
      normal[i] = Math.round((nx / len * 0.5 + 0.5) * 255); normal[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255); normal[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
    }
  }
  return { size: N, color, normal, roughness: rough };
}

// ------------------------------------------------------------------ PNG
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// channels: 1 (xám) hoặc 3 (RGB), 8 bit, không lọc (filter 0) -> deflate.
function encodePng(w, h, channels, data) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 1 ? 0 : 2;
  const row = w * channels;
  const raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (row + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * row, row).copy(raw, y * (row + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
function decodePng(buf) { // chỉ giải mã PNG do encodePng tạo (filter 0) — dùng cho kiểm thử
  const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20); const ch = buf[25] === 0 ? 1 : 3;
  let p = 8; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8); if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const row = w * ch; const out = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) { if (raw[y * (row + 1)] !== 0) throw new Error('filter không hỗ trợ'); out.set(raw.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)), y * row); }
  return { w, h, channels: ch, data: out };
}

// ------------------------------------------------------------------ ghi gói
function writePack(outDir, { size = 2048, kinds = BASE, log = () => {} } = {}) {
  const { buildManifest } = require('./pack-assets.js');
  fs.mkdirSync(outDir, { recursive: true });
  const bindings = { textures: {} };
  for (const kind of kinds) {
    const t0 = Date.now();
    const g = generateKind(kind, size);
    const dir = path.join(outDir, 'textures', kind);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'color.png'), encodePng(size, size, 3, g.color));
    fs.writeFileSync(path.join(dir, 'normal.png'), encodePng(size, size, 3, g.normal));
    fs.writeFileSync(path.join(dir, 'roughness.png'), encodePng(size, size, 1, g.roughness));
    bindings.textures[kind] = { color: `textures/${kind}/color`, normal: `textures/${kind}/normal`, roughness: `textures/${kind}/roughness`, tile: TILE_M[kind] };
    log(`${kind.padEnd(9)} ${size}×${size}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  fs.writeFileSync(path.join(outDir, 'packs.json'), JSON.stringify({ version: '1.0.0', packages: { 'ultra-textures': { name: `Ultra Texture Pack ${size}px (tạo tại máy)`, version: '1.0.0', bundled: false, deps: [], dirs: ['textures/'] } } }, null, 1));
  fs.writeFileSync(path.join(outDir, 'licenses.json'), JSON.stringify({ 'textures/': { name: 'CC0-1.0', author: 'HACHIHI (tạo bằng thuật toán, không dùng nguồn ngoài)', source: 'tools/gen-textures.js' } }, null, 1));
  fs.writeFileSync(path.join(outDir, 'bindings.json'), JSON.stringify(bindings, null, 1));
  const manifest = buildManifest(outDir);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  return manifest;
}

module.exports = { generateKind, encodePng, decodePng, writePack, KINDS, BASE, EXTRA, TILE_M, vnoise, fbm };

if (require.main === module) {
  const args = process.argv.slice(2);
  const sizeI = args.indexOf('--size');
  const size = sizeI >= 0 ? Number(args[sizeI + 1]) : 2048;
  const target = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--size');
  const defOut = process.env.ProgramData ? path.join(process.env.ProgramData, 'HACHIHI', 'assets') : path.resolve('hachihi-assets');
  const out = path.resolve(target || defOut);
  if (![512, 1024, 2048, 4096].includes(size)) { console.error('--size phải là 512, 1024, 2048 hoặc 4096'); process.exit(1); }
  console.log(`Tạo thư viện texture ${size}px vào ${out} ...`);
  const t0 = Date.now();
  const m = writePack(out, { size, kinds: args.includes('--all') ? [...BASE, ...EXTRA] : BASE, log: (s) => console.log('  ' + s) });
  const mb = m.assets.reduce((s, a) => s + a.size, 0) / 1048576;
  console.log(`Xong: ${m.assets.length} file, ${mb.toFixed(0)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} giây. Khởi động lại game để dùng.`);
}

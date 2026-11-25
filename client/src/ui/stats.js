// Thống kê khung hình: FPS trung bình, 1% thấp nhất (1% low), thời gian khung hình.
// Không phụ thuộc DOM nên dễ kiểm thử.

export class FrameStats {
  constructor(size = 300) {
    this.size = size;
    this.buf = new Float32Array(size);
    this.n = 0;
    this.i = 0;
  }

  push(ms) {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.size;
    if (this.n < this.size) this.n++;
  }

  reset() {
    this.n = 0;
    this.i = 0;
  }

  avgMs() {
    if (!this.n) return 0;
    let s = 0;
    for (let k = 0; k < this.n; k++) s += this.buf[k];
    return s / this.n;
  }

  avgFps() {
    const a = this.avgMs();
    return a > 0 ? 1000 / a : 0;
  }

  // FPS trung bình của 1% khung hình chậm nhất: phản ánh độ giật tốt hơn FPS trung bình.
  low1Fps() {
    if (!this.n) return 0;
    const arr = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => b - a);
    const cnt = Math.max(1, Math.ceil(this.n * 0.01));
    let s = 0;
    for (let k = 0; k < cnt; k++) s += arr[k];
    const worst = s / cnt;
    return worst > 0 ? 1000 / worst : 0;
  }
}

// ---------------------------------------------------------------
// Báo cáo hiệu năng: FPS trung bình, 1% / 0.1% thấp nhất, frame time trung vị / P95 / P99.
// ---------------------------------------------------------------
export function summarize(frames) {
  const n = frames.length;
  if (!n) return null;
  const asc = Float64Array.from(frames).sort();
  const q = (p) => asc[Math.min(n - 1, Math.floor(n * p))];
  let sum = 0;
  for (const f of frames) sum += f;
  const lowFps = (frac) => {
    const cnt = Math.max(1, Math.ceil(n * frac));
    let s = 0;
    for (let i = 0; i < cnt; i++) s += asc[n - 1 - i];
    return 1000 / (s / cnt);
  };
  return {
    frames: n,
    avgFps: 1000 / (sum / n),
    low1: lowFps(0.01),
    low01: n >= 1000 ? lowFps(0.001) : null, // 0.1% chỉ đáng tin khi có >= 1000 khung
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    maxMs: asc[n - 1],
  };
}

// Bộ ghi benchmark: chạy trong durationMs, thu frame time.
export class Bench {
  constructor() {
    this.active = false;
    this.frames = [];
    this.startAt = 0;
    this.durationMs = 0;
    this.result = null;
  }

  start(now, durationMs = 20000) {
    this.active = true;
    this.frames = [];
    this.startAt = now;
    this.durationMs = durationMs;
    this.result = null;
  }

  // Trả về true khi vừa kết thúc.
  push(ms, now) {
    if (!this.active) return false;
    this.frames.push(ms);
    if (now - this.startAt >= this.durationMs) {
      this.active = false;
      this.result = summarize(this.frames);
      return true;
    }
    return false;
  }

  progress(now) {
    return this.active ? Math.min(1, (now - this.startAt) / this.durationMs) : 1;
  }
}

export function formatReport(r, extra = {}) {
  if (!r) return '';
  const f = (x, d = 1) => (x == null ? 'n/a' : x.toFixed(d));
  return (
    `BENCHMARK ${extra.label || ''}\n` +
    `FPS TB ${f(r.avgFps, 0)} · 1% low ${f(r.low1, 0)} · 0.1% low ${f(r.low01, 0)}\n` +
    `Frame time: trung vị ${f(r.p50)} ms · P95 ${f(r.p95)} · P99 ${f(r.p99)} · max ${f(r.maxMs)}\n` +
    `Khung đo: ${r.frames}` +
    (extra.lines ? '\n' + extra.lines.join('\n') : '')
  );
}

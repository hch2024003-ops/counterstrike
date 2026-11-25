// Chế độ Auto: bộ điều khiển chất lượng đồ họa theo FPS mục tiêu. Không phụ thuộc DOM/Three.js nên kiểm thử được.
//
// Nguyên tắc:
//  - Đo trên cửa sổ ~3 giây, không đổi theo từng khung.
//  - Hạ ngay khi frame time trung bình vượt ngân sách (1000/FPS mục tiêu), nặng thì hạ 2 bậc.
//  - Chỉ thử nâng khi đạt ngân sách ổn định liên tục >= UP_HOLD_MS. Nâng xong có giai đoạn "thử"; nếu
//    tụt lại thì lùi về và tăng thời gian chờ (backoff) để không nhấp nháy chất lượng.
//  - Mỗi lần đổi có thời gian ổn định (SETTLE_MS) bỏ qua dữ liệu để không đánh giá nhầm do chính việc đổi.

// Thang chất lượng của Auto, từ cao (0) xuống thấp. Thứ tự hạ: bỏ hiệu ứng tốn GPU nhưng ít ảnh hưởng quan sát
// (AO, bloom, bóng độ phân giải cao, hạt) trước, giảm Render Scale sau, tắt bóng đổ gần cuối.
// shadow: 0 tắt, 1=512, 2=1024, 3=2048, 4=4096. ao: 0/1/2. post: 0/1/2. fx: 0..3. scale: hệ số Render Scale.
export const LADDER = [
  { shadow: 4, ao: 2, post: 2, fx: 3, scale: 1.0 }, // Ultra: chỉ dùng khi card đồ họa mạnh (xem gpuTier)
  { shadow: 3, ao: 1, post: 1, fx: 2, scale: 1.0 },
  { shadow: 3, ao: 0, post: 1, fx: 2, scale: 1.0 },
  { shadow: 2, ao: 0, post: 1, fx: 2, scale: 1.0 },
  { shadow: 2, ao: 0, post: 0, fx: 2, scale: 1.0 },
  { shadow: 2, ao: 0, post: 0, fx: 1, scale: 0.9 },
  { shadow: 1, ao: 0, post: 0, fx: 1, scale: 0.85 },
  { shadow: 0, ao: 0, post: 0, fx: 1, scale: 0.8 },
  { shadow: 0, ao: 0, post: 0, fx: 0, scale: 0.7 },
  { shadow: 0, ao: 0, post: 0, fx: 0, scale: 0.6 },
];

export const AUTO_DEFAULTS = {
  windowMs: 3000,
  settleMs: 2000,
  evalEveryMs: 500,
  upHoldMs: 10000,
  probationMs: 6000,
  overFactor: 1.1, // avg > budget*1.1 => quá tải
  severeFactor: 1.6, // avg > budget*1.6 => hạ 2 bậc
  goodAvgFactor: 1.03,
  goodP99Factor: 1.4,
  maxBackoff: 8,
  startRung: 2, // bậc Cao (bóng 2048, không AO); card mạnh bắt đầu cao hơn, card yếu thấp hơn
};

export class AutoQuality {
  constructor(opts = {}) {
    this.o = { ...AUTO_DEFAULTS, ...opts };
    this.rung = Math.min(Math.max(this.o.startRung, 0), LADDER.length - 1);
    this.targetFps = 60;
    this.win = []; // [t, ms]
    this.settleUntil = 0;
    this.goodSince = null;
    this.probationUntil = 0;
    this.probationFrom = -1; // bậc trước khi nâng (để lùi lại nếu thử thất bại)
    this.backoff = 1;
    this.lastEval = 0;
    this.changes = 0;
  }

  get level() {
    return LADDER[this.rung];
  }

  budgetMs() {
    return 1000 / this.targetFps;
  }

  setTarget(fps) {
    const f = Math.max(24, Math.min(360, fps || 60));
    if (Math.abs(f - this.targetFps) > 0.5) {
      this.targetFps = f;
      this.goodSince = null;
    }
  }

  // Đặt lại cửa sổ đo (sau khi đổi cảnh/độ phân giải/cài đặt).
  reset(now) {
    this.win.length = 0;
    this.settleUntil = now + this.o.settleMs;
    this.goodSince = null;
  }

  frame(ms, now) {
    // Bỏ khung bất thường (chuyển tab, tải map: > 1 giây) để không làm lệch số liệu. Khung 250–1000ms là máy thật sự quá chậm.
    if (ms > 1000) {
      this.settleUntil = Math.max(this.settleUntil, now + 500);
      return;
    }
    if (now < this.settleUntil) return;
    this.win.push(now, ms);
    const cut = now - this.o.windowMs;
    let drop = 0;
    while (drop < this.win.length && this.win[drop] < cut) drop += 2;
    if (drop) this.win.splice(0, drop);
  }

  stats() {
    const n = this.win.length / 2;
    if (!n) return null;
    let sum = 0;
    const arr = new Array(n);
    for (let i = 0; i < n; i++) {
      arr[i] = this.win[i * 2 + 1];
      sum += arr[i];
    }
    arr.sort((a, b) => a - b);
    const span = this.win[this.win.length - 2] - this.win[0];
    return { n, span, avg: sum / n, p99: arr[Math.min(n - 1, Math.floor(n * 0.99))] };
  }

  // Gọi mỗi khung (rẻ: chỉ tính lại mỗi evalEveryMs). Trả về null hoặc {from, to, reason}.
  update(now) {
    if (now < this.settleUntil || now - this.lastEval < this.o.evalEveryMs) return null;
    this.lastEval = now;
    const s = this.stats();
    // Cần đủ mẫu; máy cực chậm (vài khung/giây) chỉ cần >= 3 khung trong >= 1.5 giây vì chênh lệch với ngân sách quá lớn.
    if (!s || s.span < 1500 || (s.n < 8 && s.n < 3)) return null;
    const budget = this.budgetMs();
    const o = this.o;

    // Thử nâng thành công (qua hết giai đoạn thử mà vẫn đạt ngân sách): bỏ backoff.
    if (this.probationFrom >= 0 && this.probationUntil > 0 && now >= this.probationUntil && s.avg <= budget * 1.06) {
      this.backoff = 1;
      this.probationFrom = -1;
      this.probationUntil = 0;
    }
    // Giai đoạn thử sau khi nâng: tụt ngân sách là lùi lại và tăng thời gian chờ.
    if (now < this.probationUntil && s.avg > budget * 1.06) {
      this.backoff = Math.min(this.backoff * 2, o.maxBackoff);
      return this._move(this.probationFrom, now, 'thử nâng thất bại');
    }

    if (s.avg > budget * o.overFactor) {
      if (this.rung >= LADDER.length - 1) return null;
      const step = s.avg > budget * o.severeFactor ? 2 : 1;
      return this._move(Math.min(this.rung + step, LADDER.length - 1), now, 'quá ngân sách');
    }

    const good = s.avg <= budget * o.goodAvgFactor && s.p99 <= budget * o.goodP99Factor;
    if (!good) {
      this.goodSince = null;
      return null;
    }
    if (this.goodSince == null) this.goodSince = now;
    if (this.rung > 0 && now - this.goodSince >= o.upHoldMs * this.backoff) {
      this.probationFrom = this.rung;
      this.probationUntil = now + o.settleMs + o.probationMs;
      return this._move(this.rung - 1, now, 'ổn định, thử nâng');
    }
    return null;
  }

  _move(to, now, reason) {
    const from = this.rung;
    if (to === from) return null;
    this.rung = to;
    this.changes++;
    this.win.length = 0;
    this.goodSince = null;
    this.settleUntil = now + this.o.settleMs;
    if (to > from) this.probationUntil = 0; // đang hạ: không còn giai đoạn thử
    return { from, to, reason };
  }
}

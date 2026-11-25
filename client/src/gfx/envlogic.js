// Environment FX — phần LOGIC thuần (không phụ thuộc DOM/Three.js nên kiểm thử được bằng node).
//  - Cài đặt hiệu ứng môi trường: mặc định, preset, kiểm tra hợp lệ, lưu/đọc localStorage, reset.
//  - Thời tiết quyết định từ seed (cùng seed => cùng loại thời tiết, cường độ, gió, lịch sét trên mọi máy).
//  - Lịch sét + tiếng sấm trễ theo khoảng cách (chỉ là hiệu ứng thị giác/âm thanh, không đổi gameplay).
//  - EnvQuality: tự hạ/nâng hiệu ứng theo FPS có hysteresis để không nhấp nháy.

export const ENV_STORAGE_KEY = 'hachihi.envfx';
export const ENV_QUALITY_NAMES = ['low', 'balanced', 'high', 'ultra'];

// Số hạt tối đa theo preset chất lượng (mỗi loại một draw call, tính bằng shader trên GPU nên CPU gần như không tốn).
export const ENV_QUALITY = {
  low: { rain: 700, snow: 500, leaves: 0, dust: 0, mist: 0 },
  balanced: { rain: 1600, snow: 900, leaves: 40, dust: 120, mist: 14 },
  high: { rain: 3000, snow: 1600, leaves: 80, dust: 240, mist: 26 },
  ultra: { rain: 4500, snow: 2400, leaves: 120, dust: 360, mist: 36 },
};

export const ENV_DEFAULTS = {
  enabled: true,
  quality: 'balanced', // low | balanced | high | ultra
  rain: true,
  thunder: true,
  wind: true, // gió: nghiêng mưa/tuyết, lá và bụi trôi theo gió, sương trôi
  fog: true,
  leaves: true,
  dust: true,
  snow: true,
  density: 100, // % mật độ hạt, 20..100
  cameraFx: true, // giọt mưa trên ống kính, chớp sáng nhẹ
  adaptive: true, // tự giảm theo FPS
};

const BOOLS = ['enabled', 'rain', 'thunder', 'wind', 'fog', 'leaves', 'dust', 'snow', 'cameraFx', 'adaptive'];

export function sanitizeEnv(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = { ...ENV_DEFAULTS };
  for (const k of BOOLS) if (typeof r[k] === 'boolean') s[k] = r[k];
  if (ENV_QUALITY_NAMES.includes(r.quality)) s.quality = r.quality;
  const d = Math.round(Number(r.density));
  s.density = Number.isFinite(d) ? Math.min(100, Math.max(20, d)) : ENV_DEFAULTS.density;
  return s;
}

// storage: đối tượng có getItem/setItem (mặc định localStorage nếu có). Lỗi/thiếu => dùng mặc định, không ném lỗi.
function store(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadEnvSettings(storage) {
  const st = store(storage);
  try {
    const raw = st && st.getItem(ENV_STORAGE_KEY);
    return sanitizeEnv(raw ? JSON.parse(raw) : null);
  } catch { return sanitizeEnv(null); }
}

export function saveEnvSettings(settings, storage) {
  const st = store(storage);
  try { if (st) st.setItem(ENV_STORAGE_KEY, JSON.stringify(sanitizeEnv(settings))); return true; } catch { return false; }
}

export function resetEnvSettings(storage) {
  const s = sanitizeEnv(null);
  saveEnvSettings(s, storage);
  return s;
}

// ------------------------------------------------------------
// Số ngẫu nhiên có seed (mulberry32) + băm chuỗi thành seed
// ------------------------------------------------------------
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------
// Thời tiết theo bản đồ
// ------------------------------------------------------------
// Mỗi bản đồ có danh sách loại thời tiết cho phép (trọng số), mức gió cơ bản và lớp trang trí thường trực.
// type: clear | rain | storm | fog | snow. dust/leaves là lớp trang trí độc lập với loại thời tiết.
export const WEATHER_PROFILES = {
  warehouse: { types: { clear: 3, rain: 2, storm: 1, fog: 1 }, wind: [0.4, 2.5], dust: 1, leaves: 0 },
  bridge: { types: { rain: 3, storm: 2, fog: 2, clear: 1 }, wind: [1, 4.5], dust: 0, leaves: 0 },
  giza: { types: { clear: 5 }, wind: [1.5, 5], dust: 1, leaves: 0 },
  rome: { types: { clear: 4, rain: 1 }, wind: [0.5, 3], dust: 1, leaves: 0.4 },
  greatwall: { types: { clear: 2, fog: 3, snow: 2 }, wind: [1, 4], dust: 0, leaves: 0 },
  hoguom: { types: { clear: 3, rain: 2, storm: 1 }, wind: [0.4, 3], dust: 0, leaves: 1 },
  paris: { types: { clear: 3, rain: 2, fog: 2 }, wind: [0.4, 3], dust: 0, leaves: 0.7 },
};
const FALLBACK_PROFILE = { types: { clear: 3, rain: 1 }, wind: [0.4, 2.5], dust: 1, leaves: 0 };

// Cường độ mưa tối đa theo loại để thời tiết luôn mang tính trang trí.
export const CLEAR_STATE = {
  type: 'clear', rain: 0, snow: 0, fog: 0, storm: 0, wind: 0.6, windDirX: 1, windDirZ: 0, dust: 0, leaves: 0,
};

function pickWeighted(rand, table) {
  const entries = Object.entries(table);
  let total = 0;
  for (const [, w] of entries) total += w;
  let x = rand() * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

// seed: số nguyên; mapId: id bản đồ. Kết quả chỉ phụ thuộc (seed, mapId) nên mọi người chơi trong phòng thấy giống nhau.
export function weatherFor(seed, mapId) {
  const prof = WEATHER_PROFILES[mapId] || FALLBACK_PROFILE;
  const rand = rng(seed ^ hashSeed(mapId));
  const type = pickWeighted(rand, prof.types);
  const windAmt = prof.wind[0] + rand() * (prof.wind[1] - prof.wind[0]);
  const ang = rand() * Math.PI * 2;
  const level = 0.35 + rand() * 0.65; // 0.35..1: nhỏ/vừa/lớn
  const s = { ...CLEAR_STATE, type, wind: windAmt, windDirX: Math.cos(ang), windDirZ: Math.sin(ang), dust: prof.dust, leaves: prof.leaves };
  if (type === 'rain') { s.rain = Math.min(0.75, level); s.fog = 0.15; }
  else if (type === 'storm') { s.rain = 0.9; s.storm = 1; s.fog = 0.25; s.wind = windAmt * 1.6; }
  else if (type === 'fog') { s.fog = 0.5 + 0.5 * level; }
  else if (type === 'snow') { s.snow = Math.min(0.8, level); s.fog = 0.2; }
  if (type === 'rain' || type === 'storm') { s.dust = 0; s.leaves *= 0.4; }
  if (type === 'snow') { s.dust = 0; s.leaves = 0; }
  s.seed = seed >>> 0;
  return s;
}

// Cường độ mưa gợi ý tên mức: nhỏ / vừa / lớn.
export function rainLabel(rain) {
  if (rain <= 0.01) return 'không';
  return rain < 0.45 ? 'nhỏ' : rain < 0.8 ? 'vừa' : 'lớn';
}

// ------------------------------------------------------------
// Lịch sét
// ------------------------------------------------------------
// Sinh sẵn các lần chớp từ seed: khoảng cách ngẫu nhiên 5–18 giây. Mỗi lần có thể chớp 2 nhịp (nhấp nháy), sấm đến trễ theo "khoảng cách".
// Chỉ hiệu ứng ánh sáng môi trường + âm thanh; KHÔNG tạo đèn động.
export const FLASH_MAX = 0.6; // trần độ sáng thêm (0..1) để chớp không gây loá mắt/lợi thế chiến thuật

export class LightningSchedule {
  constructor(seed, startT = 0) {
    this.rand = rng((seed ^ 0x9e3779b9) >>> 0);
    this.events = []; // {t, dur, peak, thunderAt, thunderVol}
    this.horizon = startT;
    this.thunderDone = 0; // chỉ số sấm đã phát
    this._extend(startT + 60);
  }

  _extend(untilT) {
    while (this.horizon < untilT) {
      this.horizon += 5 + this.rand() * 13;
      const dist = 0.3 + this.rand() * 0.7; // 0.3 gần .. 1 xa
      const e = {
        t: this.horizon,
        dur: 0.45,
        peak: (0.45 + this.rand() * 0.55) * FLASH_MAX,
        double: this.rand() < 0.5,
        thunderAt: this.horizon + 0.4 + dist * 5.5, // ánh sáng nhanh hơn âm thanh
        thunderVol: 1.1 - dist * 0.7,
      };
      this.events.push(e);
    }
  }

  // Độ sáng thêm tại thời điểm t (0..FLASH_MAX). Tăng vọt rồi giảm dần; kiểu 2 nhịp thì có nhịp thứ hai nhỏ hơn.
  flashAt(t) {
    this._extend(t + 30);
    let v = 0;
    for (let i = this.events.length - 1; i >= 0 && i >= this.events.length - 12; i--) {
      const e = this.events[i];
      const dt = t - e.t;
      if (dt < 0 || dt > e.dur + 0.4) continue;
      v = Math.max(v, e.peak * Math.exp(-dt * 9));
      if (e.double && dt > 0.12) v = Math.max(v, e.peak * 0.7 * Math.exp(-(dt - 0.12) * 9));
    }
    return Math.min(FLASH_MAX, v);
  }

  // Trả về các tiếng sấm đến hạn tại thời điểm t (mỗi tiếng đúng một lần).
  takeThunder(t) {
    this._extend(t + 30);
    const out = [];
    while (this.thunderDone < this.events.length && this.events[this.thunderDone].thunderAt <= t) {
      const e = this.events[this.thunderDone++];
      if (t - e.thunderAt < 8) out.push(e); // bị bỏ lỡ lâu (ví dụ tạm dừng) thì không phát bù
    }
    return out;
  }
}

// ------------------------------------------------------------
// Tự động điều chỉnh theo FPS (có hysteresis)
// ------------------------------------------------------------
// Bậc: 0 = đầy đủ theo cài đặt; 1 = giảm mật độ hạt; 2 = tắt hiệu ứng phụ (bụi, lá, sương sát đất) và giảm mạnh hạt;
//      3 = chỉ giữ hiệu ứng gameplay quan trọng (tắt toàn bộ hiệu ứng môi trường).
// Ngưỡng tính theo tỉ lệ FPS mục tiêu (60 FPS ≈ 55/45/35 như đề xuất thiết kế: 0.92/0.75/0.58).
export const ENV_LEVELS = [
  { name: 'full', density: 1, ambient: true, weather: true },
  { name: 'reduced', density: 0.6, ambient: true, weather: true },
  { name: 'minimal', density: 0.3, ambient: false, weather: true },
  { name: 'gameplay-only', density: 0, ambient: false, weather: false },
];

export const ENVQ_DEFAULTS = {
  thresholds: [0.92, 0.75, 0.58], // dưới ngưỡng i => cần ít nhất bậc i+1
  downHoldMs: 2500, // phải dưới ngưỡng liên tục chừng này mới hạ
  upHoldMs: 12000, // phải ổn định chừng này mới thử nâng một bậc
  settleMs: 1500, // bỏ dữ liệu sau mỗi lần đổi
  windowMs: 2000,
  maxBackoff: 8,
};

export class EnvQuality {
  constructor(opts = {}) {
    this.o = { ...ENVQ_DEFAULTS, ...opts };
    this.level = 0;
    this.targetFps = 60;
    this.win = []; // [t, ms]
    this.settleUntil = 0;
    this.lowSince = null;
    this.goodSince = null;
    this.backoff = 1;
    this.lastUp = -1; // thời điểm lần nâng gần nhất (để phát hiện nâng thất bại)
    this.changes = 0;
  }

  get state() { return ENV_LEVELS[this.level]; }

  setTarget(fps) {
    this.targetFps = Math.max(24, Math.min(360, fps || 60));
  }

  reset(now) {
    this.win.length = 0;
    this.settleUntil = now + this.o.settleMs;
    this.lowSince = null;
    this.goodSince = null;
  }

  frame(ms, now) {
    if (ms > 1000) { this.settleUntil = Math.max(this.settleUntil, now + 500); return; } // tải map/đổi tab: bỏ qua
    if (now < this.settleUntil) return;
    this.win.push(now, ms);
    const cut = now - this.o.windowMs;
    let drop = 0;
    while (drop < this.win.length && this.win[drop] < cut) drop += 2;
    if (drop) this.win.splice(0, drop);
  }

  avgFps() {
    const n = this.win.length / 2;
    if (n < 10) return null;
    const span = this.win[this.win.length - 2] - this.win[0];
    if (span < this.o.windowMs * 0.6) return null;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.win[i * 2 + 1];
    return 1000 / (sum / n);
  }

  // Gọi mỗi khung. Trả về null hoặc {from,to,reason} khi đổi bậc.
  update(now) {
    if (now < this.settleUntil) return null;
    const fps = this.avgFps();
    if (fps == null) return null;
    const t = this.o.thresholds;
    const want = fps < this.targetFps * t[2] ? 3 : fps < this.targetFps * t[1] ? 2 : fps < this.targetFps * t[0] ? 1 : 0;

    if (want > this.level) {
      if (this.lowSince == null) this.lowSince = now;
      this.goodSince = null;
      if (now - this.lowSince >= this.o.downHoldMs) {
        // Vừa nâng mà tụt lại ngay => lần sau chờ lâu hơn (backoff)
        if (this.lastUp >= 0 && now - this.lastUp < this.o.upHoldMs) this.backoff = Math.min(this.backoff * 2, this.o.maxBackoff);
        return this._move(Math.min(want, this.level + 2), now, 'FPS thấp');
      }
      return null;
    }
    this.lowSince = null;
    // Ổn định: chỉ nâng từng bậc một, sau thời gian chờ dài (nhân backoff)
    const good = fps >= this.targetFps * 0.97;
    if (!good || this.level === 0) { this.goodSince = null; return null; }
    if (this.goodSince == null) this.goodSince = now;
    if (now - this.goodSince >= this.o.upHoldMs * this.backoff) {
      this.lastUp = now;
      return this._move(this.level - 1, now, 'ổn định');
    }
    return null;
  }

  _move(to, now, reason) {
    const from = this.level;
    if (to === from) return null;
    this.level = to;
    this.changes++;
    this.win.length = 0;
    this.lowSince = null;
    this.goodSince = null;
    this.settleUntil = now + this.o.settleMs;
    return { from, to, reason };
  }
}

// Kết hợp: cài đặt người chơi + bậc adaptive + mức "hiệu ứng" của đồ họa chung (0..3) => thông số cuối cùng.
// fx: settings.effective().fx. fx = 0 (preset Low/Auto đã hạ hết) => tắt toàn bộ hiệu ứng môi trường.
export function resolveEnv(settings, adaptiveLevel, fx) {
  const s = settings;
  const lv = ENV_LEVELS[Math.min(3, Math.max(0, adaptiveLevel | 0))];
  const off = { active: false, counts: { rain: 0, snow: 0, leaves: 0, dust: 0, mist: 0 }, thunder: false, wind: false, fog: false, camera: false };
  if (!s.enabled || !lv.weather || fx < 1) return off;
  const q = ENV_QUALITY[s.quality];
  // fx = 1 (Vừa): giữ nhẹ — chỉ lớp thời tiết chính, không lớp trang trí
  const deco = lv.ambient && fx >= 2;
  const k = (s.density / 100) * lv.density * (fx >= 3 ? 1 : fx === 2 ? 0.85 : 0.5);
  const cnt = (n, on) => (on ? Math.floor(n * k) : 0);
  return {
    active: true,
    counts: {
      rain: cnt(q.rain, s.rain),
      snow: cnt(q.snow, s.snow),
      leaves: deco ? cnt(q.leaves, s.leaves) : 0,
      dust: deco ? cnt(q.dust, s.dust) : 0,
      mist: deco ? cnt(q.mist, s.fog) : 0,
    },
    thunder: s.thunder,
    wind: s.wind,
    fog: s.fog,
    camera: s.cameraFx && fx >= 2 && lv.ambient,
  };
}

// Số hạt mặc định mà phòng đồng bộ: người chơi chỉ cần chung (pin, mapId, round) để ra cùng thời tiết — không gửi gì từng hạt.
export function weatherSeed(pin, mapId, round) {
  return hashSeed(`${pin || 'solo'}|${mapId || ''}|${round | 0}`);
}

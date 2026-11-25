// Âm thanh 0.6: tổng hợp bằng WebAudio (không cần file âm thanh), giữ nguyên API cũ của AudioEngine.
// Có: tiếng súng nhiều lớp riêng cho từng loại, vang theo môi trường (trong nhà / ngoài trời), che chắn khi khác phòng,
// tắt dần theo khoảng cách, bước chân theo bề mặt (bê tông / kim loại / sỏi bụi), thao tác thay đạn theo từng súng,
// tiếng vỏ đạn rơi, tiếng bơm shotgun, âm nền gió / ù phòng. Stereo theo hướng nhìn.
// Muốn thay bằng file thật sau này: chỉ cần thay thân các hàm shot/step/reload, giữ nguyên chữ ký.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Hai phòng bảo vệ trong bản đồ 0.5: x thuộc [12,18] (hoặc đối xứng), |z| < 3. Trả về id phòng hoặc null.
function roomOf(x, z) {
  if (Math.abs(z) < 3) {
    if (x > 12 && x < 18) return 1;
    if (x < -12 && x > -18) return 2;
  }
  return null;
}

// Bề mặt dưới chân người chơi: sàn thao tác/cầu thang kim loại, sỏi bụi gần tường, còn lại bê tông.
function surfaceAt(x, y, z) {
  const ax = Math.abs(x);
  if (y > 2.5) return 'metal';
  if (ax > 20.8 && ax < 23.2 && y > 0.3) return 'metal';
  if (ax > 25 || Math.abs(z) > 24.5) return 'grit';
  return 'concrete';
}

// Súng mới dùng lại công thức của súng cơ bản, đổi cao độ (f) và độ lớn (g) để nghe khác nhau.
const VARIANT = {
  ak: { base: 'rifle', f: 0.82, g: 1.1 },
  smg: { base: 'pistol', f: 0.9, g: 0.8 },
  sniper: { base: 'rifle', f: 0.55, g: 1.5 },
  lmg: { base: 'rifle', f: 0.72, g: 1.2 },
  deagle: { base: 'pistol', f: 0.68, g: 1.3 },
  autoshotgun: { base: 'shotgun', f: 1.15, g: 0.85, noPump: true },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.reverbIn = null;
    this.lx = 0;
    this.ly = 0;
    this.lz = 0;
    this.room = null;
    this.volume = 0.55;
    this.lastCasing = 0;
    this.amb = null;
  }

  // Phải gọi sau một thao tác của người dùng (nhấp chuột) để trình duyệt cho phép phát âm thanh.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    // Bộ nén ở cuối chuỗi để nhiều súng nổ cùng lúc không bị vỡ tiếng
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);

    const len = c.sampleRate;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Vang: đáp ứng xung tổng hợp (nhiễu tắt dần, càng về sau càng tối) dùng chung cho mọi nguồn
    const dur = 1.5;
    const n = Math.floor(c.sampleRate * dur);
    const ir = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const k = 0.9 - 0.8 * t; // hệ số lọc: đuôi tối dần
        lp += (Math.random() * 2 - 1 - lp) * Math.max(0.08, k);
        data[i] = lp * Math.pow(1 - t, 2.6);
      }
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    this.reverbIn = c.createGain();
    this.reverbIn.gain.value = 1;
    const wet = c.createGain();
    wet.gain.value = 0.55;
    this.reverbIn.connect(conv);
    conv.connect(wet);
    wet.connect(this.master);

    this.startAmbient();
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  }

  // Gọi mỗi khung hình với vị trí người nghe: xác định trong nhà/ngoài trời, bề mặt, và chỉnh âm nền.
  setListener(x, y, z) {
    this.lx = x;
    this.ly = y;
    this.lz = z;
    const r = roomOf(x, z);
    if (r !== this.room) {
      this.room = r;
      this.updateAmbient();
    }
  }

  // Âm nền rất nhỏ: gió ngoài trời, tiếng ù thiết bị trong nhà.
  startAmbient() {
    const c = this.ctx;
    const wind = c.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    const wg = c.createGain();
    wg.gain.value = 0.03;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = c.createGain();
    lg.gain.value = 0.012;
    lfo.connect(lg);
    lg.connect(wg.gain);
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.master);
    const hum = c.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 98;
    const hg = c.createGain();
    hg.gain.value = 0;
    hum.connect(hg);
    hg.connect(this.master);
    wind.start();
    lfo.start();
    hum.start();
    this.amb = { wg, hg };
    this.updateAmbient();
  }

  updateAmbient() {
    if (!this.amb) return;
    const t = this.ctx.currentTime;
    const inside = this.room !== null;
    this.amb.wg.gain.setTargetAtTime(inside ? 0.008 : 0.03, t, 0.3);
    this.amb.hg.gain.setTargetAtTime(inside ? 0.012 : 0, t, 0.3);
  }

  // Đường ra của một âm: âm lượng, pan, lọc thấp (xa/bị che), và mức gửi vào vang.
  out(vol, pan, fx) {
    const c = this.ctx;
    const o = fx || {};
    const g = c.createGain();
    g.gain.value = vol;
    let node = g;
    if (o.lp && o.lp < 19000) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      g.connect(f);
      node = f;
    }
    let dry = node;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan || 0, -1, 1);
      node.connect(p);
      dry = p;
    }
    dry.connect(this.master);
    const send = o.send === undefined ? 0.25 : o.send;
    if (send > 0 && this.reverbIn) {
      const s = c.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(this.reverbIn);
    }
    return g;
  }

  burst({ dur, freq, gain, vol = 1, pan = 0, type = 'lowpass', q = 0.7, delay = 0, fx = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(vol, pan, fx));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  tone({ f0, f1, dur, gain, vol = 1, pan = 0, type = 'sine', delay = 0, fx = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.out(vol, pan, fx));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Môi trường của người nghe (cho âm do chính mình tạo ra).
  selfFx() {
    return { lp: 0, send: this.room !== null ? 0.9 : 0.3 };
  }

  // Tiếng súng nhiều lớp: tiếng nổ gắt (crack) + thân + trầm (thump) + đuôi vang.
  // own = true với súng của chính người chơi (thêm tiếng vỏ đạn, bơm shotgun).
  shot(id, vol = 1, pan = 0, fx = null, own = true) {
    if (!this.ctx) return;
    let pitch = 1;
    let noPump = false;
    const v = VARIANT[id];
    if (v) {
      id = v.base;
      pitch = v.f;
      vol *= v.g;
      noPump = !!v.noPump;
    }
    const f = fx || this.selfFx();
    const tail = { ...f, send: Math.min(1.2, (f.send === undefined ? 0.3 : f.send) * 1.6) };
    const r = (0.94 + Math.random() * 0.12) * pitch; // biến thiên nhẹ để không bị lặp máy móc
    if (id === 'shotgun') {
      this.burst({ dur: 0.05, freq: 1500, gain: 1.0, vol, pan, type: 'highpass', fx: f });
      this.burst({ dur: 0.24, freq: 1600 * r, gain: 1.1, vol, pan, fx: f });
      this.tone({ f0: 112 * r, f1: 28, dur: 0.32, gain: 1.1, vol, pan, fx: f });
      this.burst({ dur: 0.55, freq: 500, gain: 0.3, vol, pan, delay: 0.02, fx: tail });
      if (own && !noPump) {
        // Kéo bơm: hai nhịp kim loại
        this.clack(0.46, vol * 0.8, 1700);
        this.clack(0.6, vol * 0.8, 1300);
        this.shellDrop(0.8, 0.8);
      }
    } else if (id === 'pistol') {
      this.burst({ dur: 0.025, freq: 3000, gain: 0.9, vol, pan, type: 'highpass', fx: f });
      this.burst({ dur: 0.07, freq: 1800 * r, gain: 0.7, vol, pan, type: 'bandpass', q: 0.9, fx: f });
      this.tone({ f0: 230 * r, f1: 80, dur: 0.08, gain: 0.55, vol, pan, fx: f });
      this.burst({ dur: 0.2, freq: 900, gain: 0.15, vol, pan, delay: 0.01, fx: tail });
      if (own) this.shellDrop(0.3, 0.9);
    } else {
      this.burst({ dur: 0.03, freq: 2200, gain: 1.0, vol, pan, type: 'highpass', fx: f });
      this.burst({ dur: 0.09, freq: 1100 * r, gain: 0.8, vol, pan, type: 'bandpass', q: 0.8, fx: f });
      this.tone({ f0: 150 * r, f1: 45, dur: 0.12, gain: 0.8, vol, pan, fx: f });
      this.burst({ dur: 0.3, freq: 600, gain: 0.22, vol, pan, delay: 0.01, fx: tail });
      if (own) this.shellDrop(0.28, 0.7);
    }
  }

  // Tính âm lượng, pan, lọc theo khoảng cách và che chắn khi khác phòng.
  spatial(dx, dz, yaw, range, power) {
    const dist = Math.hypot(dx, dz);
    let vol = Math.pow(Math.max(0, 1 - dist / range), power);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const pan = (dx * rx + dz * rz) / Math.max(dist, 1);
    let lp = clamp(16000 / (1 + dist / 10), 1400, 16000);
    const src = roomOf(this.lx + dx, this.lz + dz);
    if (src !== this.room) {
      lp = Math.min(lp, 900); // khác phòng: bị tường chắn, nghe ục
      vol *= 0.6;
    }
    const send = src !== null ? 0.9 : 0.3 + Math.min(0.4, dist / 80);
    return { vol, pan, fx: { lp, send } };
  }

  // Tiếng súng của người khác: nhỏ dần theo khoảng cách, lệch trái/phải theo hướng, vang theo môi trường.
  shotAt(id, dx, dz, listenerYaw) {
    if (!this.ctx) return;
    const s = this.spatial(dx, dz, listenerYaw, 70, 1.5);
    const vol = s.vol * 0.9;
    if (vol < 0.02) return;
    this.shot(id, vol, s.pan, s.fx, false);
  }

  clack(delay, vol, freq) {
    this.burst({ dur: 0.035, freq, gain: 0.5, vol, type: 'bandpass', q: 3, delay, fx: this.selfFx() });
    this.tone({ f0: freq * 0.5, f1: freq * 0.4, dur: 0.05, gain: 0.12, vol, type: 'triangle', delay, fx: this.selfFx() });
  }

  // Vỏ đạn rơi: hai lần nảy trên sàn, giới hạn tần suất để bắn liên thanh không ồn.
  shellDrop(delay, vol) {
    const now = this.ctx.currentTime;
    if (now - this.lastCasing < 0.08) return;
    this.lastCasing = now;
    const f = this.selfFx();
    const metal = this.ly > 2.5 || (Math.abs(this.lx) > 20.8 && Math.abs(this.lx) < 23.2 && this.ly > 0.3);
    const base = metal ? 4200 : 5200;
    const d = delay + Math.random() * 0.1;
    this.tone({ f0: base, f1: base * 0.85, dur: 0.045, gain: 0.1, vol, type: 'triangle', delay: d, fx: f });
    this.tone({ f0: base * 1.1, f1: base * 0.9, dur: 0.035, gain: 0.06, vol, type: 'triangle', delay: d + 0.11, fx: f });
  }

  // Thao tác thay đạn theo từng loại súng; ms = thời gian thay đạn (ms) để dàn nhịp.
  reload(ms, id = 'rifle') {
    if (!this.ctx) return;
    if (VARIANT[id]) id = VARIANT[id].base;
    const T = ms * 0.001;
    const f = this.selfFx();
    const click = (t, fr = 2200) => this.burst({ dur: 0.02, freq: fr, gain: 0.5, type: 'bandpass', q: 4, delay: t, fx: f });
    const swish = (t, d = 0.12) => this.burst({ dur: d, freq: 1800, gain: 0.12, type: 'bandpass', q: 0.8, delay: t, fx: f });
    const thunk = (t, v = 1) => {
      this.tone({ f0: 180, f1: 70, dur: 0.07, gain: 0.5 * v, delay: t, fx: f });
      this.burst({ dur: 0.04, freq: 1400, gain: 0.35 * v, type: 'bandpass', q: 1.5, delay: t, fx: f });
    };
    if (id === 'shotgun') {
      // Nạp từng viên đạn, kết thúc bằng một nhịp bơm
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = T * (0.1 + (0.72 * i) / n);
        click(t, 1500 + (i % 2) * 300);
        this.tone({ f0: 900, f1: 600, dur: 0.04, gain: 0.12, type: 'triangle', delay: t + 0.02, fx: f });
      }
      this.clack(T * 0.88, 0.8, 1700);
      this.clack(T * 0.95, 0.8, 1300);
    } else if (id === 'pistol') {
      click(T * 0.12);
      swish(T * 0.2, 0.1);
      thunk(T * 0.52, 0.8);
      click(T * 0.6, 1900);
      this.clack(T * 0.82, 0.7, 2000);
      this.clack(T * 0.9, 0.7, 1500);
    } else {
      click(T * 0.1);
      swish(T * 0.16);
      thunk(T * 0.5);
      click(T * 0.58, 1800);
      swish(T * 0.74, 0.1); // kéo cò khoá nòng
      this.clack(T * 0.8, 0.9, 1900);
      this.clack(T * 0.9, 0.9, 1400);
    }
  }

  empty() {
    if (!this.ctx) return;
    const f = this.selfFx();
    this.burst({ dur: 0.02, freq: 2600, gain: 0.35, type: 'bandpass', q: 4, fx: f });
    this.tone({ f0: 1200, f1: 800, dur: 0.03, gain: 0.15, type: 'square', fx: f });
  }

  // Trúng đạn: thân = tiếng "tạch" thấp, đầu = tiếng "keng" cao hai nhịp, hạ gục = thêm nhịp kết thúc.
  hit(kill, head) {
    if (head) {
      this.tone({ f0: 2600, f1: 1800, dur: 0.06, gain: 0.55, type: 'triangle' });
      this.tone({ f0: 3400, f1: 2400, dur: 0.09, gain: 0.45, type: 'triangle', delay: 0.04 });
    } else {
      this.tone({ f0: kill ? 1900 : 1400, f1: 1000, dur: 0.07, gain: 0.5 });
    }
    if (kill) this.tone({ f0: 1300, f1: 900, dur: 0.1, gain: 0.45, delay: 0.09 });
  }

  // Một bước chân theo bề mặt (sf: concrete | metal | grit).
  footstep(sf, vol, pan, fx) {
    const r = 0.85 + Math.random() * 0.3;
    if (sf === 'metal') {
      this.burst({ dur: 0.07, freq: 1600 * r, gain: 0.3, vol, pan, type: 'bandpass', q: 1.5, fx });
      this.tone({ f0: 420 * r, f1: 380 * r, dur: 0.14, gain: 0.08, vol, pan, type: 'triangle', fx });
      this.tone({ f0: 760 * r, f1: 700 * r, dur: 0.1, gain: 0.05, vol, pan, type: 'triangle', fx });
    } else if (sf === 'grit') {
      for (let i = 0; i < 3; i++) this.burst({ dur: 0.03, freq: 2200 * r, gain: 0.12, vol, pan, delay: i * 0.02, fx });
      this.tone({ f0: 100 * r, f1: 60, dur: 0.06, gain: 0.1, vol, pan, fx });
    } else {
      this.burst({ dur: 0.06, freq: 700 * r, gain: 0.34, vol, pan, fx });
      this.tone({ f0: 95 * r, f1: 60, dur: 0.06, gain: 0.14, vol, pan, fx });
    }
  }

  // Bước chân của người khác: nhỏ dần theo khoảng cách, lệch trái/phải theo hướng.
  stepAt(dx, dz, listenerYaw) {
    if (!this.ctx) return;
    const s = this.spatial(dx, dz, listenerYaw, 28, 1.6);
    const vol = s.vol * 0.8;
    if (vol < 0.03) return;
    const ax = this.lx + dx;
    const az = this.lz + dz;
    const sf = Math.abs(ax) > 25 || Math.abs(az) > 24.5 ? 'grit' : 'concrete';
    this.footstep(sf, vol, s.pan, s.fx);
  }

  hurt() {
    this.tone({ f0: 120, f1: 55, dur: 0.18, gain: 0.8 });
    this.burst({ dur: 0.15, freq: 500, gain: 0.5 });
  }

  // Bước chân của chính mình, theo bề mặt đang đứng.
  step() {
    if (!this.ctx) return;
    this.footstep(surfaceAt(this.lx, this.ly, this.lz), 0.38, 0, this.selfFx());
  }

  // Vào/ra ống ngắm: tiếng lẫy nhẹ.
  scope(on) {
    this.burst({ dur: 0.03, freq: on ? 2400 : 1800, gain: 0.25, type: 'bandpass', q: 4, fx: this.selfFx() });
    this.tone({ f0: on ? 600 : 420, f1: on ? 420 : 300, dur: 0.05, gain: 0.08, type: 'triangle', fx: this.selfFx() });
  }

  // Mua đồ: tiếng "ting" hai nhịp.
  buy() {
    this.tone({ f0: 1200, f1: 1200, dur: 0.08, gain: 0.3, type: 'triangle' });
    this.tone({ f0: 1800, f1: 1800, dur: 0.12, gain: 0.3, type: 'triangle', delay: 0.07 });
  }

  // Nhận thưởng cuối vòng.
  reward() {
    for (let i = 0; i < 3; i++) this.tone({ f0: 900 + i * 300, f1: 900 + i * 300, dur: 0.1, gain: 0.25, type: 'triangle', delay: i * 0.08 });
  }

  // Ném lựu đạn: tiếng vút nhẹ (bản thân ném thêm tiếng tháo chốt).
  throwNade(own) {
    if (own) this.burst({ dur: 0.02, freq: 2600, gain: 0.4, type: 'bandpass', q: 5, fx: this.selfFx() });
    this.burst({ dur: 0.2, freq: 1200, gain: 0.12, type: 'bandpass', q: 0.6, delay: own ? 0.05 : 0, fx: this.selfFx() });
  }

  // Lựu đạn nổ: tiếng nổ sâu, vang mạnh, nhỏ dần theo khoảng cách, bị chặn khi khác phòng.
  boom(dx, dz, yaw) {
    if (!this.ctx) return;
    const s = this.spatial(dx, dz, yaw, 90, 1.2);
    const vol = Math.max(0.08, s.vol) * 1.2;
    const fx = { ...s.fx, send: 1.0 };
    this.burst({ dur: 0.06, freq: 2000, gain: 1.0, vol, pan: s.pan, type: 'highpass', fx });
    this.burst({ dur: 0.45, freq: 900, gain: 1.2, vol, pan: s.pan, fx });
    this.tone({ f0: 90, f1: 22, dur: 0.6, gain: 1.4, vol, pan: s.pan, fx });
    this.burst({ dur: 1.1, freq: 380, gain: 0.35, vol, pan: s.pan, delay: 0.05, fx });
  }

  // Bom khói bung: tiếng xì kéo dài.
  smokePop(dx, dz, yaw) {
    if (!this.ctx) return;
    const s = this.spatial(dx, dz, yaw, 50, 1.3);
    if (s.vol < 0.03) return;
    this.tone({ f0: 160, f1: 90, dur: 0.12, gain: 0.5, vol: s.vol, pan: s.pan, fx: s.fx });
    this.burst({ dur: 1.6, freq: 3000, gain: 0.22, vol: s.vol, pan: s.pan, type: 'highpass', fx: s.fx });
  }

  beep(freq = 880, dur = 0.12) {
    this.tone({ f0: freq, f1: freq, dur, gain: 0.35, type: 'triangle' });
  }
}

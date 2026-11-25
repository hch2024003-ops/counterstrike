// Kiểm thử Environment FX (logic thuần + khói chạy Weather với Three.js giả): node test/env.mjs
import assert from 'assert';
import {
  ENV_DEFAULTS, ENV_QUALITY, sanitizeEnv, loadEnvSettings, saveEnvSettings, resetEnvSettings, ENV_STORAGE_KEY,
  hashSeed, rng, weatherFor, WEATHER_PROFILES, LightningSchedule, FLASH_MAX, EnvQuality, resolveEnv, weatherSeed,
} from '../src/gfx/envlogic.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };

console.log('Cài đặt');
{
  check('mặc định hợp lệ', JSON.stringify(sanitizeEnv(null)) === JSON.stringify(ENV_DEFAULTS));
  const s = sanitizeEnv({ quality: 'xxx', density: 9999, rain: 'yes', snow: false, enabled: false });
  check('rác bị loại, giới hạn mật độ', s.quality === 'balanced' && s.density === 100 && s.rain === true && s.snow === false && s.enabled === false);
  check('mật độ tối thiểu 20', sanitizeEnv({ density: 1 }).density === 20);
  const st = mem();
  saveEnvSettings({ ...ENV_DEFAULTS, quality: 'high', fog: false, density: 55 }, st);
  const l = loadEnvSettings(st);
  check('lưu/đọc localStorage', l.quality === 'high' && l.fog === false && l.density === 55);
  st.setItem(ENV_STORAGE_KEY, '{hỏng');
  check('dữ liệu hỏng => mặc định, không ném lỗi', loadEnvSettings(st).quality === 'balanced');
  const r = resetEnvSettings(st);
  check('Reset về mặc định và lưu', JSON.stringify(r) === JSON.stringify(ENV_DEFAULTS) && JSON.parse(st.getItem(ENV_STORAGE_KEY)).quality === 'balanced');
  check('không có storage vẫn chạy', loadEnvSettings({ getItem() { throw new Error('x'); } }).enabled === true);
}

console.log('Thời tiết theo seed (đồng bộ nhiều người chơi)');
{
  const maps = Object.keys(WEATHER_PROFILES);
  let same = true;
  for (const id of maps) for (let i = 0; i < 40; i++) {
    const a = weatherFor(i * 7919, id);
    const b = weatherFor(i * 7919, id);
    if (JSON.stringify(a) !== JSON.stringify(b)) same = false;
  }
  check('cùng seed + bản đồ => cùng thời tiết', same);
  check('seed theo (pin, bản đồ, vòng) ổn định', weatherSeed('1234', 'bridge', 3) === weatherSeed('1234', 'bridge', 3) && weatherSeed('1234', 'bridge', 3) !== weatherSeed('1234', 'bridge', 4));
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(weatherFor(i, 'bridge').type);
  check('bản đồ cầu có mưa/giông/sương', seen.has('rain') && seen.has('storm') && seen.has('fog'));
  const giza = new Set();
  for (let i = 0; i < 200; i++) giza.add(weatherFor(i, 'giza').type);
  check('sa mạc Giza luôn quang (chỉ gió + bụi)', giza.size === 1 && giza.has('clear'));
  let capped = true;
  for (let i = 0; i < 500; i++) for (const id of maps) { const w = weatherFor(i, id); if (w.rain > 0.9 || w.fog > 1 || w.snow > 0.8) capped = false; }
  check('cường độ có trần', capped);
  check('map lạ dùng cấu hình dự phòng', typeof weatherFor(1, 'khong-co').type === 'string');
}

console.log('Sấm chớp');
{
  const a = new LightningSchedule(42);
  const b = new LightningSchedule(42);
  check('lịch sét giống nhau với cùng seed', JSON.stringify(a.events.slice(0, 5)) === JSON.stringify(b.events.slice(0, 5)));
  let max = 0;
  for (let t = 0; t < 300; t += 0.02) max = Math.max(max, a.flashAt(t));
  check('chớp có xảy ra và không vượt trần', max > 0.1 && max <= FLASH_MAX + 1e-9, `max=${max.toFixed(2)}`);
  const e0 = a.events[0];
  check('chớp tắt dần về 0 sau tia sét', a.flashAt(e0.t + 1.5) < 0.01 || a.events[1].t < e0.t + 1.5);
  check('sấm đến sau tia chớp', e0.thunderAt > e0.t);
  const c = new LightningSchedule(7);
  let n = 0;
  for (let t = 0; t < 200; t += 0.05) n += c.takeThunder(t).length;
  const d = new LightningSchedule(7);
  d._extend(230);
  const expect = d.events.filter((e) => e.thunderAt <= 200).length;
  check('mỗi tiếng sấm phát đúng một lần', n === expect, `${n}/${expect}`);
  const gaps = c.events.slice(1, 12).map((e, i) => e.t - c.events[i].t);
  check('khoảng cách giữa các lần chớp 5–18 giây', gaps.every((g) => g >= 5 && g <= 18.01));
}

console.log('Tự giảm hiệu ứng theo FPS (hysteresis)');
{
  const q = new EnvQuality();
  q.setTarget(60);
  let now = 0;
  const run = (fps, secs) => {
    const ms = 1000 / fps;
    const changes = [];
    for (let i = 0; i < secs * fps; i++) {
      now += ms;
      q.frame(ms, now);
      const ch = q.update(now);
      if (ch) changes.push({ ...ch, at: now });
    }
    return changes;
  };
  check('FPS tốt: giữ bậc 0', run(60, 10).length === 0 && q.level === 0);
  const down = run(50, 8);
  check('dưới ~55 FPS: giảm mật độ (bậc 1) sau khoảng chờ', q.level >= 1 && down.length >= 1 && down[0].at - 10000 > 2000, `bậc=${q.level}`);
  run(40, 12);
  check('dưới ~45 FPS: tắt hiệu ứng phụ (bậc ≥ 2)', q.level >= 2, `bậc=${q.level}`);
  run(28, 12);
  check('dưới ~35 FPS: chỉ còn hiệu ứng gameplay (bậc 3)', q.level === 3, `bậc=${q.level}`);
  const before = q.level;
  const up1 = run(60, 8);
  check('FPS vừa hồi phục: chưa nâng ngay (tránh bật/tắt liên tục)', up1.length === 0 && q.level === before);
  const up2 = run(60, 40);
  check('ổn định lâu: nâng từng bậc một', up2.length >= 1 && up2.every((c) => c.from - c.to === 1), `lần nâng=${up2.length}`);
  // dao động quanh ngưỡng không được làm đổi bậc liên tục
  const q2 = new EnvQuality();
  q2.setTarget(60);
  let t2 = 0;
  let flips = 0;
  for (let i = 0; i < 60 * 60; i++) {
    const fps = i % 120 < 60 ? 54 : 62; // 1 giây thấp, 1 giây cao
    const ms = 1000 / fps;
    t2 += ms;
    q2.frame(ms, t2);
    if (q2.update(t2)) flips++;
  }
  check('dao động nhanh quanh ngưỡng không gây nhấp nháy', flips <= 2, `đổi ${flips} lần/60 giây`);
  const q3 = new EnvQuality();
  q3.frame(5000, 100); // khung tải map
  check('khung quá dài (tải map) bị bỏ qua', q3.win.length === 0);
  const q4 = new EnvQuality();
  q4.setTarget(144);
  let t4 = 0;
  for (let i = 0; i < 144 * 6; i++) { t4 += 1000 / 120; q4.frame(1000 / 120, t4); q4.update(t4); }
  check('ngưỡng tính theo FPS mục tiêu (120/144 => hạ)', q4.level >= 1);
}

console.log('Kết hợp cài đặt + bậc tự động + mức hiệu ứng đồ họa');
{
  const s = sanitizeEnv({});
  const full = resolveEnv(s, 0, 2);
  check('bật: có hạt mưa/tuyết/bụi/lá', full.active && full.counts.rain > 0 && full.counts.dust > 0 && full.counts.leaves > 0);
  check('tắt hẳn khi enabled=false', !resolveEnv({ ...s, enabled: false }, 0, 3).active);
  check('mức hiệu ứng đồ họa Thấp (fx=0) => tắt', !resolveEnv(s, 0, 0).active);
  const red = resolveEnv(s, 1, 2);
  check('bậc 1 giảm số hạt', red.counts.rain < full.counts.rain);
  const min = resolveEnv(s, 2, 2);
  check('bậc 2 tắt bụi, lá, sương sát đất', min.counts.dust === 0 && min.counts.leaves === 0 && min.counts.mist === 0 && min.counts.rain > 0);
  check('bậc 3 tắt hiệu ứng môi trường', !resolveEnv(s, 3, 3).active);
  check('tắt từng hiệu ứng', resolveEnv({ ...s, rain: false }, 0, 2).counts.rain === 0 && resolveEnv({ ...s, dust: false }, 0, 2).counts.dust === 0);
  check('mật độ giảm hạt', resolveEnv({ ...s, density: 20 }, 0, 2).counts.rain < full.counts.rain * 0.3);
  check('Low giới hạn thấp hơn Ultra', ENV_QUALITY.low.rain < ENV_QUALITY.ultra.rain && resolveEnv({ ...s, quality: 'low' }, 0, 3).counts.dust === 0);
  check('tắt hiệu ứng camera', !resolveEnv({ ...s, cameraFx: false }, 0, 3).camera);
}

check('hashSeed/rng ổn định', hashSeed('a') === hashSeed('a') && rng(5)() === rng(5)());
console.log(fails ? `\n${fails} kiểm thử THẤT BẠI` : '\nTất cả kiểm thử Environment FX đạt');
process.exit(fails ? 1 : 0);

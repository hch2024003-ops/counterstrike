'use strict';
// Máy chơi chung (bot) chạy trên server. Chủ phòng thêm máy ở phòng chờ, chọn đội và cấp độ:
// 1 Dở · 2 Thường · 3 Khá · 4 Giỏi · 5 Xuất sắc. Cấp càng cao: phản xạ nhanh, ngắm chuẩn, biết dừng lại để bắn,
// nhớ vị trí đối thủ lâu hơn, ném lựu đạn, mua đồ thông minh hơn.
// Máy dùng đúng luật như người: bắn qua handleShoot (cùng tản đạn, sát thương, xuyên tường), thấy đối thủ qua tia nhìn
// có góc nhìn giới hạn, bị bom khói che. Máy đi trên mặt đất (không lên cầu thang/sàn cao).
const C = require('../config');
const { WEAPONS } = require('../combat/weapons');
const { handleShoot, startReload, switchWeapon, buy, handleThrow } = require('../combat/combat');

const RUN = 5.6;

const LEVELS = {
  1: { name: 'Dở', reaction: 1000, aimErr: 0.14, turn: 2.0, speed: 0.6, burst: 14, pause: 0.15, fov: 0.7, memory: 1500, headP: 0, mode: 'rush', frag: false, prefire: false },
  2: { name: 'Thường', reaction: 650, aimErr: 0.075, turn: 3.0, speed: 0.75, burst: 8, pause: 0.25, fov: 0.85, memory: 3000, headP: 0.1, mode: 'strafe', frag: false, prefire: false },
  3: { name: 'Khá', reaction: 420, aimErr: 0.045, turn: 4.5, speed: 0.88, burst: 6, pause: 0.3, fov: 1.0, memory: 4500, headP: 0.25, mode: 'peek', frag: true, prefire: false },
  4: { name: 'Giỏi', reaction: 250, aimErr: 0.022, turn: 7.0, speed: 1.0, burst: 5, pause: 0.35, fov: 1.1, memory: 6000, headP: 0.5, mode: 'peek', frag: true, prefire: false },
  5: { name: 'Xuất sắc', reaction: 150, aimErr: 0.011, turn: 10, speed: 1.0, burst: 4, pause: 0.38, fov: 1.25, memory: 8000, headP: 0.6, mode: 'peek', frag: true, prefire: true },
};
const LEVEL_NAMES = Object.fromEntries(Object.entries(LEVELS).map(([k, v]) => [k, v.name]));

// ------------------------------------------------------------------ lưới đường đi
const CELL = 0.5;
const navCache = new Map();

class NavGrid {
  constructor(map) {
    this.map = map;
    this.half = map.size / 2;
    this.n = Math.ceil(map.size / CELL) + 1;
    this.blocked = new Uint8Array(this.n * this.n);
    const R = C.PLAYER_RADIUS + 0.1;
    for (const b of map.boxes) {
      if (b.maxY <= 0.1 || b.minY >= 1.8) continue; // không cản người đi trên mặt đất
      const c0 = this.cx(b.minX - R); const c1 = this.cx(b.maxX + R);
      const r0 = this.cx(b.minZ - R); const r1 = this.cx(b.maxZ + R);
      for (let r = Math.max(0, r0); r <= Math.min(this.n - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(this.n - 1, c1); c++) {
          const x = this.wx(c); const z = this.wx(r);
          if (x > b.minX - R && x < b.maxX + R && z > b.minZ - R && z < b.maxZ + R) this.blocked[r * this.n + c] = 1;
        }
      }
    }
  }

  cx(v) { return Math.round((v + this.half) / CELL); }
  wx(c) { return c * CELL - this.half; }
  isBlocked(c, r) { return c < 0 || r < 0 || c >= this.n || r >= this.n || this.blocked[r * this.n + c] === 1; }
  freeAt(x, z) { return !this.isBlocked(this.cx(x), this.cx(z)); }

  // Điểm trống gần (x,z) nhất (tìm theo vòng tròn mở rộng).
  nearestFree(x, z) {
    const c0 = this.cx(x); const r0 = this.cx(z);
    if (!this.isBlocked(c0, r0)) return [c0, r0];
    for (let d = 1; d < 40; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          if (!this.isBlocked(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr];
        }
      }
    }
    return null;
  }

  // Đường thẳng từ a đến b có đi được không (kiểm tra mỗi 0.25 m)?
  clear(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / 0.25);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.freeAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // A* 8 hướng. Trả về danh sách điểm [{x,z}] đã làm thẳng, hoặc null nếu không có đường.
  path(sx, sz, gx, gz) {
    const s = this.nearestFree(sx, sz); const g = this.nearestFree(gx, gz);
    if (!s || !g) return null;
    const n = this.n;
    const start = s[1] * n + s[0]; const goal = g[1] * n + g[0];
    if (start === goal) return [{ x: this.wx(g[0]), z: this.wx(g[1]) }];
    const gS = new Float32Array(n * n).fill(1e9);
    const from = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap = [[0, start]];
    gS[start] = 0;
    const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1; const r = l + 1; if (l >= heap.length) break; if (r < heap.length && heap[r][0] < heap[l][0]) l = r; if (heap[i][0] <= heap[l][0]) break; [heap[i], heap[l]] = [heap[l], heap[i]]; i = l; } } return top; };
    const gc = g[0]; const gr = g[1];
    let expanded = 0;
    while (heap.length && expanded < 60000) {
      const [, cur] = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      expanded++;
      if (cur === goal) break;
      const cc = cur % n; const cr = (cur - cc) / n;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc; const nr = cr + dr;
          if (this.isBlocked(nc, nr)) continue;
          if (dr && dc && (this.isBlocked(cc + dc, cr) || this.isBlocked(cc, cr + dr))) continue; // không cắt góc
          const ni = nr * n + nc;
          if (closed[ni]) continue;
          const ng = gS[cur] + (dr && dc ? 1.414 : 1);
          if (ng < gS[ni]) {
            gS[ni] = ng; from[ni] = cur;
            const h = Math.max(Math.abs(nc - gc), Math.abs(nr - gr)) + 0.414 * Math.min(Math.abs(nc - gc), Math.abs(nr - gr));
            push([ng + h, ni]);
          }
        }
      }
    }
    if (from[goal] === -1) return null;
    const raw = [];
    for (let i = goal; i !== -1; i = from[i]) { const c = i % n; raw.push({ x: this.wx(c), z: this.wx((i - c) / n) }); }
    raw.reverse();
    // Làm thẳng đường: bỏ điểm giữa nếu nhìn thấy điểm xa hơn
    const out = [];
    let i = 0;
    while (i < raw.length - 1) {
      let j = raw.length - 1;
      while (j > i + 1 && !this.clear(raw[i].x, raw[i].z, raw[j].x, raw[j].z)) j--;
      out.push(raw[j]);
      i = j;
    }
    return out.length ? out : [raw[raw.length - 1]];
  }

  randomFree() {
    for (let k = 0; k < 40; k++) {
      const x = (Math.random() * 2 - 1) * (this.half - 2);
      const z = (Math.random() * 2 - 1) * (this.half - 2);
      if (this.freeAt(x, z)) return { x, z };
    }
    return { x: 0, z: 0 };
  }
}

function navFor(map) {
  if (!navCache.has(map.id)) navCache.set(map.id, new NavGrid(map));
  return navCache.get(map.id);
}

// ------------------------------------------------------------------ tiện ích
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75; // xấp xỉ N(0,1) trong [-2,2]

// Đoạn nhìn từ a tới b có đi qua đám khói không?
function smoked(room, a, b) {
  for (const z of room.smokes) {
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2];
    const L2 = dx * dx + dy * dy + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((z.x - a[0]) * dx + (z.y + 1.2 - a[1]) * dy + (z.z - a[2]) * dz) / L2));
    const px = a[0] + dx * t - z.x; const py = a[1] + dy * t - (z.y + 1.2); const pz = a[2] + dz * t - z.z;
    if (px * px + py * py + pz * pz < 3.2 * 3.2) return true;
  }
  return false;
}

function canSee(room, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return true;
  if (room.map.rayBoxes(a, [dx / len, dy / len, dz / len], len) < len - 0.3) return false;
  return !smoked(room, a, b);
}

// Góc ném để lựu đạn rơi gần khoảng cách dist (bỏ qua nảy). Vận tốc ném = GRENADE_SPEED, cộng thêm 3 m/s hướng lên.
function throwPitch(dist) {
  const g = 18; const sp = C.GRENADE_SPEED;
  let best = 0.35; let bestErr = 1e9;
  for (let p = 0.05; p < 1.2; p += 0.02) {
    const vx = Math.cos(p) * sp; const vy = Math.sin(p) * sp + 3;
    const h0 = 1.5;
    const t = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
    const err = Math.abs(vx * t - dist);
    if (err < bestErr) { bestErr = err; best = p; }
  }
  return best;
}

// ------------------------------------------------------------------ bộ não
class BotAI {
  constructor(player, level) {
    this.p = player;
    this.level = level;
    this.L = LEVELS[level] || LEVELS[2];
    this.reset();
  }

  reset() {
    this.target = null; this.seenAt = 0; this.lostAt = 0; this.lastKnown = null;
    this.path = null; this.pathIdx = 0; this.goal = null; this.repathAt = 0; this.waitUntil = 0;
    this.noise = [0, 0]; this.noiseAt = 0; this.aimHead = false;
    this.burstLeft = this.L.burst; this.pauseUntil = 0; this.strafeDir = 1; this.strafeAt = 0;
    this.stuckAt = 0; this.stuckX = 0; this.stuckZ = 0;
    this.boughtRound = -1; this.nextNade = 0; this.lastThink = 0;
  }

  onHit(attacker, now) {
    if (!attacker || attacker.team === this.p.team) return;
    if (!this.target) {
      this.target = attacker.id; this.seenAt = now - this.L.reaction * 0.5; this.lostAt = now;
      this.lastKnown = { x: attacker.x, z: attacker.z };
    }
  }
}

function botBuy(room, p, now) {
  if (!room.settings.economy) return;
  const lv = p.ai.level;
  const tryBuy = (id) => buy(room, p, id, now) === null;
  const pick = (ids) => ids.find((id) => WEAPONS[id] && p.money >= WEAPONS[id].price && !p.owned.includes(id));
  const hasPrimary = p.owned.some((id) => WEAPONS[id] && WEAPONS[id].cat === 'primary');
  if (lv === 1) {
    const w = pick(Math.random() < 0.5 ? ['deagle', 'smg'] : ['shotgun', 'deagle']);
    if (w && Math.random() < 0.7) tryBuy(w);
  } else if (lv === 2) {
    if (!hasPrimary) { const w = pick(['ak', 'shotgun', 'smg']); if (w) tryBuy(w); }
    else if (p.money >= 650 && Math.random() < 0.5) tryBuy('deagle');
  } else {
    const prefs = lv === 3 ? ['ak', 'rifle', 'smg'] : lv === 4 ? (Math.random() < 0.25 ? ['sniper', 'ak', 'rifle', 'smg'] : ['ak', 'rifle', 'smg']) : (Math.random() < 0.3 ? ['sniper', 'ak', 'rifle', 'lmg', 'smg'] : ['ak', 'rifle', 'smg']);
    if (!hasPrimary) { const w = pick(prefs); if (w) tryBuy(w); }
    if (p.money >= 650 && p.armor < 100) tryBuy('armor');
    if (lv >= 3 && p.money >= 300 && p.nades.frag < 1) tryBuy('frag');
    if (p.money >= 650 && !p.owned.includes('deagle') && lv >= 4) tryBuy('deagle');
  }
  p.ai.boughtRound = room.match.round;
}

function moveTo(room, p, tx, tz, speed, dt) {
  const dx = tx - p.x; const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) { p.speed = 0; return; }
  const step = Math.min(d, speed * dt);
  const nx = p.x + (dx / d) * step; const nz = p.z + (dz / d) * step;
  const map = room.map;
  let moved = false;
  if (!map.insideWall(nx, 0, p.z)) { p.x = nx; moved = true; }
  if (!map.insideWall(p.x, 0, nz)) { p.z = nz; moved = true; }
  p.speed = moved ? speed : 0;
  p.y = 0;
}

function think(room, p, now, dt) {
  const ai = p.ai; const L = ai.L;
  const w = WEAPONS[p.weapon];
  const eye = [p.x, 1.6, p.z];
  const nav = navFor(room.map);
  p.speed = 0;

  // ---- 1. Quan sát
  let best = null; let bd = 1e9;
  for (const e of room.players.values()) {
    if (!e.alive || e.team === p.team) continue;
    const dx = e.x - p.x; const dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 90) continue;
    const bearing = Math.atan2(-dx, -dz);
    const inView = d < 4 || Math.abs(angDiff(bearing, p.yaw)) < L.fov;
    if (!inView) continue;
    if (!canSee(room, eye, [e.x, e.y + 1.1, e.z])) continue;
    if (d < bd) { bd = d; best = e; }
  }
  let enemy = null;
  if (best) {
    if (ai.target !== best.id) {
      ai.target = best.id; ai.seenAt = now;
      ai.aimHead = Math.random() < L.headP;
    }
    ai.lastKnown = { x: best.x, z: best.z }; ai.lostAt = 0;
    enemy = best;
  } else if (ai.target) {
    if (!ai.lostAt) ai.lostAt = now;
    if (now - ai.lostAt > L.memory) { ai.target = null; ai.lastKnown = null; }
  }

  // ---- 2. Đạn: nạp / đổi súng
  p.scoped = !!w.scope; // máy luôn ngắm chuẩn với súng bắn tỉa (súng khác bắn không nhắm)
  const a = p.ammo[w.id];
  if (!p.reloadEnd) {
    if (a.mag === 0) {
      const sec = p.owned.find((id) => WEAPONS[id].cat === 'secondary' && p.ammo[id].mag > 0);
      if (enemy && sec && L.mode === 'peek' && sec !== p.weapon) switchWeapon(room, p, sec, now);
      else startReload(room, p, now);
    } else if (!enemy && a.mag < w.mag * 0.5) startReload(room, p, now);
  }

  // ---- 3. Mục tiêu ngắm
  let wantYaw = p.yaw; let wantPitch = 0; let aiming = false;
  if (enemy || (ai.lastKnown && L.prefire && w.pen >= 0.5 && ai.lostAt && now - ai.lostAt < 1500)) {
    const tx = enemy ? enemy.x : ai.lastKnown.x; const tz = enemy ? enemy.z : ai.lastKnown.z;
    const ty = enemy ? enemy.y : 0;
    const dx = tx - p.x; const dz = tz - p.z; const hd = Math.hypot(dx, dz);
    const aimY = ty + (ai.aimHead ? 1.55 : 1.05);
    wantYaw = Math.atan2(-dx, -dz);
    wantPitch = Math.atan2(aimY - 1.6, Math.max(hd, 0.1));
    aiming = true;
  }
  if (now > ai.noiseAt) { ai.noise = [gauss() * L.aimErr, gauss() * L.aimErr * 0.6]; ai.noiseAt = now + 280; }

  // ---- 4. Hành động
  if (aiming) {
    const ty = Math.max(-L.turn * dt, Math.min(L.turn * dt, angDiff(wantYaw + ai.noise[0], p.yaw)));
    const tp = Math.max(-L.turn * dt, Math.min(L.turn * dt, wantPitch + ai.noise[1] - p.pitch));
    p.yaw += ty; p.pitch += tp;
    const err = Math.abs(angDiff(wantYaw, p.yaw)) + Math.abs(wantPitch - p.pitch);
    const ready = now - ai.seenAt >= L.reaction;
    let shooting = false;
    if (ready && err < 0.05 + L.aimErr * 1.6 && (enemy || (L.prefire && w.pen >= 0.5))) {
      if (now >= ai.pauseUntil) {
        shooting = true;
        handleShoot(room, p, now);
        ai.burstLeft--;
        if (ai.burstLeft <= 0) { ai.pauseUntil = now + L.pause * 1000 * (0.6 + Math.random() * 0.8); ai.burstLeft = Math.max(2, Math.round(L.burst * (0.7 + Math.random() * 0.6))); }
      }
    }
    // chuyển động khi giao tranh
    const sp = RUN * L.speed;
    if (L.mode === 'rush') {
      if (enemy) moveTo(room, p, enemy.x, enemy.z, sp, dt);
    } else if (L.mode === 'strafe' || !shooting) {
      if (now > ai.strafeAt) { ai.strafeDir = Math.random() < 0.5 ? -1 : 1; ai.strafeAt = now + 500 + Math.random() * 900; }
      const rx = Math.cos(p.yaw); const rz = -Math.sin(p.yaw);
      const sv = (L.mode === 'strafe' ? 0.6 : 0.45) * sp * ai.strafeDir;
      moveTo(room, p, p.x + rx * sv, p.z + rz * sv, Math.abs(sv), dt);
    } // 'peek' đang bắn: đứng im để đạn chuẩn
    // lựu đạn
    if (L.frag && p.nades.frag > 0 && now > ai.nextNade && enemy && bd > 7 && bd < 13 && Math.random() < 0.01) {
      const keepYaw = p.yaw; const keepPitch = p.pitch;
      p.pitch = throwPitch(bd);
      handleThrow(room, p, 'frag', now);
      p.yaw = keepYaw; p.pitch = keepPitch;
      ai.nextNade = now + 9000;
    }
    return;
  }

  // ---- 5. Di chuyển theo đường (săn vị trí cuối / tuần tra)
  if (now < ai.waitUntil) { p.pitch *= 0.9; return; }
  const hunting = ai.lastKnown && ai.lostAt && now - ai.lostAt < L.memory;
  if (hunting) {
    if (!ai.goal || Math.hypot(ai.goal.x - ai.lastKnown.x, ai.goal.z - ai.lastKnown.z) > 2) { ai.goal = { ...ai.lastKnown }; ai.path = null; }
  } else if (!ai.goal || Math.hypot(ai.goal.x - p.x, ai.goal.z - p.z) < 1.2) {
    if (ai.goal && Math.random() < 0.4 && L.mode !== 'rush') ai.waitUntil = now + 600 + Math.random() * 1800; // đứng canh
    const enemyTeam = p.team === 'A' ? 'B' : 'A';
    if (L.mode !== 'rush' && Math.random() < 0.6) {
      const sp = room.map.data.spawns[enemyTeam].points;
      const q = sp[Math.floor(Math.random() * sp.length)];
      ai.goal = { x: q[0] + (Math.random() - 0.5) * 8, z: q[1] + (Math.random() - 0.5) * 8 };
    } else ai.goal = nav.randomFree();
    ai.path = null;
  }
  if (ai.goal && (!ai.path || now > ai.repathAt)) {
    ai.path = nav.path(p.x, p.z, ai.goal.x, ai.goal.z);
    ai.pathIdx = 0; ai.repathAt = now + 1500;
    if (!ai.path) { ai.goal = null; return; }
  }
  if (ai.path && ai.pathIdx < ai.path.length) {
    const wp = ai.path[ai.pathIdx];
    if (Math.hypot(wp.x - p.x, wp.z - p.z) < 0.7) { ai.pathIdx++; return; }
    const want = Math.atan2(-(wp.x - p.x), -(wp.z - p.z));
    const dy = Math.max(-L.turn * dt, Math.min(L.turn * dt, angDiff(want, p.yaw)));
    p.yaw += dy; p.pitch *= 0.9;
    moveTo(room, p, wp.x, wp.z, RUN * L.speed, dt);
    // kẹt: gần như không nhúc nhích trong 1 giây -> chọn lại đích
    if (now > ai.stuckAt) {
      if (Math.hypot(p.x - ai.stuckX, p.z - ai.stuckZ) < 0.3) { ai.goal = null; ai.path = null; }
      ai.stuckAt = now + 1000; ai.stuckX = p.x; ai.stuckZ = p.z;
    }
  } else if (ai.path) { ai.goal = null; ai.path = null; }
}

// Gọi mỗi tick. Chỉ máy còn sống và trận đang diễn ra mới hành động.
function updateBots(room, now) {
  for (const p of room.players.values()) {
    if (!p.ai || !p.alive) continue;
    const m = room.match;
    if (m.phase === 'freeze' && p.ai.boughtRound !== m.round) botBuy(room, p, now);
    if (m.phase !== 'live') continue;
    const dt = Math.min(0.1, p.ai.lastThink ? (now - p.ai.lastThink) / 1000 : C.TICK_MS / 1000);
    p.ai.lastThink = now;
    think(room, p, now, dt);
  }
}

const FAKE_WS = () => ({ readyState: 1, bufferedAmount: 0, send() {}, close() {}, terminate() {} });

module.exports = { LEVELS, LEVEL_NAMES, BotAI, updateBots, navFor, FAKE_WS, botBuy };

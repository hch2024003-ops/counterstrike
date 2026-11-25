'use strict';
// Lựu đạn và bom khói: server mô phỏng vật lý (trọng lực, nảy khi chạm tường/sàn), nổ sau thời gian ngòi.
// Lựu đạn sát thương theo khoảng cách, bị tường chắn. Bom khói tạo vùng khói (client vẽ, che tầm nhìn).
const C = require('../config');

const G = 18; // gia tốc rơi (m/s²)
const R = 0.12; // bán kính quả lựu đạn
let nextId = 1;

class Grenade {
  constructor(kind, owner, pos, vel, now) {
    this.id = nextId++;
    this.kind = kind; // 'frag' | 'smoke'
    this.owner = owner;
    this.x = pos[0]; this.y = pos[1]; this.z = pos[2];
    this.vx = vel[0]; this.vy = vel[1]; this.vz = vel[2];
    this.explodeAt = now + (kind === 'smoke' ? C.SMOKE_FUSE_MS : C.FRAG_FUSE_MS);
    this.done = false;
  }

  // Đi tới theo từng trục để xử lý nảy riêng cho mỗi mặt chạm.
  step(dt, map) {
    const sub = 3;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      this.vy -= G * h;
      let nx = this.x + this.vx * h;
      if (map.pointHitsBox(nx, this.y, this.z, R)) { this.vx *= -0.45; nx = this.x; this.vz *= 0.85; }
      this.x = nx;
      let nz = this.z + this.vz * h;
      if (map.pointHitsBox(this.x, this.y, nz, R)) { this.vz *= -0.45; nz = this.z; this.vx *= 0.85; }
      this.z = nz;
      let ny = this.y + this.vy * h;
      if (map.pointHitsBox(this.x, ny, this.z, R)) {
        this.vy = Math.abs(this.vy) < 1.2 ? 0 : -this.vy * 0.35;
        this.vx *= 0.8; this.vz *= 0.8;
        ny = this.y;
      }
      this.y = ny;
      if (this.y < R) {
        this.y = R;
        this.vy = Math.abs(this.vy) < 1.2 ? 0 : -this.vy * 0.35;
        this.vx *= 0.75; this.vz *= 0.75;
      }
      if (this.y <= R + 0.01) { // lăn trên sàn: ma sát
        const f = Math.max(0, 1 - 3.5 * h);
        this.vx *= f; this.vz *= f;
      }
      const lim = map.bounds + 0.2;
      if (Math.abs(this.x) > lim) { this.x = Math.sign(this.x) * lim; this.vx *= -0.4; }
      if (Math.abs(this.z) > lim) { this.z = Math.sign(this.z) * lim; this.vz *= -0.4; }
    }
  }
}

// Ném: hướng từ yaw/pitch, thêm chút vận tốc hướng lên để ném vòng cung.
function throwGrenade(room, p, kind, dir, now) {
  const origin = [p.x + dir[0] * 0.5, p.y + (p.crouch ? C.CROUCH_EYE_HEIGHT : C.EYE_HEIGHT) - 0.1 + dir[1] * 0.5, p.z + dir[2] * 0.5];
  const sp = C.GRENADE_SPEED;
  // Cộng đà của người ném: chạy hoặc nhảy rồi ném sẽ bay xa hơn.
  const mv = Math.max(-4, Math.min(4, (p.vy || 0) * C.THROW_MOM_V));
  const vel = [dir[0] * sp + (p.vx || 0) * C.THROW_MOM_H, dir[1] * sp + 3 + mv, dir[2] * sp + (p.vz || 0) * C.THROW_MOM_H];
  const g = new Grenade(kind, p, origin, vel, now);
  room.grenades.push(g);
  return g;
}

// Có tường chắn giữa (x1,y1,z1) và (x2,y2,z2) không?
function blocked(map, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return false;
  const dir = [d[0] / len, d[1] / len, d[2] / len];
  return map.rayBoxes(a, dir, len) < len - 0.25;
}

function explodeFrag(room, g, now, applyDamage, WEAPON_FRAG) {
  const pos = [g.x, g.y + 0.25, g.z];
  room.broadcast({ t: 'boom', kind: 'frag', p: [g.x, g.y, g.z].map((v) => Math.round(v * 100) / 100) });
  for (const v of [...room.players.values()]) {
    if (!v.alive) continue;
    if (g.owner && v !== g.owner && v.team === g.owner.team) continue; // không gây sát thương đồng đội
    const tgt = [v.x, v.y + 1.0, v.z];
    const d = Math.hypot(tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]);
    if (d >= C.FRAG_RADIUS) continue;
    if (blocked(room.map, pos, tgt)) continue;
    let dmg = C.FRAG_DAMAGE * Math.pow(1 - d / C.FRAG_RADIUS, 1.2);
    if (v === g.owner) dmg *= 0.6;
    dmg = Math.round(dmg);
    if (dmg < 1) continue;
    applyDamage(room, g.owner || v, v, dmg, false, WEAPON_FRAG, now);
  }
}

function explodeSmoke(room, g) {
  const zone = { id: g.id, x: g.x, y: g.y, z: g.z, endAt: Date.now() + C.SMOKE_MS };
  room.smokes.push(zone);
  room.broadcast({ t: 'smoke', id: g.id, p: [g.x, g.y, g.z].map((v) => Math.round(v * 100) / 100), ms: C.SMOKE_MS });
}

// Gọi mỗi tick của phòng.
function updateGrenades(room, now, dt, applyDamage, WEAPON_FRAG) {
  if (room.smokes.length) room.smokes = room.smokes.filter((z) => z.endAt > now);
  if (!room.grenades.length) return;
  for (const g of room.grenades) {
    g.step(dt, room.map);
    if (now >= g.explodeAt) {
      g.done = true;
      if (g.kind === 'smoke') explodeSmoke(room, g);
      else explodeFrag(room, g, now, applyDamage, WEAPON_FRAG);
    }
  }
  room.grenades = room.grenades.filter((g) => !g.done);
}

module.exports = { Grenade, throwGrenade, updateGrenades, blocked };

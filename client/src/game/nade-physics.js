// Vật lý lựu đạn dùng chung cho đường ngắm (preview) ở client. PHẢI giống server/src/game/grenades.js để quỹ đạo vẽ trùng khớp quỹ đạo thật.
// Không phụ thuộc three nên kiểm thử được bằng Node (client/test/nade.mjs so sánh với server).

export const NADE = { speed: 15, momH: 0.8, momV: 0.6, fuseMs: 1800, gravity: 18, radius: 0.12 };

function hits(boxes, x, y, z, r) {
  for (const b of boxes) {
    if (x + r > b.minX && x - r < b.maxX && y + r > b.minY && y - r < b.maxY && z + r > b.minZ && z - r < b.maxZ) return true;
  }
  return false;
}

// Một bước vật lý (dt giây), 3 bước con, giống Grenade.step của server.
export function stepNade(g, dt, boxes, bounds) {
  const G = NADE.gravity;
  const R = NADE.radius;
  const sub = 3;
  const h = dt / sub;
  for (let i = 0; i < sub; i++) {
    g.vy -= G * h;
    let nx = g.x + g.vx * h;
    if (hits(boxes, nx, g.y, g.z, R)) { g.vx *= -0.45; nx = g.x; g.vz *= 0.85; }
    g.x = nx;
    let nz = g.z + g.vz * h;
    if (hits(boxes, g.x, g.y, nz, R)) { g.vz *= -0.45; nz = g.z; g.vx *= 0.85; }
    g.z = nz;
    let ny = g.y + g.vy * h;
    if (hits(boxes, g.x, ny, g.z, R)) {
      g.vy = Math.abs(g.vy) < 1.2 ? 0 : -g.vy * 0.35;
      g.vx *= 0.8; g.vz *= 0.8;
      ny = g.y;
    }
    g.y = ny;
    if (g.y < R) {
      g.y = R;
      g.vy = Math.abs(g.vy) < 1.2 ? 0 : -g.vy * 0.35;
      g.vx *= 0.75; g.vz *= 0.75;
    }
    if (g.y <= R + 0.01) {
      const f = Math.max(0, 1 - 3.5 * h);
      g.vx *= f; g.vz *= f;
    }
    const lim = bounds + 0.2;
    if (Math.abs(g.x) > lim) { g.x = Math.sign(g.x) * lim; g.vx *= -0.4; }
    if (Math.abs(g.z) > lim) { g.z = Math.sign(g.z) * lim; g.vz *= -0.4; }
  }
}

// Điểm xuất phát và vận tốc ban đầu khi ném (giống throwGrenade ở server).
// p: {x,y,z} chân người chơi; eyeHeight; dir: hướng nhìn đơn vị; v: {vx,vy,vz} vận tốc người chơi.
export function throwParams(p, eyeHeight, dir, v) {
  const origin = [p.x + dir[0] * 0.5, p.y + eyeHeight - 0.1 + dir[1] * 0.5, p.z + dir[2] * 0.5];
  const mv = Math.max(-4, Math.min(4, (v.vy || 0) * NADE.momV));
  const vel = [dir[0] * NADE.speed + (v.vx || 0) * NADE.momH, dir[1] * NADE.speed + 3 + mv, dir[2] * NADE.speed + (v.vz || 0) * NADE.momH];
  return { origin, vel };
}

// Mô phỏng tới lúc nổ. Trả về danh sách điểm [x,y,z] (cách nhau 1/30 giây) và điểm cuối.
export function simulateNade(origin, vel, boxes, bounds, seconds = NADE.fuseMs / 1000) {
  const g = { x: origin[0], y: origin[1], z: origin[2], vx: vel[0], vy: vel[1], vz: vel[2] };
  const pts = [[g.x, g.y, g.z]];
  const dt = 0.033;
  for (let t = 0; t < seconds; t += dt) {
    stepNade(g, dt, boxes, bounds);
    pts.push([g.x, g.y, g.z]);
  }
  return { pts, end: pts[pts.length - 1] };
}

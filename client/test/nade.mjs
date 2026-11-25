// Quỹ đạo lựu đạn vẽ ở client phải trùng quỹ đạo thật do server mô phỏng (tất cả bản đồ, nhiều hướng ném).
import fs from 'node:fs';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { simulateNade, throwParams } from '../src/game/nade-physics.js';
import { makeBoxes } from '../src/game/controller.js';
const require = createRequire(import.meta.url);
const { Grenade, throwGrenade } = require('../../server/src/game/grenades');
const { getMap, listMapIds } = require('../../server/src/game/map');

let worst = 0;
let n = 0;
for (const id of listMapIds()) {
  const data = JSON.parse(fs.readFileSync(new URL(`../assets/maps/${id}.json`, import.meta.url), 'utf8'));
  const boxes = makeBoxes(data);
  const map = getMap(id);
  const sp = map.spawn('A', 2);
  for (let k = 0; k < 12; k++) {
    const yaw = (k / 12) * Math.PI * 2;
    const pitch = 0.1 + (k % 4) * 0.25;
    const dir = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    const v = { vx: (k % 3) * 2, vy: (k % 2) * 4, vz: -(k % 4) * 1.5 };
    const player = { x: sp.x, y: 0, z: sp.z, vx: v.vx, vy: v.vy, vz: v.vz };
    const room = { grenades: [], map };
    const g = throwGrenade(room, player, 'frag', dir, 0);
    const tp = throwParams(player, 1.6, dir, v);
    assert.ok(Math.hypot(tp.origin[0] - g.x, tp.origin[1] - g.y, tp.origin[2] - g.z) < 1e-6, 'điểm ném khác server');
    const c = simulateNade(tp.origin, tp.vel, boxes, map.bounds);
    for (let i = 0; i < c.pts.length - 1; i++) g.step(0.033, map);
    const d = Math.hypot(c.end[0] - g.x, c.end[1] - g.y, c.end[2] - g.z);
    worst = Math.max(worst, d); n++;
  }
}
console.log(`  ${n} lần ném trên mọi bản đồ: lệch lớn nhất giữa client và server = ${worst.toFixed(4)} m`);
assert.ok(worst < 0.01, 'quỹ đạo preview phải trùng server');
console.log('\nNADE OK');

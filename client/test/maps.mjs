// Kiểm thử bản đồ bằng bộ điều khiển thật của client (không cần trình duyệt): mỗi bản đồ nạp được, đi thẳng không xuyên tường bao,
// cầu thang lên được sàn/tường thành, kim tự tháp trèo được, và dữ liệu client trùng server.
import fs from 'node:fs';
import assert from 'node:assert';
import { Controller, makeBoxes } from '../src/game/controller.js';
import { FixedStepper } from '../src/game/loop.js';
import { createRequire } from 'node:module';
import { PHYSICS_STEP } from '../src/config.js';
const require = createRequire(import.meta.url);
const { applyPose } = require('../../server/src/game/movement');
const { getMap } = require('../../server/src/game/map');
const { Player } = require('../../server/src/rooms/player');

const dir = new URL('../assets/maps/', import.meta.url);
const sdir = new URL('../../server/src/maps/', import.meta.url);
const ids = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};
const load = (id) => JSON.parse(fs.readFileSync(new URL(id + '.json', dir), 'utf8'));

let peakY = 0; // độ cao lớn nhất đạt được trong lần chạy gần nhất
function run(map, x, z, yaw, seconds, setup) {
  peakY = 0;
  const c = new Controller(makeBoxes(map));
  c.setPosition(x, 0, z, yaw);
  c.canMove = true;
  setup && setup(c);
  const st = new FixedStepper(PHYSICS_STEP);
  for (let f = 0; f < seconds * 60; f++) {
    c.keys.f = true;
    st.advance(1 / 60, (h) => { c.update(h); peakY = Math.max(peakY, c.y); });
  }
  return c;
}

check(`Có ${ids.length} bản đồ`, ids.length >= 7, ids.join(', '));
for (const id of ids) {
  const a = fs.readFileSync(new URL(id + '.json', dir), 'utf8');
  const b = fs.readFileSync(new URL(id + '.json', sdir), 'utf8');
  check(`${id}: client = server`, a === b);
  const map = load(id);
  const half = map.size / 2;
  // Đi thẳng từ spawn A (yaw 0 = hướng -z) 30 giây: không bao giờ ra ngoài tường bao
  const sp = map.spawns.A.points[2];
  const c = run(map, sp[0], sp[1], 0, 30);
  check(`${id}: đi thẳng 30s không ra khỏi bản đồ`, Math.abs(c.x) < half && Math.abs(c.z) < half, `(${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
}

// Cầu thang Trường Thành: từ (18, 15) đi về -z lên tường cao 5m
{
  const map = load('greatwall');
  const c = run(map, 18, 15, 0, 9);
  check('Trường Thành: đi lên cầu thang tới đường đi trên tường (y ≥ 4.5)', c.y >= 4.5, `y=${c.y.toFixed(2)} z=${c.z.toFixed(1)}`);
}
// Kim tự tháp Giza: trèo bậc lên đỉnh
{
  const map = load('giza');
  run(map, -22, 0, 0, 6); // đi về -z, qua pyramid tâm (-22,-14), đáy 20 (z -4..-24)
  check('Giza: trèo được lên đỉnh kim tự tháp (độ cao tối đa ≥ 4)', peakY >= 4, `đỉnh y=${peakY.toFixed(2)}`);
}
// Sàn thao tác kho hàng vẫn lên được
{
  const map = load('warehouse');
  const c = run(map, -22, 20, 0, 5);
  check('Kho hàng: lên cầu thang sàn thao tác (y ≥ 3)', c.y >= 3, `y=${c.y.toFixed(2)}`);
}
// Cầu Cổng Vàng: đi dọc mặt cầu từ A sang B không bị kẹt
{
  const map = load('bridge');
  const c = run(map, 1.5, 36, 0, 12, (cc) => { cc.keys.f = true; });
  check('Cầu Cổng Vàng: đi dọc mặt cầu qua phía bên kia (z < -20)', c.z < -20, `z=${c.z.toFixed(1)}`);
}
// Server chấp nhận chuyển động của client trên cầu thang/kim tự tháp (không kéo lại oan)
for (const [id, x, z, secs] of [['greatwall', 18, 15, 9], ['giza', -22, 0, 6], ['warehouse', -22, 20, 6], ['bridge', 1.5, 36, 10]]) {
  const map = load(id);
  const c = new Controller(makeBoxes(map));
  c.setPosition(x, 0, z, 0);
  c.canMove = true;
  c.keys.f = true;
  const room = { match: { phase: 'live' }, map: getMap(id) };
  let corrections = 0;
  const p = new Player(1, 'T', { readyState: 1, send(m) { if (JSON.parse(m).t === 'correct') corrections++; }, bufferedAmount: 0 });
  p.alive = true; p.x = x; p.y = 0; p.z = z; p.lastMoveAt = 0; p.lastCorrect = -1e9;
  const st = new FixedStepper(PHYSICS_STEP);
  let now = 1000;
  for (let f = 0; f < secs * 60; f++) {
    st.advance(1 / 60, (h) => c.update(h));
    if (f % 3 === 0) { now += 50; applyPose(room, p, { x: c.x, y: c.y, z: c.z, yaw: 0, pitch: 0 }, now); }
  }
  check(`${id}: server không kéo lại người chơi khi leo/đi (${corrections} lần)`, corrections === 0);
}
if (fails) { console.log(`\n${fails} LỖI`); process.exit(1); }
console.log('\nMAPS OK');

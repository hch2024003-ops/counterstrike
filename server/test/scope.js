'use strict';
// Kiểm thử ném lựu đạn có đà (chạy/nhảy bay xa hơn) và súng bắn tỉa phải nhìn qua ống ngắm mới chuẩn.
process.env.HACHIHI_FREEZE_MS = '50';
const assert = require('assert');
const { Room } = require('../src/rooms/room');
const { Player } = require('../src/rooms/player');
const { throwGrenade } = require('../src/game/grenades');
const { WEAPONS } = require('../src/combat/weapons');
const { handleShoot } = require('../src/combat/combat');
const C = require('../src/config');
const { UNSCOPED_SPREAD, computeSpread } = require('../src/combat/weapons');

const ok = (s) => console.log('  ✓', s);
const mk = (id) => new Player(id, 'p' + id, { readyState: 1, send() {} });
const newRoom = () => { const r = new Room('8888', {}); const a = mk(1); const b = mk(2); r.addPlayer(a); r.addPlayer(b); r.match.start(1000); r.match.phase = 'live'; return { r, a, b }; };

const FLAT = { pointHitsBox: () => false, bounds: 500 }; // sân phẳng không vật cản: đo tầm ném thuần
function landing(room, g) {
  let t = 0;
  while (t < 1.78) { g.step(0.033, FLAT); t += 0.033; } // đúng thời gian ngòi nổ của lựu đạn
  return Math.hypot(g.x, g.z);
}

{
  const { r, a } = newRoom();
  a.x = 0; a.z = 0; a.y = 0; a.yaw = 0; a.pitch = 0.5;
  const dir = [0, Math.sin(0.5), -Math.cos(0.5)];
  const still = throwGrenade(r, a, 'frag', dir, 0);
  a.vz = -5.6; a.vy = 0; // chạy tiến
  const run = throwGrenade(r, a, 'frag', dir, 0);
  a.vy = 4.5; // chạy + nhảy lên
  const jump = throwGrenade(r, a, 'frag', dir, 0);
  const d0 = landing(r, still); const d1 = landing(r, run); const d2 = landing(r, jump);
  console.log(`    đứng im ${d0.toFixed(1)} m · chạy ${d1.toFixed(1)} m · chạy+nhảy ${d2.toFixed(1)} m`);
  assert.ok(d1 > d0 + 2, 'chạy rồi ném bay xa hơn');
  assert.ok(d2 > d1, 'nhảy rồi ném bay xa hơn nữa');
  ok('Ném khi chạy/nhảy bay xa hơn ném đứng im');
}

{
  // Server tự ước lượng vận tốc từ gói vị trí
  const { r, a } = newRoom();
  const { applyPose } = require('../src/game/movement');
  a.x = 0; a.y = 0; a.z = 20; a.lastMoveAt = 0;
  let now = 5000;
  for (let i = 0; i < 20; i++) { now += 50; applyPose(r, a, { x: 0, y: 0, z: a.z - 0.25, yaw: 0, pitch: 0 }, now); }
  assert.ok(a.vz < -3, 'vận tốc z âm khi chạy tiến, có ' + a.vz.toFixed(2));
  ok('Server ước lượng vận tốc người chơi từ các gói vị trí');
}

{
  // Bắn tỉa: có ống ngắm chuẩn, không ống ngắm lệch nhiều
  const { r, a } = newRoom();
  a.owned = ['sniper', 'pistol']; a.weapon = 'sniper';
  a.ammo.sniper = { mag: 5, reserve: 20 };
  const w = WEAPONS.sniper;
  assert.strictEqual(w.scope, true);
  const scoped = computeSpread(w, 0, false, 0, true);
  const unscoped = computeSpread(w, 0, false, 0, false);
  assert.ok(scoped < 0.002, 'nhìn qua ống ngắm, đứng yên: rất chuẩn');
  assert.ok(unscoped > 0.04 && Math.abs(unscoped - scoped - UNSCOPED_SPREAD) < 1e-9, 'không ống ngắm lệch lớn');
  ok('Bắn tỉa: cơ bản rất chuẩn; không nhìn qua ống ngắm tản đạn +' + UNSCOPED_SPREAD + ' rad');
}

{
  const { r, a } = newRoom();
  const { switchWeapon } = require('../src/combat/combat');
  a.owned = ['sniper', 'pistol']; a.weapon = 'sniper'; a.scoped = true;
  switchWeapon(r, a, 'pistol', 2000);
  assert.strictEqual(a.scoped, false, 'đổi súng thì thoát ống ngắm');
  ok('Đổi súng tự thoát chế độ ngắm');
}
{
  // Nhắm (chuột phải) làm súng thường chuẩn hơn
  for (const id of ['rifle', 'ak', 'smg', 'lmg', 'pistol', 'deagle']) {
    const w = WEAPONS[id];
    assert.ok(w.ads > 40 && w.ads < 75 && w.adsSpread < 1, id + ' có thông số ads');
    assert.ok(computeSpread(w, 0, false, 5, true) < computeSpread(w, 0, false, 5, false), id + ': nhắm phải chuẩn hơn');
  }
  for (const id of ['shotgun', 'autoshotgun']) {
    assert.ok(!WEAPONS[id].ads, id + ' không có ads');
    assert.strictEqual(computeSpread(WEAPONS[id], 0, false, 0, true), computeSpread(WEAPONS[id], 0, false, 0, false));
  }
  ok('Nhắm (ads) giảm tản đạn cho súng trường/AK/tiểu liên/đại liên/súng lục; shotgun không đổi');
}
console.log('\nSCOPE OK');

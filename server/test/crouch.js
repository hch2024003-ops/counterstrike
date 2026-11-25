'use strict';
// Kiểm thử tư thế ngồi phía server: hitbox thấp hơn và kiểm tra chỗ trống. Chạy: node test/crouch.js
const assert = require('assert');
const C = require('../src/config');
const { traceRay } = require('../src/combat/hitscan');
const { applyPose } = require('../src/game/movement');
const { GameMap } = require('../src/game/map');

const t = (name, fn) => { fn(); console.log('  ✓ ' + name); };
const shootAt = (crouch, y) => {
  const target = { ref: {}, x: 0, y: 0, z: 0, crouch };
  const map = { rayBoxes: () => 1e9, rayFloor: () => 1e9 };
  return traceRay([0, y, 10], [0, 0, -1], 50, [target], map);
};

t('Đứng: bắn ngang tầm 1.6 m trúng đầu', () => {
  const r = shootAt(false, 1.62);
  assert.ok(r.hit && r.hit.head);
});
t('Ngồi: bắn ngang tầm 1.6 m bay qua đầu (đầu đã hạ xuống)', () => {
  assert.strictEqual(shootAt(true, 1.62).hit, null);
});
t('Ngồi: bắn ngang tầm mắt ngồi (1.17 m) trúng đầu', () => {
  const r = shootAt(true, 1.17);
  assert.ok(r.hit && r.hit.head);
});
t('Ngồi: bắn vào thân 0.6 m vẫn trúng', () => {
  const r = shootAt(true, 0.6);
  assert.ok(r.hit && !r.hit.head);
});

const box = (minY, maxY) => ({ minX: -5, maxX: 5, minY, maxY, minZ: -5, maxZ: 5 });
const mkRoom = (boxes) => {
  const map = Object.create(GameMap.prototype);
  map.boxes = boxes; map.maxY = 10; map.bounds = 29;
  return { match: { phase: 'live' }, map };
};
const mkPlayer = () => ({
  alive: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, lastMoveAt: 1000, lastCorrect: 0, budget: 3.5, vUp: 1.5, vDown: 3,
  riseSince: 0, airUntil: 0, speed: 0, vx: 0, vy: 0, vz: 0, crouch: false, send() {},
});
t('Trần 1.5 m: đứng bị coi là kẹt tường, ngồi thì hợp lệ', () => {
  const room = mkRoom([box(1.5, 2.5)]);
  const p1 = mkPlayer();
  assert.strictEqual(applyPose(room, p1, { x: 0.1, y: 0, z: 0, yaw: 0, pitch: 0 }, 1100), false);
  const p2 = mkPlayer();
  assert.strictEqual(applyPose(room, p2, { x: 0.1, y: 0, z: 0, yaw: 0, pitch: 0, c: 1 }, 1100), true);
  assert.strictEqual(p2.crouch, true);
});
t('Gói move không có cờ c: coi như đứng', () => {
  const room = mkRoom([]);
  const p = mkPlayer(); p.crouch = true;
  applyPose(room, p, { x: 0.1, y: 0, z: 0, yaw: 0, pitch: 0 }, 1100);
  assert.strictEqual(p.crouch, false);
});
t('Hằng số ngồi thấp hơn đứng', () => {
  assert.ok(C.CROUCH_EYE_HEIGHT < C.EYE_HEIGHT && C.CROUCH_PLAYER_HEIGHT < C.PLAYER_HEIGHT && C.CROUCH_BODY_HEIGHT < C.BODY_HEIGHT);
});
console.log('\nCROUCH OK');

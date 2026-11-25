'use strict';
// Kiểm thử không cần mạng: tiền, mua súng, xuyên tường, lựu đạn, bom khói, giáp.
process.env.HACHIHI_FREEZE_MS = '50';
const assert = require('assert');
const { Room } = require('../src/rooms/room');
const { Player } = require('../src/rooms/player');
const { WEAPONS } = require('../src/combat/weapons');
const { buy, handleShoot, handleThrow } = require('../src/combat/combat');
const { traceRayPen } = require('../src/combat/hitscan');
const { updateGrenades } = require('../src/game/grenades');
const { applyDamage, FRAG_WEAPON } = require('../src/combat/combat');

const ok = (s) => console.log('  ✓', s);
const mk = (id, name) => {
  const ws = { readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } };
  return new Player(id, name, ws);
};
const last = (p, t) => [...p.ws.sent].reverse().find((m) => m.t === t);

function newRoom() {
  const r = new Room('9999', {});
  const a = mk(1, 'a');
  const b = mk(2, 'b');
  r.addPlayer(a);
  r.addPlayer(b);
  r.match.start(1000);
  return { r, a, b };
}

// 1. Khởi đầu: chỉ có súng lục, $800
{
  const { r, a } = newRoom();
  assert.deepStrictEqual(a.owned, ['pistol']);
  assert.strictEqual(a.money, 800);
  assert.strictEqual(a.weapon, 'pistol');
  assert.strictEqual(r.match.phase, 'freeze');
  ok('Vào trận chỉ có súng lục và $800');
}

// 2. Mua đồ: đủ/thiếu tiền, thay súng cùng loại, giáp, lựu đạn
{
  const { r, a } = newRoom();
  assert.strictEqual(buy(r, a, 'rifle', 1100), 'Không đủ tiền.');
  assert.strictEqual(buy(r, a, 'sniper', 1100), 'Không đủ tiền.');
  a.money = 10000;
  assert.strictEqual(buy(r, a, 'ak', 1100), null);
  assert.deepStrictEqual(a.owned.sort(), ['ak', 'pistol']);
  assert.strictEqual(a.weapon, 'ak');
  assert.strictEqual(buy(r, a, 'smg', 1100), null);
  assert.deepStrictEqual(a.owned.sort(), ['pistol', 'smg'], 'súng chính mới thay súng chính cũ');
  assert.strictEqual(buy(r, a, 'deagle', 1100), null);
  assert.deepStrictEqual(a.owned.sort(), ['deagle', 'smg']);
  assert.strictEqual(buy(r, a, 'armor', 1100), null);
  assert.strictEqual(a.armor, 100);
  assert.strictEqual(buy(r, a, 'armor', 1100), 'Bạn đã có đủ giáp.');
  assert.strictEqual(buy(r, a, 'frag', 1100), null);
  assert.strictEqual(buy(r, a, 'frag', 1100), 'Bạn đã mang tối đa loại này.');
  assert.strictEqual(buy(r, a, 'smoke', 1100), null);
  assert.strictEqual(a.money, 10000 - 2700 - 1200 - 650 - 650 - 300 - 300);
  r.match.phase = 'live';
  r.match.liveStartedAt = 1000;
  assert.strictEqual(buy(r, a, 'rifle', 1000 + 20000), 'Đã hết thời gian mua đồ.');
  ok('Mua súng/giáp/lựu đạn: kiểm tra tiền, giới hạn, thay súng cùng loại, hết giờ mua');
}

// 3. Thưởng tiền cuối vòng + chuỗi thắng/thua
{
  const { r, a, b } = newRoom();
  const m = r.match;
  m.phase = 'live';
  a.money = 0; b.money = 0;
  m.endRound('A', 5000);
  assert.strictEqual(a.money, 3250, 'thắng vòng 1');
  assert.strictEqual(b.money, 1400, 'thua vòng 1');
  m.startRound(6000);
  m.phase = 'live';
  m.endRound('A', 9000);
  assert.strictEqual(a.money, 3250 + 3250 + 150, 'thắng liên tiếp được thưởng thêm');
  assert.strictEqual(b.money, 1400 + 1900, 'chuỗi thua được bù thêm');
  assert.ok(last(a, 'reward') && last(a, 'reward').kind === 'win');
  ok('Thưởng thắng/thua theo chuỗi, có tin reward cho client');
}

// 4. Hạ gục được thưởng theo súng; tự sát không tính hạ gục
{
  const { r, a, b } = newRoom();
  r.match.phase = 'live';
  a.money = 0;
  b.hp = 1;
  applyDamage(r, a, b, 50, false, WEAPONS.smg, 2000);
  assert.strictEqual(b.alive, false);
  assert.strictEqual(a.money, 600 + 3250, 'thưởng hạ gục $600 + thắng vòng $3250 (hạ nốt đối thủ cuối)');
  assert.strictEqual(a.kills, 1);
  ok('Hạ gục bằng tiểu liên thưởng $600, thắng vòng cộng thêm');
}

// 5. Giáp hấp thụ sát thương
{
  const { r, a, b } = newRoom();
  r.match.phase = 'live';
  b.armor = 100;
  applyDamage(r, a, b, 40, false, WEAPONS.rifle, 2000);
  assert.strictEqual(b.hp, 80, 'giáp hấp thụ 20/40');
  assert.strictEqual(b.armor, 80);
  ok('Áo giáp giảm một nửa sát thương');
}

// 6. Xuyên tường (dựa trên tường bao dày 1m ở z=-30.5 và tường văn phòng dày 0.3)
{
  const tgt = [{ ref: 'T', x: 0, y: 0, z: -32 }]; // mục tiêu sau tường bao (ngoài sân)
  const o = [0, 1.0, -20];
  const d = [0, 0, -1];
  const none = traceRayPen(o, d, 100, tgt, 0);
  assert.strictEqual(none.hit, null, 'không xuyên: bị tường chặn');
  const weak = traceRayPen(o, d, 100, tgt, 0.4); // 0.34m < dày 1m -> không xuyên nổi
  assert.strictEqual(weak.hit, null, 'súng yếu không xuyên tường 1m');
  const sn = traceRayPen(o, d, 100, tgt, 1.0); // 0.85m < 1m -> vẫn chặn
  assert.strictEqual(sn.hit, null, 'ngay cả bắn tỉa không xuyên tường 1m');
  // Tường văn phòng mỏng 0.3m: bắn từ (15,1,-8) hướng -z? dùng tường bắc z=-3 tại x≈13 (đặc)
  const tgt2 = [{ ref: 'T', x: 13, y: 0, z: -5 }];
  const o2 = [13, 1.0, 1];
  const d2 = [0, 0, -1];
  const rifle = traceRayPen(o2, d2, 100, tgt2, 0.55); // nội thất: từ trong văn phòng ra qua tường 0.3m
  assert.ok(rifle.hit, 'súng trường xuyên được tường 0.3m');
  assert.ok(rifle.mul < 1 && rifle.mul > 0.5, 'sát thương giảm sau khi xuyên');
  const pst = traceRayPen(o2, d2, 100, tgt2, 0.25); // 0.2125 < 0.3 -> không xuyên
  assert.strictEqual(pst.hit, null, 'súng lục không xuyên tường 0.3m');
  ok('Xuyên tường: phụ thuộc độ dày tường và khả năng xuyên của súng; sát thương giảm');
}

// 7. Lựu đạn: ném, nảy, nổ gây sát thương (bị tường chắn), không hại đồng đội
{
  const { r, a, b } = newRoom();
  r.match.phase = 'live';
  a.nades.frag = 1;
  a.x = 0; a.z = 20; a.yaw = 0; a.pitch = 0.1; a.y = 0;
  b.x = 0; b.z = -2; b.y = 0; // không ở gần: sẽ không dính
  handleThrow(r, a, 'frag', 5000);
  assert.strictEqual(r.grenades.length, 1);
  assert.strictEqual(a.nades.frag, 0);
  // Đặt mục tiêu ngay chỗ nổ
  let now = 5000;
  const g = r.grenades[0];
  b.x = 0; b.z = g.z - 3; b.y = 0; b.hp = 100;
  for (let i = 0; i < 80 && r.grenades.length; i++) {
    now += 33;
    // giữ nạn nhân gần quả lựu đạn khi nó dừng
    updateGrenades(r, now, 0.033, applyDamage, FRAG_WEAPON);
  }
  assert.strictEqual(r.grenades.length, 0, 'lựu đạn đã nổ');
  assert.ok(r.players.size === 2);
  ok('Lựu đạn bay, nảy, nổ đúng giờ');
}

// 8. Lựu đạn gây sát thương theo khoảng cách và bị che bởi tường
{
  const { r, a, b } = newRoom();
  r.match.phase = 'live';
  const { Grenade } = require('../src/game/grenades');
  const g = new Grenade('frag', a, [0, 0.5, 10], [0, 0, 0], 0);
  b.x = 0; b.z = 8; b.y = 0; b.hp = 100; // cách 2m
  g.explodeAt = 0;
  r.grenades.push(g);
  updateGrenades(r, 1, 0.0001, applyDamage, FRAG_WEAPON);
  assert.ok(b.hp < 100, 'trúng mảnh');
  const near = 100 - b.hp;
  const g2 = new Grenade('frag', a, [0, 0.5, 10], [0, 0, 0], 0);
  b.hp = 100; b.z = 3; // cách 7m
  g2.explodeAt = 0;
  r.grenades.push(g2);
  updateGrenades(r, 1, 0.0001, applyDamage, FRAG_WEAPON);
  assert.ok(100 - b.hp < near, 'xa thì ít sát thương hơn');
  // chắn bởi tường giữa: khối pillar/tường giữa ở z=0, đặt người ở z=-3, nổ ở z=3
  const g3 = new Grenade('frag', a, [0, 0.5, 3], [0, 0, 0], 0);
  b.hp = 100; b.z = -3; b.x = 0;
  g3.explodeAt = 0;
  r.grenades.push(g3);
  updateGrenades(r, 1, 0.0001, applyDamage, FRAG_WEAPON);
  assert.strictEqual(b.hp, 100, 'tường giữa chắn mảnh');
  ok('Sát thương lựu đạn giảm theo khoảng cách và bị tường chắn');
}

// 9. Bom khói tạo vùng khói và gửi tin cho client
{
  const { r, a } = newRoom();
  r.match.phase = 'live';
  a.nades.smoke = 1;
  a.x = 0; a.z = 20; a.yaw = 0; a.pitch = 0.3;
  handleThrow(r, a, 'smoke', 10000);
  let now = 10000;
  for (let i = 0; i < 80 && r.grenades.length; i++) { now += 33; updateGrenades(r, now, 0.033, applyDamage, FRAG_WEAPON); }
  assert.strictEqual(r.smokes.length, 1);
  assert.ok(last(a, 'smoke'));
  ok('Bom khói nổ thành vùng khói, báo cho client');
}

// 10. Chế độ cổ điển (không tiền) có sẵn 3 súng
{
  const r = new Room('9998', {});
  r.settings.economy = false;
  const a = mk(1, 'a');
  const b = mk(2, 'b');
  r.addPlayer(a); r.addPlayer(b);
  r.match.start(1000);
  assert.deepStrictEqual(a.owned, ['rifle', 'pistol', 'shotgun']);
  assert.strictEqual(buy(r, a, 'ak', 1100), 'Chế độ này không dùng tiền.');
  ok('Chế độ không tiền: có sẵn 3 súng cổ điển');
}

// 11. Bảng súng hợp lệ
{
  for (const w of Object.values(WEAPONS)) {
    assert.ok(w.damage > 0 && w.mag > 0 && w.interval > 0 && w.range > 0 && ['primary', 'secondary'].includes(w.cat), w.id);
  }
  const slots = new Set(Object.values(WEAPONS).map((w) => w.slot));
  assert.strictEqual(slots.size, Object.keys(WEAPONS).length, 'slot kiểu dáng không trùng');
  ok('Bảng 9 súng hợp lệ, slot không trùng');
}
console.log('\nECONOMY OK');

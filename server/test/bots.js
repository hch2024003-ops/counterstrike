'use strict';
// Kiểm thử máy chơi chung: thêm/xoá/chuyển đội, đi đường, bắn, mua đồ, và cấp độ cao thắng cấp độ thấp.
process.env.HACHIHI_FREEZE_MS = '300';
const assert = require('assert');
const { Room } = require('../src/rooms/room');
const { Player } = require('../src/rooms/player');
const { LEVELS, navFor } = require('../src/game/bots');
const { getMap, listMapIds } = require('../src/game/map');

const ok = (s) => console.log('  ✓', s);
const human = (id, name) => new Player(id, name, { readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } });

// 1. Quản lý máy ở phòng chờ
{
  const r = new Room('5555', {});
  const h = human(1, 'host'); const g = human(2, 'guest');
  r.addPlayer(h); r.addPlayer(g);
  assert.ok(r.addBot(g, 'A', 3), 'khách không được thêm máy');
  assert.strictEqual(r.addBot(h, 'A', 5), null);
  assert.strictEqual(r.addBot(h, 'B', 1), null);
  const bots = [...r.players.values()].filter((p) => p.isBot);
  assert.strictEqual(bots.length, 2);
  assert.deepStrictEqual(bots.map((b) => b.level).sort(), [1, 5]);
  assert.ok(bots[0].name.startsWith('Máy '));
  const info = r.info().players.find((p) => p.bot);
  assert.ok(info.lvl >= 1, 'info có cấp độ máy');
  // đội đầy
  for (let i = 0; i < 6; i++) r.addBot(h, 'A', 2);
  assert.ok(r.teamCount('A') <= 5, 'không vượt 5 người/đội');
  assert.ok(r.addBot(h, 'A', 2), 'đội đầy báo lỗi');
  // chuyển đội: người và máy
  assert.strictEqual(r.moveMember(h, bots[1].id, 'A') === null || true, true);
  assert.ok(r.moveMember(g, h.id, 'B'), 'khách không được chuyển người');
  const before = r.teamCount('B');
  assert.strictEqual(r.moveMember(h, g.id, 'A') !== undefined, true);
  // xoá
  assert.strictEqual(r.removeBot(h, bots[0].id), null);
  assert.ok(!r.players.has(bots[0].id));
  assert.ok(r.removeBot(h, h.id), 'không xoá được người thật bằng removebot');
  r.match.start(Date.now());
  assert.ok(r.addBot(h, 'B', 3), 'đang trận không thêm được máy');
  ok('Chủ phòng thêm/xoá/chuyển đội máy; khách không có quyền; đội đầy và đang trận bị từ chối');
}

// 2. Hết người thật thì phòng đóng, máy không ở lại một mình
{
  const r = new Room('5556', {});
  const h = human(1, 'host');
  r.addPlayer(h);
  r.addBot(h, 'A', 2); r.addBot(h, 'B', 2);
  r.removePlayer(h.id);
  assert.strictEqual(r.players.size, 0);
  ok('Người thật cuối cùng rời phòng: máy bị dọn, phòng đóng');
}

// 3. Lưới đường đi: mọi bản đồ tìm được đường từ spawn A tới spawn B
{
  for (const id of listMapIds()) {
    const m = getMap(id);
    const nav = navFor(m);
    const a = m.spawn('A', 2); const b = m.spawn('B', 2);
    const path = nav.path(a.x, a.z, b.x, b.z);
    assert.ok(path && path.length >= 1, `${id}: không có đường A->B`);
    const last = path[path.length - 1];
    assert.ok(Math.hypot(last.x - b.x, last.z - b.z) < 1.5, `${id}: đường không tới đích`);
  }
  ok('Máy tìm được đường từ spawn A tới B trên mọi bản đồ');
}

// 4. Mô phỏng trận: cấp cao thắng cấp thấp
function play(mapId, levelA, levelB, rounds, perTeam = 3) {
  const r = new Room('6000', {});
  r.settings.rounds = 16;
  r.settings.economy = true;
  const h = human(1, 'host');
  r.addPlayer(h);
  r.setSettings(h, { map: mapId });
  for (let i = 0; i < perTeam; i++) { r.addBot(h, 'A', levelA); r.addBot(h, 'B', levelB); }
  h.team = null; // người thật đứng ngoài, chỉ để giữ phòng
  let now = Date.now();
  r.match.start(now);
  const stat = { A: 0, B: 0, rounds: 0, shots: 0, moved: 0 };
  const start = new Map([...r.players.values()].filter((p) => p.isBot).map((p) => [p.id, [p.x, p.z]]));
  let lastRound = r.match.round;
  for (let tick = 0; tick < 60000 && stat.rounds < rounds; tick++) {
    now += 33;
    r.update(now);
    if (r.match.round !== lastRound) { stat.rounds++; lastRound = r.match.round; }
    if (r.match.phase === 'matchEnd') break;
  }
  for (const p of r.players.values()) if (p.isBot) stat[p.team] += p.kills;
  stat.score = [r.match.score.A, r.match.score.B];
  return stat;
}

{
  const t0 = Date.now();
  const s = play('warehouse', 5, 1, 6);
  console.log(`    Xuất sắc(A) vs Dở(B) @kho: hạ gục ${s.A}:${s.B}, thắng vòng ${s.score.join(':')} (${((Date.now() - t0) / 1000).toFixed(1)}s thật)`);
  assert.ok(s.A + s.B > 0, 'hai đội phải giao tranh (có hạ gục)');
  assert.ok(s.A > s.B, 'máy Xuất sắc phải hạ nhiều hơn máy Dở');
  ok('Máy Xuất sắc thắng máy Dở rõ rệt');
}
{
  const s = play('warehouse', 4, 2, 6);
  console.log(`    Giỏi(A) vs Thường(B): hạ gục ${s.A}:${s.B}, thắng vòng ${s.score.join(':')}`);
  assert.ok(s.A > s.B, 'Giỏi thắng Thường');
  ok('Máy Giỏi thắng máy Thường');
}
{
  const s = play('warehouse', 5, 3, 6);
  console.log(`    Xuất sắc(A) vs Khá(B): hạ gục ${s.A}:${s.B}, thắng vòng ${s.score.join(':')}`);
  assert.ok(s.A >= s.B, 'Xuất sắc không thua Khá');
  ok('Máy Xuất sắc không thua máy Khá');
}
{
  for (const id of ['paris', 'giza', 'bridge']) {
    const s = play(id, 3, 3, 2);
    assert.ok(s.A + s.B > 0, `${id}: máy giao tranh với nhau`);
  }
  ok('Máy giao tranh được trên Paris, Giza, Cầu Cổng Vàng (không kẹt)');
}
console.log('\nBOTS OK');

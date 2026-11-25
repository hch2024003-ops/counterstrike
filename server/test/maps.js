'use strict';
// Kiểm thử bản đồ: mọi bản đồ nạp được, spawn không kẹt trong tường, tia bắn/va chạm hoạt động, người chơi vào phòng chọn được bản đồ.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getMap, listMaps, listMapIds } = require('../src/game/map');
const { Room } = require('../src/rooms/room');
const { Player } = require('../src/rooms/player');

const ok = (s) => console.log('  ✓', s);
const mk = (id, name) => new Player(id, name, { readyState: 1, send() {} });

{
  const ids = listMapIds();
  assert.ok(ids.length >= 7, 'cần ít nhất 7 bản đồ, có ' + ids.length);
  for (const id of ids) {
    const m = getMap(id);
    assert.strictEqual(m.id, id);
    for (const team of ['A', 'B']) {
      for (let i = 0; i < 5; i++) {
        const s = m.spawn(team, i);
        assert.ok(!m.insideWall(s.x, s.y, s.z), `${id}: spawn ${team}${i} kẹt trong tường`);
        assert.ok(Math.abs(s.x) < m.bounds && Math.abs(s.z) < m.bounds, `${id}: spawn ngoài biên`);
      }
    }
    // Tia từ tâm ra ngoài phải bị tường bao chặn trước khi ra khỏi bản đồ
    const t = m.rayBoxes([0, 1.6, 0], [1, 0, 0], 500);
    assert.ok(t < m.size / 2 + 2, `${id}: không có tường bao`);
  }
  ok(`${ids.length} bản đồ nạp được, spawn hợp lệ, có tường bao: ${ids.join(', ')}`);
}

{
  const list = listMaps();
  const sizes = list.map((m) => m.size);
  assert.ok(Math.min(...sizes) <= 44 && Math.max(...sizes) >= 90, 'cần có bản đồ nhỏ (≤44) và rất lớn (≥90)');
  for (const m of list) assert.ok(m.name && m.desc, m.id + ' thiếu tên/mô tả');
  ok(`Kích thước từ ${Math.min(...sizes)}m đến ${Math.max(...sizes)}m, mỗi bản đồ có tên và mô tả`);
}

{
  // Client và server dùng cùng dữ liệu bản đồ
  const cdir = path.join(__dirname, '..', '..', 'client', 'assets', 'maps');
  if (fs.existsSync(cdir)) {
    for (const id of listMapIds()) {
      const a = fs.readFileSync(path.join(__dirname, '..', 'src', 'maps', id + '.json'), 'utf8');
      const b = fs.readFileSync(path.join(cdir, id + '.json'), 'utf8');
      assert.strictEqual(a, b, `${id}: client/assets/maps khác server/src/maps`);
    }
    ok('Dữ liệu bản đồ client và server giống hệt nhau');
  }
}

{
  const r = new Room('7777', {});
  const a = mk(1, 'a'); const b = mk(2, 'b');
  r.addPlayer(a); r.addPlayer(b);
  assert.strictEqual(r.map.id, 'warehouse');
  assert.strictEqual(r.setSettings(b, { map: 'giza' }), 'Chỉ chủ phòng mới đổi được tuỳ chọn.');
  assert.strictEqual(r.setSettings(a, { map: 'giza' }), null);
  assert.strictEqual(r.map.id, 'giza');
  assert.strictEqual(r.settings.map, 'giza');
  r.setSettings(a, { map: '../../etc/passwd' });
  assert.strictEqual(r.map.id, 'warehouse', 'id lạ rơi về bản đồ mặc định');
  r.setSettings(a, { map: 'bridge' });
  r.match.start(1000);
  const s = r.map.spawn('A', 0);
  assert.strictEqual(a.z === s.z || b.z === s.z, true, 'người chơi xuất hiện đúng điểm spawn của bản đồ đang chọn');
  assert.strictEqual(r.setSettings(a, { map: 'giza' }), 'Chỉ đổi được ở phòng chờ.');
  ok('Chủ phòng chọn bản đồ ở phòng chờ; id lạ bị từ chối; đang trận không đổi được');
}

{
  // Độ cao hợp lệ phụ thuộc bản đồ (tường thành cao 5m, tháp cao hơn)
  assert.ok(getMap('greatwall').maxY > 6);
  assert.ok(getMap('warehouse').maxY >= 4);
  ok('Giới hạn độ cao theo từng bản đồ');
}
console.log('\nMAPS OK');

'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../config');

// Mỗi bản đồ là một file JSON trong server/src/maps (id = tên file). Mỗi phòng có bản đồ riêng (room.map).
// Dữ liệu va chạm là các hộp AABB; tường bao cũng là hộp nên người chơi không ra khỏi bản đồ.
const DEFAULT_ID = 'warehouse';

class GameMap {
  constructor(data) {
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.size = data.size;
    this.maxY = 4;
    this.bounds = data.size / 2 - 0.4; // giới hạn vị trí hợp lệ (tường bao ở ngoài cùng)
    this.boxes = data.boxes.map((b) => ({
      minX: b.p[0] - b.s[0] / 2,
      maxX: b.p[0] + b.s[0] / 2,
      minY: b.p[1] - b.s[1] / 2,
      maxY: b.p[1] + b.s[1] / 2,
      minZ: b.p[2] - b.s[2] / 2,
      maxZ: b.p[2] + b.s[2] / 2,
    }));
    for (const b of this.boxes) this.maxY = Math.max(this.maxY, Math.min(40, b.maxY + 1.5)); // độ cao tối đa hợp lệ: đỉnh khối cao nhất + 1.5m
  }

  // Người chơi (hình trụ) có nằm trong tường không? Dùng bán kính nhỏ hơn client một chút để tránh báo nhầm.
  insideWall(x, y, z, crouch = false) {
    const r = C.PLAYER_RADIUS - 0.08;
    const h = crouch ? C.CROUCH_PLAYER_HEIGHT : C.PLAYER_HEIGHT;
    for (const b of this.boxes) {
      if (
        x + r > b.minX && x - r < b.maxX &&
        z + r > b.minZ && z - r < b.maxZ &&
        y + 0.1 < b.maxY && y + h > b.minY
      ) return true;
    }
    return false;
  }

  // Người chơi có đang đứng trên một mặt đỡ (sàn hoặc đỉnh khối) không?
  supported(x, y, z) {
    if (y < 0.06) return true;
    const r = C.PLAYER_RADIUS - 0.08;
    for (const b of this.boxes) {
      if (
        Math.abs(b.maxY - y) < 0.06 &&
        x + r > b.minX && x - r < b.maxX &&
        z + r > b.minZ && z - r < b.maxZ
      ) return true;
    }
    return false;
  }

  // Khoảng giao của tia với từng hộp (slab test). Trả về t gần nhất hoặc Infinity.
  rayBoxes(o, d, maxT) {
    let nearest = Infinity;
    for (const b of this.boxes) {
      const seg = slab(b, o, d, maxT);
      if (seg && seg.t0 < nearest) nearest = seg.t0;
    }
    return nearest;
  }

  // Mọi đoạn tia xuyên qua hộp: [{ t0, t1 }] sắp theo t0 (dùng cho xuyên tường: độ dày = t1 - t0).
  rayBoxesAll(o, d, maxT) {
    const out = [];
    for (const b of this.boxes) {
      const seg = slab(b, o, d, maxT);
      if (seg && seg.t1 > seg.t0) out.push(seg);
    }
    out.sort((a, b) => a.t0 - b.t0);
    return out;
  }

  // Quả cầu bán kính r tại (x,y,z) có chạm hộp nào không? (cho lựu đạn)
  pointHitsBox(x, y, z, r) {
    for (const b of this.boxes) {
      if (x + r > b.minX && x - r < b.maxX && y + r > b.minY && y - r < b.maxY && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  // Khoảng cách tới mặt sàn (y = 0) theo hướng tia.
  rayFloor(o, d) {
    if (d[1] >= -1e-9) return Infinity;
    return -o[1] / d[1];
  }

  spawn(team, index) {
    const s = this.data.spawns[team];
    const p = s.points[index % s.points.length];
    return { x: p[0], y: 0, z: p[1], yaw: s.yaw };
  }
}

function slab(b, o, d, maxT) {
  let tmin = 0;
  let tmax = maxT;
  const mins = [b.minX, b.minY, b.minZ];
  const maxs = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return null;
    } else {
      let t1 = (mins[i] - o[i]) / d[i];
      let t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return { t0: tmin, t1: tmax };
}

// ---------------------------------------------------------------- nạp bản đồ
const dir = path.join(__dirname, '..', 'maps');
const cache = new Map();

function listMapIds() {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

function getMap(id) {
  const key = typeof id === 'string' && /^[a-z0-9_-]+$/.test(id) && fs.existsSync(path.join(dir, id + '.json')) ? id : DEFAULT_ID;
  if (!cache.has(key)) cache.set(key, new GameMap(JSON.parse(fs.readFileSync(path.join(dir, key + '.json'), 'utf8'))));
  return cache.get(key);
}

// Danh sách cho phòng chờ (không kèm dữ liệu hộp).
function listMaps() {
  return listMapIds().map((id) => {
    const m = getMap(id);
    return { id, name: m.data.name, size: m.size, desc: m.data.desc || '', tag: m.data.tag || '' };
  });
}

// Tương thích với mã cũ/kiểm thử: các hàm gắn với bản đồ mặc định.
const def = getMap(DEFAULT_ID);
module.exports = {
  GameMap, getMap, listMaps, listMapIds, DEFAULT_ID,
  boxes: def.boxes,
  insideWall: (...a) => def.insideWall(...a),
  supported: (...a) => def.supported(...a),
  rayBoxes: (...a) => def.rayBoxes(...a),
  rayBoxesAll: (...a) => def.rayBoxesAll(...a),
  pointHitsBox: (...a) => def.pointHitsBox(...a),
  rayFloor: (...a) => def.rayFloor(...a),
  spawn: (...a) => def.spawn(...a),
  data: def.data,
};

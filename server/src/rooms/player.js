'use strict';
const crypto = require('crypto');
const C = require('../config');
const { freshAmmo } = require('../combat/weapons');

class Player {
  constructor(id, name, ws) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.token = crypto.randomBytes(12).toString('hex');
    this.connected = true;
    this.disconnectedAt = 0;
    this.isBot = false; // máy chơi chung (do chủ phòng thêm)
    this.level = 0; // cấp độ của máy (1..5)
    this.ai = null;

    this.team = null; // 'A' | 'B'
    this.kills = 0;
    this.deaths = 0;

    this.alive = false;
    this.inRound = false;
    this.hp = C.MAX_HP;
    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0; this.pitch = 0;
    this.speed = 0;
    this.vx = 0; this.vy = 0; this.vz = 0; // vận tốc ước lượng từ các gói vị trí (cho ném lựu đạn khi chạy/nhảy)
    this.scoped = false; // đang nhìn qua ống ngắm
    this.crouch = false; // đang ngồi (client báo trong gói move, server kiểm tra chỗ trống qua insideWall)

    this.weapon = 'pistol';
    this.ammo = freshAmmo();
    this.money = C.START_MONEY;
    this.owned = ['pistol']; // súng đang sở hữu
    this.armor = 0;
    this.nades = { frag: 0, smoke: 0 };
    this.reloadEnd = 0;
    this.nextShot = 0;
    this.spray = 0; // số phát bắn liên tiếp (làm tăng tản đạn)
    this.lastShotAt = 0;

    this.budget = 3.5; // ngân sách di chuyển ngang (chống teleport/speedhack)
    this.vUp = C.RISE_CAP; // ngân sách leo/nhảy
    this.vDown = C.FALL_CAP; // ngân sách rơi
    this.riseSince = 0; // tổng độ cao đã leo kể từ lần cuối đứng trên mặt đỡ
    this.airUntil = 0; // đang trên không tới thời điểm này (để tính tản đạn)
    this.lastMoveAt = 0;
    this.lastCorrect = 0;

    this.rtt = 80; // ms, do SERVER đo (không tin số liệu từ client)
    this.lastPingAt = 0;

    this.history = []; // lịch sử vị trí để bù trễ: [{ t, x, y, z }]
  }

  // keep = giữ lại đồ từ vòng trước (còn sống); classic = chế độ không tiền (có sẵn 3 súng cũ).
  spawn(s, now, keep = false, classic = false) {
    this.alive = true;
    this.inRound = true;
    this.hp = C.MAX_HP;
    this.x = s.x; this.y = s.y; this.z = s.z;
    this.yaw = s.yaw; this.pitch = 0;
    this.speed = 0;
    if (classic) {
      this.owned = ['rifle', 'pistol', 'shotgun'];
      this.armor = 0;
      this.nades = { frag: 0, smoke: 0 };
    } else if (!keep) {
      this.owned = ['pistol'];
      this.armor = 0;
      this.nades = { frag: 0, smoke: 0 };
    }
    this.weapon = this.bestWeapon();
    this.ammo = freshAmmo();
    this.reloadEnd = 0;
    this.nextShot = now + 300;
    this.spray = 0;
    this.lastShotAt = 0;
    this.budget = 3.5;
    this.vUp = C.RISE_CAP;
    this.vDown = C.FALL_CAP;
    this.riseSince = 0;
    this.airUntil = 0;
    this.lastMoveAt = now;
    this.history.length = 0; // dịch chuyển về điểm xuất phát: xoá lịch sử cũ
    this.pushHistory(now);
  }

  addMoney(n) {
    this.money = Math.max(0, Math.min(C.MAX_MONEY, this.money + n));
  }

  // Súng mạnh nhất đang có để cầm ngay khi vào vòng: súng chính trước, rồi súng phụ.
  bestWeapon() {
    const { WEAPONS } = require('../combat/weapons');
    const prim = this.owned.find((id) => WEAPONS[id] && WEAPONS[id].cat === 'primary');
    return prim || this.owned.find((id) => WEAPONS[id]) || 'pistol';
  }

  pushHistory(now) {
    const h = this.history;
    h.push({ t: now, x: this.x, y: this.y, z: this.z });
    while (h.length > 2 && now - h[0].t > C.HISTORY_MS) h.shift();
  }

  // Vị trí của người chơi tại thời điểm t (mili giây, cùng hệ với Date.now()).
  posAt(t) {
    const h = this.history;
    const n = h.length;
    if (n === 0) return { x: this.x, y: this.y, z: this.z };
    if (t >= h[n - 1].t) return { x: this.x, y: this.y, z: this.z }; // mới hơn bản ghi cuối: dùng vị trí hiện tại
    if (t <= h[0].t) return h[0];
    for (let i = n - 1; i > 0; i--) {
      const a = h[i - 1];
      const b = h[i];
      if (t >= a.t) {
        const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
      }
    }
    return h[0];
  }

  attach(ws) {
    this.ws = ws;
    this.connected = true;
    this.disconnectedAt = 0;
  }

  send(obj) {
    this.sendRaw(JSON.stringify(obj));
  }

  sendRaw(str) {
    const ws = this.ws;
    if (!this.connected || !ws || ws.readyState !== 1) return;
    if (ws.bufferedAmount > 1e6) return; // client quá chậm, bỏ gói thay vì dồn bộ nhớ
    try { ws.send(str); } catch { /* bỏ qua */ }
  }
}

module.exports = { Player };

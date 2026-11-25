'use strict';
const C = require('../config');
const { Match } = require('../game/match');
const { WEAPONS } = require('../combat/weapons');
const { finishReload, applyDamage, FRAG_WEAPON } = require('../combat/combat');
const { updateGrenades } = require('../game/grenades');
const { getMap } = require('../game/map');
const { Player } = require('./player');
const { BotAI, updateBots, LEVEL_NAMES, FAKE_WS, navFor } = require('../game/bots');

let botSeq = 0;

const r2 = (v) => Math.round(v * 100) / 100;

class Room {
  constructor(pin, manager) {
    this.pin = pin;
    this.manager = manager;
    this.players = new Map();
    this.hostId = 0;
    // Tuỳ chọn phòng (chủ phòng đổi ở phòng chờ): economy = chơi có tiền/mua súng; rounds = số vòng thắng.
    this.settings = { economy: process.env.HACHIHI_ECONOMY !== '0', rounds: C.ROUNDS_TO_WIN, map: 'warehouse' };
    this.map = getMap(this.settings.map);
    this.grenades = [];
    this.smokes = [];
    this.match = new Match(this);
  }

  teamCount(team) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  findByToken(token) {
    if (typeof token !== 'string') return null;
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  nameTaken(name) {
    const low = name.toLowerCase();
    for (const p of this.players.values()) if (p.name.toLowerCase() === low) return true;
    return false;
  }

  // Tự chia đội cho cân bằng. Trả về false nếu phòng đã đầy.
  addPlayer(p) {
    if (this.players.size >= C.MAX_PER_TEAM * 2) return false;
    const team = this.teamCount('A') <= this.teamCount('B') ? 'A' : 'B';
    if (this.teamCount(team) >= C.MAX_PER_TEAM) return false;
    p.team = team;
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    return true;
  }

  switchTeam(p, team) {
    if (this.match.phase !== 'lobby') return false;
    if (team !== 'A' && team !== 'B') return false;
    if (p.team === team) return true;
    if (this.teamCount(team) >= C.MAX_PER_TEAM) return false;
    p.team = team;
    this.sendInfo();
    return true;
  }

  removePlayer(id, now = Date.now()) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    p.alive = false;
    p.connected = false;

    // Hết người thật: máy không ở lại một mình, phòng đóng.
    if (![...this.players.values()].some((x) => !x.isBot)) {
      this.players.clear();
      return;
    }
    if (this.hostId === id) {
      const list = [...this.players.values()].filter((x) => !x.isBot);
      const next = list.find((x) => x.connected) || list[0];
      this.hostId = next ? next.id : 0;
    }
    if (this.players.size === 0) return;

    // Luật phòng 0.7: KHÔNG tự huỷ trận hay đuổi người còn lại. Người cuối cùng tự quyết định rời phòng.
    // Khi chỉ còn một bên (hoặc một người), trận chuyển sang chế độ "một mình": không tính điểm, không kết thúc trận.
    this.sendInfo();
    this.notifyAlone();
    this.match.checkElimination(now);
  }

  // ---------- Máy chơi chung (bot): chỉ chủ phòng, chỉ ở phòng chờ ----------
  botGuard(p) {
    if (p.id !== this.hostId) return 'Chỉ chủ phòng mới quản lý được máy.';
    if (this.match.phase !== 'lobby') return 'Chỉ chỉnh được ở phòng chờ.';
    return null;
  }

  addBot(p, team, level) {
    const e = this.botGuard(p);
    if (e) return e;
    if (team !== 'A' && team !== 'B') return 'Đội không hợp lệ.';
    if (this.teamCount(team) >= C.MAX_PER_TEAM) return 'Đội đã đủ người.';
    const lv = Number.isInteger(level) && level >= 1 && level <= 5 ? level : 2;
    let name;
    do name = `Máy ${LEVEL_NAMES[lv]} ${++botSeq}`; while (this.nameTaken(name));
    const bot = new Player(1000000 + botSeq, name, FAKE_WS());
    bot.isBot = true;
    bot.level = lv;
    bot.team = team;
    bot.ai = new BotAI(bot, lv);
    navFor(this.map); // dựng lưới đường đi ngay ở phòng chờ, tránh khựng server khi trận bắt đầu
    this.players.set(bot.id, bot);
    this.sendInfo();
    return null;
  }

  removeBot(p, id) {
    const e = this.botGuard(p);
    if (e) return e;
    const b = this.players.get(id);
    if (!b || !b.isBot) return 'Không tìm thấy máy này.';
    this.players.delete(id);
    this.sendInfo();
    return null;
  }

  // Chủ phòng chuyển người hoặc máy sang đội khác.
  moveMember(p, id, team) {
    const e = this.botGuard(p);
    if (e) return e;
    const m = this.players.get(id);
    if (!m) return 'Không tìm thấy người chơi.';
    if (team !== 'A' && team !== 'B') return 'Đội không hợp lệ.';
    if (m.team === team) return null;
    if (this.teamCount(team) >= C.MAX_PER_TEAM) return 'Đội đã đủ người.';
    m.team = team;
    this.sendInfo();
    return null;
  }

  // Số người đang kết nối còn lại trong phòng.
  connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  // Một đội (hoặc cả phòng) chỉ còn một bên: báo cho người còn lại biết để họ tự chọn rời phòng.
  notifyAlone() {
    const a = this.teamCount('A');
    const b = this.teamCount('B');
    if (this.players.size === 0 || (a > 0 && b > 0)) return;
    const solo = this.players.size === 1;
    this.broadcast({
      t: 'notice',
      code: solo ? 'last_player' : 'one_side',
      msg: solo
        ? 'Bạn là người cuối cùng trong phòng. Phòng sẽ giữ nguyên cho tới khi bạn chọn "Rời phòng".'
        : 'Đối thủ đã rời phòng. Trận không tính điểm nữa; hãy bấm "Rời phòng" khi bạn muốn thoát.',
    });
  }

  // Chủ phòng đổi tuỳ chọn ở phòng chờ. Trả về chuỗi lỗi hoặc null.
  setSettings(p, m) {
    if (p.id !== this.hostId) return 'Chỉ chủ phòng mới đổi được tuỳ chọn.';
    if (this.match.phase !== 'lobby') return 'Chỉ đổi được ở phòng chờ.';
    if (typeof m.economy === 'boolean') this.settings.economy = m.economy;
    if (Number.isInteger(m.rounds) && m.rounds >= 3 && m.rounds <= 16) this.settings.rounds = m.rounds;
    if (typeof m.map === 'string' && m.map !== this.settings.map) {
      this.map = getMap(m.map);
      this.settings.map = this.map.id; // id không hợp lệ rơi về bản đồ mặc định
    }
    this.sendInfo();
    return null;
  }

  // ---------- Gửi dữ liệu ----------
  broadcast(obj) {
    const str = JSON.stringify(obj);
    for (const p of this.players.values()) p.sendRaw(str);
  }

  info() {
    const m = this.match;
    return {
      t: 'room',
      pin: this.pin,
      host: this.hostId,
      phase: m.phase,
      round: m.round,
      scoreA: m.score.A,
      scoreB: m.score.B,
      settings: this.settings,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths,
        on: p.connected ? 1 : 0, alive: p.alive ? 1 : 0, bot: p.isBot ? 1 : 0, lvl: p.level,
      })),
    };
  }

  sendInfo() {
    this.broadcast(this.info());
  }

  roundMsg(now) {
    const m = this.match;
    return {
      t: 'round',
      phase: m.phase,
      round: m.round,
      scoreA: m.score.A,
      scoreB: m.score.B,
      msLeft: Math.max(0, m.phaseEnd - now),
      winner: m.lastWinner,
      matchWinner: m.matchWinner,
      toWin: this.settings.rounds,
    };
  }

  broadcastRound(now = Date.now()) {
    this.broadcast(this.roundMsg(now));
  }

  sendSelf(p) {
    const ammo = {};
    for (const id of Object.keys(WEAPONS)) ammo[id] = [p.ammo[id].mag, p.ammo[id].reserve];
    p.send({
      t: 'self', hp: p.hp, alive: p.alive ? 1 : 0, weapon: p.weapon, reloading: p.reloadEnd ? 1 : 0, ammo,
      money: p.money, armor: p.armor, owned: p.owned, nades: [p.nades.frag, p.nades.smoke],
    });
  }

  // Snapshot có timestamp của server (ts) để client nội suy chuyển động đối thủ cho mượt.
  broadcastSnapshot(now) {
    const list = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      list.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), p.hp, WEAPONS[p.weapon].slot, p.crouch ? 1 : 0]);
    }
    const msg = { t: 'snap', ts: now, p: list };
    if (this.grenades.length) msg.g = this.grenades.map((g) => [g.id, g.kind === 'smoke' ? 1 : 0, r2(g.x), r2(g.y), r2(g.z)]);
    this.broadcast(msg);
  }

  update(now) {
    for (const p of this.players.values()) {
      if (p.reloadEnd && now >= p.reloadEnd) finishReload(this, p);
      if (!p.connected && now - p.disconnectedAt > C.RECONNECT_GRACE_MS) this.removePlayer(p.id, now);
      else if (p.connected && !p.isBot && now - p.lastPingAt >= C.PING_EVERY_MS) {
        p.lastPingAt = now;
        p.send({ t: 'sp', ts: now }); // client trả lại ngay, server đo RTT thật
      }
    }
    updateBots(this, now);
    this.match.update(now);
    if (this.match.phase === 'live') updateGrenades(this, now, C.TICK_MS / 1000, applyDamage, FRAG_WEAPON);
    for (const p of this.players.values()) if (p.alive) p.pushHistory(now);
    if (this.match.phase !== 'lobby') this.broadcastSnapshot(now);
  }
}

module.exports = { Room };

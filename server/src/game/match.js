'use strict';
const C = require('../config');

// Luật trận: đóng băng đầu vòng -> đang đánh -> kết thúc vòng -> ... -> kết thúc trận -> về phòng chờ.
class Match {
  constructor(room) {
    this.room = room;
    this.reset();
  }

  reset() {
    this.phase = 'lobby'; // lobby | freeze | live | roundEnd | matchEnd
    this.round = 0;
    this.score = { A: 0, B: 0 };
    this.phaseEnd = 0;
    this.participants = { A: 0, B: 0 };
    this.twoSided = false;
    this.lastWinner = null;
    this.matchWinner = null;
    this.winStreak = { A: 0, B: 0 };
    this.lossStreak = { A: 0, B: 0 };
    this.liveStartedAt = 0;
  }

  get running() {
    return this.phase !== 'lobby';
  }

  // Một trong hai đội không còn người nào trong phòng (người rời hẳn hoặc chế độ thử một mình).
  oneSided() {
    return this.room.teamCount('A') === 0 || this.room.teamCount('B') === 0;
  }

  aliveCount(team) {
    let n = 0;
    for (const p of this.room.players.values()) if (p.team === team && p.alive) n++;
    return n;
  }

  start(now) {
    if (this.phase !== 'lobby') return false;
    const room = this.room;
    this.reset();
    this.twoSided = room.teamCount('A') > 0 && room.teamCount('B') > 0;
    for (const p of room.players.values()) {
      p.kills = 0; p.deaths = 0;
      p.money = C.START_MONEY;
      p.alive = false; // vòng 1: ai cũng vào với đồ khởi điểm
    }
    this.startRound(now);
    return true;
  }

  startRound(now) {
    const room = this.room;
    this.round++;
    this.phase = 'freeze';
    this.phaseEnd = now + C.FREEZE_MS;
    this.lastWinner = null;
    room.grenades = [];
    room.smokes = [];
    this.participants = { A: 0, B: 0 };
    const idx = { A: 0, B: 0 };

    for (const p of room.players.values()) {
      if (!p.team) continue;
      if (!p.connected) {
        p.alive = false;
        p.inRound = false;
        continue;
      }
      const s = room.map.spawn(p.team, idx[p.team]++);
      const keep = this.round > 1 && p.alive; // còn sống cuối vòng trước: giữ súng/giáp/lựu đạn
      p.spawn(s, now, keep, !room.settings.economy);
      if (p.ai) p.ai.reset();
      this.participants[p.team]++;
      p.send({ t: 'spawn', x: s.x, y: s.y, z: s.z, yaw: s.yaw });
      room.sendSelf(p);
    }
    room.broadcastRound(now);
    room.sendInfo();
  }

  endRound(winner, now) {
    this.lastWinner = winner;
    if (winner) this.score[winner]++;
    this.payRound(winner);
    if (winner && this.score[winner] >= this.room.settings.rounds) {
      this.phase = 'matchEnd';
      this.matchWinner = winner;
      this.phaseEnd = now + C.MATCH_END_MS;
    } else {
      this.phase = 'roundEnd';
      this.phaseEnd = now + C.ROUND_END_MS;
    }
    this.room.broadcastRound(now);
    this.room.sendInfo();
  }

  // Thưởng tiền cuối vòng: thắng được nhiều hơn (cộng thêm khi thắng liên tiếp), thua nhận tiền bù tăng dần theo chuỗi thua.
  payRound(winner) {
    const room = this.room;
    if (!room.settings.economy || this.oneSided()) return;
    const other = (t) => (t === 'A' ? 'B' : 'A');
    if (winner) {
      this.winStreak[winner]++;
      this.lossStreak[winner] = 0;
      this.winStreak[other(winner)] = 0;
      this.lossStreak[other(winner)] = Math.min(this.lossStreak[other(winner)] + 1, C.LOSS_MAX_STREAK);
    }
    for (const p of room.players.values()) {
      if (!p.team || !p.connected) continue;
      let amount;
      let kind;
      if (winner === p.team) {
        const bonusRounds = Math.min(this.winStreak[p.team] - 1, C.WIN_STREAK_MAX);
        amount = C.WIN_BONUS + C.WIN_STREAK_STEP * bonusRounds;
        kind = 'win';
      } else {
        const ls = winner ? this.lossStreak[p.team] : 1;
        amount = C.LOSS_BASE + C.LOSS_STEP * Math.max(0, ls - 1);
        kind = 'loss';
      }
      p.addMoney(amount);
      p.send({ t: 'reward', amount, kind, streak: kind === 'win' ? this.winStreak[p.team] : this.lossStreak[p.team] });
      room.sendSelf(p);
    }
  }

  // Gọi mỗi khi có người chết hoặc rời trận.
  checkElimination(now) {
    if (this.phase !== 'live') return;
    if (this.oneSided()) return; // chỉ còn một bên: không kết thúc vòng bằng loại đối thủ
    const a = this.aliveCount('A');
    const b = this.aliveCount('B');
    if (a === 0 || b === 0) this.endRound(a > 0 ? 'A' : b > 0 ? 'B' : null, now);
  }

  toLobby() {
    for (const p of this.room.players.values()) {
      p.alive = false;
      p.inRound = false;
    }
    this.phase = 'lobby';
    this.round = 0;
    this.room.sendInfo();
  }

  update(now) {
    switch (this.phase) {
      case 'freeze':
        if (now >= this.phaseEnd) {
          this.phase = 'live';
          this.liveStartedAt = now;
          this.phaseEnd = now + C.ROUND_MS;
          this.room.broadcastRound(now);
        }
        break;
      case 'live':
        if (now >= this.phaseEnd) {
          const a = this.aliveCount('A');
          const b = this.aliveCount('B');
          // Chỉ còn một bên: không tính điểm, trận không bao giờ tự kết thúc.
          this.endRound(this.oneSided() ? null : a > b ? 'A' : b > a ? 'B' : null, now);
        }
        break;
      case 'roundEnd':
        if (now >= this.phaseEnd) this.startRound(now);
        break;
      case 'matchEnd':
        if (now >= this.phaseEnd) this.toLobby();
        break;
      default:
        break;
    }
  }
}

module.exports = { Match };

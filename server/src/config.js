'use strict';

// Đọc số từ biến môi trường, nếu không có thì dùng giá trị mặc định.
const num = (env, def) => {
  const v = Number(process.env[env]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

module.exports = {
  PORT: num('PORT', 8080),
  // Chế độ mạng nội bộ (LAN): HACHIHI_LAN=1 -> 60 tick/giây và nội suy 50 ms (phản hồi nhanh hơn, ít cảm giác trễ).
  LAN: process.env.HACHIHI_LAN === '1',
  TICK_MS: num('HACHIHI_TICK_MS', process.env.HACHIHI_LAN === '1' ? 16 : 33), // 30 lần/giây (internet) hoặc ~60 (LAN)

  MAX_ROOMS: 40,
  MAX_CONNECTIONS: 200,
  MAX_PER_TEAM: 5,
  MAX_MSG_PER_SEC: 200,

  ROUNDS_TO_WIN: num('HACHIHI_ROUNDS_TO_WIN', 8),
  FREEZE_MS: num('HACHIHI_FREEZE_MS', 9000), // đủ thời gian mua đồ
  ROUND_MS: num('HACHIHI_ROUND_MS', 120000),
  ROUND_END_MS: num('HACHIHI_ROUND_END_MS', 5000),
  MATCH_END_MS: num('HACHIHI_MATCH_END_MS', 10000),
  RECONNECT_GRACE_MS: num('HACHIHI_GRACE_MS', 30000),

  // Kinh tế (chế độ có tiền)
  START_MONEY: num('HACHIHI_START_MONEY', 800),
  MAX_MONEY: 16000,
  WIN_BONUS: 3250,
  LOSS_BASE: 1400,
  LOSS_STEP: 500,
  LOSS_MAX_STREAK: 4,
  WIN_STREAK_STEP: 150, // thưởng thêm cho mỗi vòng thắng liên tiếp (tối đa WIN_STREAK_MAX vòng)
  WIN_STREAK_MAX: 4,
  BUY_LIVE_MS: 10000, // sau khi vòng bắt đầu vẫn mua được trong khoảng này

  // Lựu đạn
  FRAG_FUSE_MS: 1800,
  FRAG_RADIUS: 8,
  FRAG_DAMAGE: 140,
  SMOKE_FUSE_MS: 1400,
  SMOKE_MS: 18000,
  GRENADE_SPEED: 15,
  THROW_MOM_H: 0.8, // đà chạy cộng vào vận tốc ném (ném khi chạy/nhảy bay xa hơn)
  THROW_MOM_V: 0.6, // đà nhảy (hướng lên) cộng vào vận tốc ném

  EYE_HEIGHT: 1.6,
  PLAYER_HEIGHT: 1.8,
  // Tư thế ngồi: mắt thấp hơn, thân thấp hơn (client dùng cùng số liệu trong controller.js)
  CROUCH_EYE_HEIGHT: 1.15,
  CROUCH_PLAYER_HEIGHT: 1.25,
  PLAYER_RADIUS: 0.4, // dùng cho va chạm với tường

  // Hitbox khi bị bắn: thân là hình trụ, đầu là hình cầu riêng.
  BODY_RADIUS: 0.36,
  BODY_HEIGHT: 1.48,
  HEAD_CENTER: 1.62,
  HEAD_RADIUS: 0.2,
  CROUCH_BODY_HEIGHT: 0.98,
  CROUCH_HEAD_CENTER: 1.17,

  MAX_HP: 100,

  // Kiểm tra di chuyển
  MAX_SPEED: 7.5, // m/s ngang, ngân sách tối đa server cho phép (chạy thật là 5.6)
  MAX_Y: 4,
  BOUNDS: 29.6,
  RISE_RATE: 9, // m/s: tốc độ tối đa được tích luỹ cho việc leo/nhảy (nhảy thật ~7.6)
  RISE_CAP: 1.5,
  RISE_MAX: 2.6, // tổng độ cao tối đa được leo thêm khi chưa chạm mặt đỡ (nhảy 1.31 + vài bậc hỗ trợ)
  FALL_RATE: 40, // m/s: rơi tối đa (rơi thật tối đa ~40)
  FALL_CAP: 3,

  // Bù trễ
  HISTORY_MS: 1000,
  LAG_COMP_MAX_MS: 250,
  INTERP_DELAY_MS: process.env.HACHIHI_LAN === '1' ? 50 : 100, // client nhận giá trị này khi vào phòng (joined.interpMs)
  PING_EVERY_MS: 1000,
};

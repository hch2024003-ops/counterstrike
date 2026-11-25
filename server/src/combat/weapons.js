'use strict';

// Bảng thông số vũ khí. Server là nguồn sự thật và gửi bảng này cho client khi vào phòng,
// nên chỉ cần sửa ở đây, client tự cập nhật theo.
//
// cat       : primary (súng chính) | secondary (súng phụ). Mỗi người giữ tối đa 1 súng chính + 1 súng phụ.
// price     : giá mua ($). 0 = có sẵn từ đầu.
// slot      : số hiệu kiểu dáng (model) dùng chung cho client, KHÔNG phải phím số.
// pen       : khả năng xuyên tường (0..1). Độ dày tường xuyên được tối đa = pen × 0.85 m; mỗi lớp tường làm giảm sát thương.
// reward    : tiền thưởng khi hạ gục bằng súng này.
// ads / adsSpread : nhắm qua ống/ thước (chuột phải): góc nhìn dọc (độ) và hệ số tản đạn khi nhắm; scope: súng bắn tỉa có ống ngắm riêng
// spread    : độ tản đạn cơ bản (radian) khi đứng yên, ngắm chuẩn
// moveMul   : tản thêm theo tốc độ chạy (chạy hết tốc độ = +moveMul × spread)
// airMul    : tản thêm khi đang nhảy/rơi
// sprayInc  : tản thêm cho mỗi phát bắn liên tiếp (tối đa sprayMax phát)
const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'SÚNG TRƯỜNG', cat: 'primary', price: 2900, slot: 1, reward: 300, pen: 0.55,
    damage: 27, headMul: 2.5, interval: 100, auto: true,
    mag: 30, reserve: 90, reloadMs: 2400, pellets: 1, range: 120,
    spread: 0.005, moveMul: 1.8, airMul: 3, sprayInc: 0.0018, sprayMax: 14,
    ads: 58, adsSpread: 0.65,
  },
  pistol: {
    id: 'pistol', name: 'SÚNG LỤC', cat: 'secondary', price: 0, slot: 2, reward: 300, pen: 0.25,
    damage: 24, headMul: 2.5, interval: 180, auto: false,
    mag: 12, reserve: 48, reloadMs: 1700, pellets: 1, range: 100,
    spread: 0.004, moveMul: 2.2, airMul: 3.5, sprayInc: 0.004, sprayMax: 4,
    ads: 68, adsSpread: 0.75,
  },
  shotgun: {
    id: 'shotgun', name: 'SHOTGUN', cat: 'primary', price: 1100, slot: 3, reward: 900, pen: 0.1,
    damage: 11, headMul: 1.5, interval: 850, auto: false,
    mag: 6, reserve: 24, reloadMs: 2600, pellets: 8, range: 40,
    spread: 0.05, moveMul: 0.3, airMul: 0.5, sprayInc: 0, sprayMax: 0,
  },
  ak: {
    id: 'ak', name: 'AK-47', cat: 'primary', price: 2700, slot: 4, reward: 300, pen: 0.7,
    damage: 33, headMul: 2.6, interval: 105, auto: true,
    mag: 30, reserve: 90, reloadMs: 2500, pellets: 1, range: 130,
    spread: 0.0065, moveMul: 2, airMul: 3, sprayInc: 0.0022, sprayMax: 16,
    ads: 60, adsSpread: 0.7,
  },
  smg: {
    id: 'smg', name: 'TIỂU LIÊN', cat: 'primary', price: 1200, slot: 5, reward: 600, pen: 0.2,
    damage: 20, headMul: 2.2, interval: 62, auto: true,
    mag: 30, reserve: 120, reloadMs: 2000, pellets: 1, range: 70,
    spread: 0.007, moveMul: 0.8, airMul: 2.5, sprayInc: 0.0025, sprayMax: 12,
    ads: 64, adsSpread: 0.7,
  },
  sniper: {
    id: 'sniper', name: 'BẮN TỈA', cat: 'primary', price: 4750, slot: 6, reward: 100, pen: 1.0,
    damage: 115, headMul: 2.2, interval: 1400, auto: false, scope: true,
    mag: 5, reserve: 20, reloadMs: 3200, pellets: 1, range: 300,
    spread: 0.0008, moveMul: 40, airMul: 60, sprayInc: 0, sprayMax: 0,
  },
  lmg: {
    id: 'lmg', name: 'ĐẠI LIÊN', cat: 'primary', price: 5200, slot: 7, reward: 300, pen: 0.8,
    damage: 29, headMul: 2.4, interval: 85, auto: true,
    mag: 100, reserve: 200, reloadMs: 5000, pellets: 1, range: 130,
    spread: 0.007, moveMul: 3, airMul: 3, sprayInc: 0.0016, sprayMax: 20,
    ads: 62, adsSpread: 0.65,
  },
  deagle: {
    id: 'deagle', name: 'DESERT EAGLE', cat: 'secondary', price: 650, slot: 8, reward: 300, pen: 0.5,
    damage: 55, headMul: 2.4, interval: 320, auto: false,
    mag: 7, reserve: 35, reloadMs: 2000, pellets: 1, range: 110,
    spread: 0.003, moveMul: 4, airMul: 5, sprayInc: 0.01, sprayMax: 3,
    ads: 66, adsSpread: 0.7,
  },
  autoshotgun: {
    id: 'autoshotgun', name: 'SHOTGUN TỰ ĐỘNG', cat: 'primary', price: 1800, slot: 9, reward: 900, pen: 0.1,
    damage: 10, headMul: 1.5, interval: 260, auto: true,
    mag: 8, reserve: 32, reloadMs: 3000, pellets: 8, range: 35,
    spread: 0.06, moveMul: 0.4, airMul: 0.6, sprayInc: 0.002, sprayMax: 4,
  },
};

// Vật phẩm không phải súng: giáp, lựu đạn. type: armor | nade.
const GEAR = {
  armor: { id: 'armor', name: 'ÁO GIÁP', price: 650, type: 'armor' },
  frag: { id: 'frag', name: 'LỰU ĐẠN', price: 300, type: 'nade', max: 1 },
  smoke: { id: 'smoke', name: 'BOM KHÓI', price: 300, type: 'nade', max: 1 },
};

// Súng có sẵn khi tắt chế độ tiền ("cổ điển"): giống các bản trước 0.7.
const CLASSIC_LOADOUT = ['rifle', 'pistol', 'shotgun'];

function freshAmmoFor(ids) {
  const a = {};
  for (const id of ids) {
    const w = WEAPONS[id];
    if (w) a[id] = { mag: w.mag, reserve: w.reserve };
  }
  return a;
}

function freshAmmo() {
  return freshAmmoFor(Object.keys(WEAPONS));
}

// Độ tản đạn hiện tại: dùng cho cả server (tính tia bắn) và có thể tái sử dụng khi kiểm thử.
const UNSCOPED_SPREAD = 0.045; // bắn tỉa không nhìn qua ống ngắm: tản thêm (radian)

// scoped: đang nhắm (chuột phải). Súng có ống ngắm mà không nhắm thì rất lệch; súng thường khi nhắm thì chuẩn hơn.
function computeSpread(w, moveFactor, airborne, spray, scoped = false) {
  let s = w.spread * (1 + w.moveMul * moveFactor + (airborne ? w.airMul : 0)) + w.sprayInc * spray;
  if (w.scope && !scoped) s += UNSCOPED_SPREAD;
  else if (w.ads && scoped) s *= w.adsSpread;
  return s;
}

module.exports = { WEAPONS, GEAR, CLASSIC_LOADOUT, freshAmmo, freshAmmoFor, computeSpread, UNSCOPED_SPREAD };

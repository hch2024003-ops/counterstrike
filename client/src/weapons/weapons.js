// Thông số vũ khí phía client.
// Nguồn sự thật nằm ở server (server/src/combat/weapons.js). Khi vào phòng, server gửi bảng này cho client
// và applyServerWeapons() ghi đè bản mặc định bên dưới, nên chỉ cần sửa ở server.
// Bản mặc định chỉ để hiển thị trước khi vào phòng.

const W = (o) => o;
export const WEAPONS = {
  rifle: W({ id: 'rifle', slot: 1, cat: 'primary', price: 2900, name: 'SÚNG TRƯỜNG', interval: 100, auto: true, mag: 30, reloadMs: 2400, spread: 0.005, moveMul: 1.8, airMul: 3, sprayInc: 0.0018, sprayMax: 14, pen: 0.55, ads: 58, adsSpread: 0.65 }),
  pistol: W({ id: 'pistol', slot: 2, cat: 'secondary', price: 0, name: 'SÚNG LỤC', interval: 180, auto: false, mag: 12, reloadMs: 1700, spread: 0.004, moveMul: 2.2, airMul: 3.5, sprayInc: 0.004, sprayMax: 4, pen: 0.25, ads: 68, adsSpread: 0.75 }),
  shotgun: W({ id: 'shotgun', slot: 3, cat: 'primary', price: 1100, name: 'SHOTGUN', interval: 850, auto: false, mag: 6, reloadMs: 2600, spread: 0.05, moveMul: 0.3, airMul: 0.5, sprayInc: 0, sprayMax: 0, pen: 0.1 }),
  ak: W({ id: 'ak', slot: 4, cat: 'primary', price: 2700, name: 'AK-47', interval: 105, auto: true, mag: 30, reloadMs: 2500, spread: 0.0065, moveMul: 2, airMul: 3, sprayInc: 0.0022, sprayMax: 16, pen: 0.7, ads: 60, adsSpread: 0.7 }),
  smg: W({ id: 'smg', slot: 5, cat: 'primary', price: 1200, name: 'TIỂU LIÊN', interval: 62, auto: true, mag: 30, reloadMs: 2000, spread: 0.007, moveMul: 0.8, airMul: 2.5, sprayInc: 0.0025, sprayMax: 12, pen: 0.2, ads: 64, adsSpread: 0.7 }),
  sniper: W({ id: 'sniper', slot: 6, cat: 'primary', price: 4750, name: 'BẮN TỈA', interval: 1400, auto: false, mag: 5, reloadMs: 3200, spread: 0.0008, moveMul: 40, airMul: 60, sprayInc: 0, sprayMax: 0, pen: 1, scope: true }),
  lmg: W({ id: 'lmg', slot: 7, cat: 'primary', price: 5200, name: 'ĐẠI LIÊN', interval: 85, auto: true, mag: 100, reloadMs: 5000, spread: 0.007, moveMul: 3, airMul: 3, sprayInc: 0.0016, sprayMax: 20, pen: 0.8, ads: 62, adsSpread: 0.65 }),
  deagle: W({ id: 'deagle', slot: 8, cat: 'secondary', price: 650, name: 'DESERT EAGLE', interval: 320, auto: false, mag: 7, reloadMs: 2000, spread: 0.003, moveMul: 4, airMul: 5, sprayInc: 0.01, sprayMax: 3, pen: 0.5, ads: 66, adsSpread: 0.7 }),
  autoshotgun: W({ id: 'autoshotgun', slot: 9, cat: 'primary', price: 1800, name: 'SHOTGUN TỰ ĐỘNG', interval: 260, auto: true, mag: 8, reloadMs: 3000, spread: 0.06, moveMul: 0.4, airMul: 0.6, sprayInc: 0.002, sprayMax: 4, pen: 0.1 }),
};

// Vật phẩm không phải súng (giáp, lựu đạn, bom khói).
export const GEAR = {
  armor: { id: 'armor', name: 'ÁO GIÁP', price: 650, type: 'armor' },
  frag: { id: 'frag', name: 'LỰU ĐẠN', price: 300, type: 'nade', max: 1 },
  smoke: { id: 'smoke', name: 'BOM KHÓI', price: 300, type: 'nade', max: 1 },
};

// Thứ tự cố định để cuộn chuột đổi súng và vẽ model; sửa tại chỗ để các nơi import giữ được tham chiếu.
export const WEAPON_ORDER = Object.keys(WEAPONS);
export const SLOT_TO_ID = { 1: 'rifle', 2: 'pistol', 3: 'shotgun' }; // giữ lại cho mã cũ

// Phím số: 1 = súng chính đang có, 2 = súng phụ đang có.
export function weaponForKey(owned, key) {
  const cat = key === '1' ? 'primary' : key === '2' ? 'secondary' : null;
  if (!cat) return null;
  return (owned || []).find((id) => WEAPONS[id] && WEAPONS[id].cat === cat) || null;
}

// Giữ nguyên tên hiển thị, lấy mọi thông số khác từ server.
export function applyServerWeapons(table, gear) {
  if (table && typeof table === 'object') {
    for (const id of Object.keys(table)) {
      if (!WEAPONS[id]) continue;
      for (const key of ['interval', 'auto', 'mag', 'reloadMs', 'spread', 'moveMul', 'airMul', 'sprayInc', 'sprayMax', 'slot', 'price', 'pen', 'cat', 'name', 'damage', 'scope', 'ads', 'adsSpread']) {
        if (table[id][key] !== undefined) WEAPONS[id][key] = table[id][key];
      }
    }
  }
  if (gear && typeof gear === 'object') {
    for (const id of Object.keys(gear)) if (GEAR[id]) Object.assign(GEAR[id], gear[id]);
  }
}

// Độ tản đạn hiện tại (radian): cùng công thức với server, dùng để vẽ tâm ngắm nở ra.
export function spreadOf(id, moveFactor, airborne, spray, scoped = false) {
  const w = WEAPONS[id];
  let s = w.spread * (1 + w.moveMul * moveFactor + (airborne ? w.airMul : 0)) + w.sprayInc * spray;
  if (w.scope && !scoped) s += 0.045;
  else if (w.ads && scoped) s *= w.adsSpread;
  return s;
}

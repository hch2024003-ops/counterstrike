// Kiểm thử phím điều khiển và tư thế ngồi: node test/keys.mjs
import assert from 'assert';
import { Keybinds, ACTIONS, sanitize, defaults, MOVE_FLAGS, codeLabel } from '../src/ui/keybinds.js';
import { Controller, EYE, EYE_CROUCH } from '../src/game/controller.js';
import { PHYSICS_STEP } from '../src/config.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

// ---- bảng phím ----
const mem = {};
const store = { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } };
let kb = new Keybinds(store);
check('Mặc định: B mở menu mua, Ctrl/C ngồi', kb.actionFor('KeyB') === 'shop' && kb.actionFor('ControlLeft') === 'crouch' && kb.actionFor('KeyC') === 'crouch');
check('Mọi hành động di chuyển có cờ điều khiển', ['forward', 'back', 'left', 'right', 'jump', 'walk', 'crouch'].every((a) => MOVE_FLAGS[a]));
check('Mặc định không trùng phím', (() => {
  const seen = new Set();
  for (const a of ACTIONS) for (const c of defaults()[a.id]) { if (!c) continue; if (seen.has(c)) return false; seen.add(c); }
  return true;
})());

let r = kb.set('shop', 0, 'KeyN');
check('Đổi phím mua đồ sang N', r.ok && kb.actionFor('KeyN') === 'shop' && kb.actionFor('KeyB') === null);
r = kb.set('reload', 0, 'KeyN');
check('Gán phím đang dùng: gỡ khỏi hành động cũ', r.ok && r.stolenFrom === 'shop' && kb.actionFor('KeyN') === 'reload' && kb.codes('shop')[0] === '');
check('Phím hệ thống (Esc, F3, F12) bị từ chối', !kb.set('jump', 0, 'Escape').ok && !kb.set('jump', 0, 'F3').ok && !kb.set('jump', 0, 'F12').ok);
check('Mã phím rác bị từ chối', !kb.set('jump', 0, '../x').ok && !kb.set('jump', 0, '').ok);
kb.clear('crouch', 1);
check('Xoá một ô phím', kb.codes('crouch')[1] === '' && kb.actionFor('KeyC') === null);

kb = new Keybinds(store);
check('Lưu và nạp lại đúng', kb.actionFor('KeyN') === 'reload' && kb.actionFor('KeyC') === null);
kb.reset();
check('Khôi phục mặc định', kb.actionFor('KeyB') === 'shop' && kb.actionFor('KeyC') === 'crouch');

check('Dữ liệu hỏng (JSON rác/kiểu sai) quay về mặc định', (() => {
  const bad = new Keybinds({ get: () => '{not json', set() {} });
  const bad2 = sanitize({ shop: 'KeyB', jump: [123, null], crouch: ['KeyZ', 'KeyZ'], __proto__: { x: 1 } });
  return bad.actionFor('KeyB') === 'shop' && bad2.jump.join() === ',' && bad2.crouch.join() === 'KeyZ,' && bad2.shop.join() === 'KeyB,';
})());
check('Nhãn phím dễ đọc', codeLabel('KeyB') === 'B' && codeLabel('Digit1') === '1' && codeLabel('ControlLeft') === 'Ctrl trái' && codeLabel('') === '—');

// ---- ngồi ----
const flat = { boxes: [] };
const box = (minX, maxX, minY, maxY, minZ, maxZ) => ({ p: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2], s: [maxX - minX, maxY - minY, maxZ - minZ] });
const makeBoxes = (d) => d.boxes.map((b) => ({ minX: b.p[0] - b.s[0] / 2, maxX: b.p[0] + b.s[0] / 2, minY: b.p[1] - b.s[1] / 2, maxY: b.p[1] + b.s[1] / 2, minZ: b.p[2] - b.s[2] / 2, maxZ: b.p[2] + b.s[2] / 2 }));
const run = (c, sec) => { for (let i = 0; i < Math.round(sec / PHYSICS_STEP); i++) c.update(PHYSICS_STEP); };

let c = new Controller(makeBoxes(flat));
c.setPosition(0, 0, 0, 0);
c.keys.crouch = true;
run(c, 0.5);
check('Giữ phím: ngồi, mắt hạ xuống ~1.15 m', c.crouching && Math.abs(c.eye - EYE_CROUCH) < 0.02, `eye=${c.eye.toFixed(3)}`);
c.keys.f = true;
run(c, 1);
check('Ngồi đi chậm hơn chạy (≈2.6 m/s)', c.speed < 3 && c.speed > 2, `speed=${c.speed.toFixed(2)}`);
c.keys.crouch = false; c.keys.f = false;
run(c, 0.5);
check('Nhả phím: đứng dậy, mắt về 1.6 m', !c.crouching && Math.abs(c.eye - EYE) < 0.02);

// Trần thấp 1.5 m: nhả phím vẫn phải ngồi (không kẹt vào trần)
c = new Controller(makeBoxes({ boxes: [box(-5, 5, 1.5, 2.5, -5, 5)] }));
c.setPosition(0, 0, 0, 0);
c.keys.crouch = true; run(c, 0.3);
c.keys.crouch = false; run(c, 0.5);
check('Dưới trần thấp: nhả phím vẫn giữ tư thế ngồi', c.crouching === true);
c.setPosition(0, 0, 0, 0); c.keys.crouch = false; run(c, 0.1);
check('setPosition (hồi sinh) đưa về tư thế đứng', !c.crouching && c.h === 1.8);

// Freeze (canMove=false): không ngồi được
c = new Controller(makeBoxes(flat));
c.setPosition(0, 0, 0, 0); c.canMove = false; c.keys.crouch = true; run(c, 0.3);
check('Đóng băng đầu vòng: không ngồi', !c.crouching);

console.log(fails ? `\n${fails} LỖI` : '\nKEYS OK');
process.exit(fails ? 1 : 0);

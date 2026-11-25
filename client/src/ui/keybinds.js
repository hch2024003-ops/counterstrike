// Phím điều khiển: danh sách hành động, phím mặc định, lưu/nạp, đổi phím. Không phụ thuộc DOM nên kiểm thử bằng Node được.
// Mỗi hành động có tối đa 2 phím (KeyboardEvent.code, không phụ thuộc bố cục bàn phím). Một phím chỉ thuộc một hành động.

export const ACTIONS = [
  { id: 'forward', group: 'Di chuyển', label: 'Đi tới', def: ['KeyW', 'ArrowUp'] },
  { id: 'back', group: 'Di chuyển', label: 'Đi lùi', def: ['KeyS', 'ArrowDown'] },
  { id: 'left', group: 'Di chuyển', label: 'Sang trái', def: ['KeyA', 'ArrowLeft'] },
  { id: 'right', group: 'Di chuyển', label: 'Sang phải', def: ['KeyD', 'ArrowRight'] },
  { id: 'jump', group: 'Di chuyển', label: 'Nhảy', def: ['Space', ''] },
  { id: 'crouch', group: 'Di chuyển', label: 'Ngồi (giữ)', def: ['ControlLeft', 'KeyC'] },
  { id: 'walk', group: 'Di chuyển', label: 'Đi bộ chậm (giữ)', def: ['ShiftLeft', 'ShiftRight'] },
  { id: 'reload', group: 'Chiến đấu', label: 'Thay đạn', def: ['KeyR', ''] },
  { id: 'weapon1', group: 'Chiến đấu', label: 'Súng chính', def: ['Digit1', ''] },
  { id: 'weapon2', group: 'Chiến đấu', label: 'Súng phụ', def: ['Digit2', ''] },
  { id: 'frag', group: 'Chiến đấu', label: 'Lựu đạn (giữ để canh, thả để ném)', def: ['KeyG', ''] },
  { id: 'smoke', group: 'Chiến đấu', label: 'Bom khói (giữ để canh, thả để ném)', def: ['KeyH', ''] },
  { id: 'shop', group: 'Giao diện', label: 'Mở/đóng menu mua đồ', def: ['KeyB', ''] },
  { id: 'scoreboard', group: 'Giao diện', label: 'Bảng điểm (giữ)', def: ['Tab', ''] },
];

// Phím cố định, chỉ để hiển thị trong tab (không đổi được).
export const FIXED_KEYS = [
  ['Chuột trái', 'Bắn'],
  ['Chuột phải', 'Ngắm / vào-ra ống ngắm (huỷ canh ném lựu đạn)'],
  ['Cuộn chuột', 'Đổi súng'],
  ['1 … 0, Q (khi menu mua đang mở)', 'Mua vật phẩm theo số hiện trên menu'],
  ['Esc', 'Nhả con trỏ chuột'],
  ['F3', 'Hiện/ẩn FPS và ping'],
  ['F4', 'Chạy benchmark 20 giây'],
  ['F11', 'Toàn màn hình (bản Windows)'],
];

// Phím không cho gán (đã dùng cho hệ thống).
export const RESERVED = new Set(['Escape', 'F3', 'F4', 'F11', 'F12', 'ContextMenu', 'MetaLeft', 'MetaRight']);

const SLOTS = 2;
const VALID = /^[A-Za-z0-9]{1,24}$/;

export const MOVE_FLAGS = { forward: 'f', back: 'b', left: 'l', right: 'r', jump: 'jump', walk: 'walk', crouch: 'crouch' };

export function defaults() {
  const m = {};
  for (const a of ACTIONS) m[a.id] = a.def.slice(0, SLOTS);
  return m;
}

export function codeLabel(code) {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  const map = {
    Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock',
    ShiftLeft: 'Shift trái', ShiftRight: 'Shift phải', ControlLeft: 'Ctrl trái', ControlRight: 'Ctrl phải',
    AltLeft: 'Alt trái', AltRight: 'Alt phải',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
  };
  return map[code] || code;
}

// Nhận dữ liệu bất kỳ (localStorage cũ/hỏng) và trả về bảng phím hợp lệ, không trùng phím.
export function sanitize(raw) {
  const out = defaults();
  const used = new Map(); // code -> action
  const src = raw && typeof raw === 'object' ? raw : {};
  const order = ACTIONS.map((a) => a.id);
  for (const id of order) {
    const arr = Array.isArray(src[id]) ? src[id] : out[id];
    const clean = [];
    for (let i = 0; i < SLOTS; i++) {
      const c = arr[i];
      if (typeof c === 'string' && c && VALID.test(c) && !RESERVED.has(c) && !used.has(c)) {
        clean.push(c);
        used.set(c, id);
      } else {
        clean.push('');
      }
    }
    out[id] = clean;
  }
  return out;
}

export class Keybinds {
  // storage: { get(key, default), set(key, value) } (xem `store` trong main.js). Có thể bỏ trống khi kiểm thử.
  constructor(storage = null) {
    this.storage = storage;
    this.listeners = [];
    let raw = null;
    try {
      raw = storage ? JSON.parse(storage.get('keys', 'null')) : null;
    } catch { raw = null; }
    this.map = sanitize(raw);
    this._index();
  }

  _index() {
    this.byCode = new Map();
    for (const a of ACTIONS) for (const c of this.map[a.id]) if (c) this.byCode.set(c, a.id);
  }

  _save() {
    this._index();
    if (this.storage) this.storage.set('keys', JSON.stringify(this.map));
    for (const f of this.listeners) f();
  }

  onChange(f) {
    this.listeners.push(f);
  }

  codes(action) {
    return this.map[action] || ['', ''];
  }

  actionFor(code) {
    return this.byCode.get(code) || null;
  }

  // Nhãn phím đầu tiên đang gán (để hiện gợi ý trong game), ví dụ 'B'.
  label(action) {
    const c = this.codes(action).find(Boolean);
    return c ? codeLabel(c) : '—';
  }

  // Gán phím cho (hành động, ô 0/1). Phím đã thuộc hành động khác thì bị gỡ khỏi hành động đó.
  // Trả về { ok, reason?, stolenFrom? }.
  set(action, slot, code) {
    if (!this.map[action] || slot < 0 || slot >= SLOTS) return { ok: false, reason: 'Hành động không hợp lệ.' };
    if (typeof code !== 'string' || !VALID.test(code)) return { ok: false, reason: 'Phím này không dùng được.' };
    if (RESERVED.has(code)) return { ok: false, reason: `Phím ${codeLabel(code)} dành cho hệ thống, hãy chọn phím khác.` };
    let stolenFrom = null;
    const owner = this.byCode.get(code);
    if (owner) {
      for (let i = 0; i < SLOTS; i++) if (this.map[owner][i] === code && !(owner === action && i === slot)) this.map[owner][i] = '';
      if (owner !== action) stolenFrom = owner;
    }
    this.map[action][slot] = code;
    this._save();
    return { ok: true, stolenFrom };
  }

  clear(action, slot) {
    if (!this.map[action] || slot < 0 || slot >= SLOTS) return;
    this.map[action][slot] = '';
    this._save();
  }

  reset() {
    this.map = defaults();
    this._save();
  }
}

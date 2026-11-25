// Chọn trạng thái hoạt cảnh nhân vật từ tốc độ/trạng thái (thuần logic, không phụ thuộc three nên kiểm thử được).
export const STATES = ['idle', 'walk', 'run', 'crouch', 'crouch_walk', 'jump', 'reload', 'death', 'fire'];

// Tên clip có thể gặp trong file GLB (không phân biệt hoa thường, chứa chuỗi này là khớp).
export const ALIASES = {
  idle: ['idle', 'stand'],
  walk: ['walk'],
  run: ['run', 'sprint'],
  crouch: ['crouch_idle', 'crouchidle', 'crouch'],
  crouch_walk: ['crouch_walk', 'crouchwalk'],
  jump: ['jump', 'air', 'fall'],
  reload: ['reload'],
  death: ['death', 'die'],
  fire: ['fire', 'shoot'],
};

export function pickLocomotion({ speed = 0, airborne = false, crouch = false, dead = false } = {}) {
  if (dead) return 'death';
  if (airborne) return 'jump';
  if (crouch) return speed > 0.3 ? 'crouch_walk' : 'crouch';
  if (speed > 4.2) return 'run';
  if (speed > 0.4) return 'walk';
  return 'idle';
}

// Tìm clip theo trạng thái: ưu tiên khớp chính xác tên, rồi khớp chứa chuỗi; thứ tự alias quyết định độ ưu tiên.
export function findClipName(names, state) {
  const lower = names.map((n) => n.toLowerCase());
  for (const alias of ALIASES[state] || [state]) {
    let i = lower.findIndex((n) => n === alias || n.endsWith('|' + alias));
    if (i < 0) i = lower.findIndex((n) => n.includes(alias) && !(state === 'crouch' && n.includes('walk')) && !(state === 'idle' && n.includes('crouch')));
    if (i >= 0) return names[i];
  }
  return null;
}

// Tốc độ phát hoạt cảnh đi/chạy theo tốc độ thực để chân không trượt (v0: tốc độ gốc của clip, m/s).
export function locomotionTimeScale(state, speed) {
  const ref = state === 'run' ? 5.6 : state === 'walk' ? 2.2 : state === 'crouch_walk' ? 1.6 : 0;
  if (!ref) return 1;
  return Math.max(0.6, Math.min(1.6, speed / ref));
}

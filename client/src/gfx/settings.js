// Cài đặt video: mặc định, preset, kiểm tra hợp lệ, quy đổi ra thông số vẽ thực tế. Không phụ thuộc DOM.
import { LADDER } from './autoq.js';

// Phân hạng card đồ họa từ tên hiển thị của trình điều khiển (WEBGL_debug_renderer_info). 3 = rất mạnh, 2 = mạnh, 1 = trung bình, 0 = card tích hợp/yếu.
// Chỉ để chọn mức bắt đầu cho Auto; Auto vẫn tự điều chỉnh theo FPS thực tế nên đoán sai không gây hại.
export function gpuTier(name) {
  const s = String(name || '').toLowerCase();
  if (!s) return 1;
  if (/(rtx\s*(20[6-8]0|30[6-9]0|40\d0|50\d0)|rtx\s*a\d{3,4}|rx\s*(6[789]\d{2}|7\d{3}|9\d{3})|radeon\s*pro\s*w|titan)/.test(s)) return 3;
  if (/(rtx|gtx\s*(1[0-9]{3}|9[6-9]0|16\d0)|rx\s*(5[0-9]{2,3}|6[0-6]\d{2}|[45]80|[45]70|vega\s*(56|64))|radeon\s*vii|arc\s*a[5-7]\d{2})/.test(s)) return 2;
  if (/(intel|uhd|hd\s*graphics|iris|microsoft basic|swiftshader|llvmpipe|mali|adreno|vega\s*\d{1,2}\b|radeon\(tm\)\s*graphics|gt\s*(7|10)\d{2}|gtx\s*(6|7)\d{2})/.test(s)) return 0;
  return 1;
}

// Bậc bắt đầu của Auto theo hạng card (xem LADDER): 3 -> Ultra, 2 -> Cao+AO, 1 -> Cao, 0 -> thấp.
export const START_RUNG_BY_TIER = [4, 2, 1, 0];

export const PRESET_NAMES = ['auto', 'low', 'medium', 'high', 'ultra', 'custom'];
export const SHADOW_SIZES = [0, 512, 1024, 2048, 4096]; // chỉ số 0..4: Tắt, Thấp, Vừa, Cao, Rất cao
export const ANISO = [1, 4, 8, 16];
export const FPS_LIMITS = [0, 60, 120, 144, 165, 240]; // 0 = không giới hạn
export const DISPLAY_MODES = ['windowed', 'borderless', 'fullscreen'];
export const STD_RESOLUTIONS = [[1280, 720], [1600, 900], [1920, 1080], [2560, 1440], [3840, 2160]];

// Hiệu ứng theo mức 0..3: hệ số tia lửa, khói, số vỏ đạn, đèn loé nòng, số vết đạn tối đa, mật độ bụi, chùm sáng đèn pha.
export const FX_TABLE = [
  { spark: 0.4, puff: 0, casing: 0, light: false, decals: 16, dust: 0, beams: false },
  { spark: 0.6, puff: 0.6, casing: 8, light: true, decals: 32, dust: 0.4, beams: false },
  { spark: 1.0, puff: 1.0, casing: 16, light: true, decals: 50, dust: 0.7, beams: true },
  { spark: 1.3, puff: 1.0, casing: 24, light: true, decals: 70, dust: 1.0, beams: true },
];

export const PRESETS = {
  low: { shadow: 0, texture: 0, ao: 0, post: 0, effects: 0, renderScale: 90 },
  medium: { shadow: 2, texture: 1, ao: 0, post: 1, effects: 1, renderScale: 100 },
  high: { shadow: 3, texture: 2, ao: 1, post: 1, effects: 2, renderScale: 100 },
  ultra: { shadow: 4, texture: 3, ao: 2, post: 2, effects: 3, renderScale: 100 },
};

export const DEFAULTS = {
  preset: 'auto',
  displayMode: 'windowed',
  resolution: 'native', // 'native' hoặc 'WxH' (chỉ dùng cho chế độ cửa sổ)
  fpsLimit: 0,
  vsync: true,
  renderScale: 100, // phần trăm 50..125
  shadow: 3,
  texture: 2,
  ao: 1,
  post: 1,
  effects: 2,
  showFps: false,
};

const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function parseRes(s) {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(String(s || ''));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// Nhận dữ liệu bất kỳ (từ localStorage cũ/hỏng) và trả về cài đặt đầy đủ, hợp lệ.
export function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = { ...DEFAULTS };
  s.preset = PRESET_NAMES.includes(r.preset) ? r.preset : DEFAULTS.preset;
  s.displayMode = DISPLAY_MODES.includes(r.displayMode) ? r.displayMode : DEFAULTS.displayMode;
  s.resolution = r.resolution === 'native' || parseRes(r.resolution) ? r.resolution : 'native';
  s.fpsLimit = FPS_LIMITS.includes(Number(r.fpsLimit)) ? Number(r.fpsLimit) : 0;
  s.vsync = r.vsync === undefined ? DEFAULTS.vsync : !!r.vsync;
  s.renderScale = Math.round(int(r.renderScale, 50, 125, 100) / 5) * 5;
  s.shadow = int(r.shadow, 0, 4, DEFAULTS.shadow);
  s.texture = int(r.texture, 0, 3, DEFAULTS.texture);
  s.ao = int(r.ao, 0, 2, DEFAULTS.ao);
  s.post = int(r.post, 0, 2, DEFAULTS.post);
  s.effects = int(r.effects, 0, 3, DEFAULTS.effects);
  s.showFps = !!r.showFps;
  // Preset cố định là nguồn chuẩn của các thông số chi tiết (Auto/Custom giữ giá trị riêng).
  if (PRESETS[s.preset]) Object.assign(s, PRESETS[s.preset]);
  return s;
}

// Chọn preset: điền các thông số chi tiết (giữ nguyên hiển thị/FPS/V-Sync).
export function withPreset(settings, name) {
  const s = { ...settings, preset: name };
  if (PRESETS[name]) Object.assign(s, PRESETS[name]);
  return sanitize(s);
}

// Sửa một thông số chi tiết thủ công => chuyển sang Custom (Auto không ghi đè lựa chọn này).
export function withDetail(settings, key, value) {
  const s = { ...settings, [key]: value };
  if (['renderScale', 'shadow', 'texture', 'ao', 'post', 'effects'].includes(key)) s.preset = 'custom';
  return sanitize(s);
}

// Thông số vẽ thực tế. autoRung: bậc hiện tại của bộ điều khiển Auto.
export function effective(settings, autoRung = 1) {
  if (settings.preset === 'auto') {
    const L = LADDER[Math.min(Math.max(autoRung, 0), LADDER.length - 1)];
    return {
      shadow: L.shadow, shadowSize: SHADOW_SIZES[L.shadow], ao: L.ao, post: L.post, fx: L.fx,
      scale: L.scale * (settings.renderScale / 100), aniso: ANISO[settings.texture],
    };
  }
  return {
    shadow: settings.shadow, shadowSize: SHADOW_SIZES[settings.shadow], ao: settings.ao, post: settings.post,
    fx: settings.effects, scale: settings.renderScale / 100, aniso: ANISO[settings.texture],
  };
}

// FPS mục tiêu của người dùng. Không giới hạn => bám tần số quét màn hình. V-Sync bật không thể vượt tần số quét.
export function targetFps(settings, refreshHz) {
  const hz = refreshHz && refreshHz >= 30 ? refreshHz : 60;
  let t = settings.fpsLimit > 0 ? settings.fpsLimit : hz;
  if (settings.vsync) t = Math.min(t, hz);
  return Math.max(30, Math.min(360, t));
}

// Ước lượng tần số quét từ các khoảng cách rAF (ms). Trả về Hz chuẩn gần nhất hoặc 0 nếu không tin cậy.
export function estimateRefresh(deltas) {
  const d = deltas.filter((x) => x > 2 && x < 40).sort((a, b) => a - b);
  if (d.length < 20) return 0;
  const med = d[Math.floor(d.length / 2)];
  const hz = 1000 / med;
  const std = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360];
  let best = std[0];
  for (const c of std) if (Math.abs(c - hz) < Math.abs(best - hz)) best = c;
  return Math.abs(best - hz) / best < 0.06 ? best : Math.round(hz);
}

// Danh sách độ phân giải chọn được: luôn có native và 1280x720; không liệt kê mức lớn hơn màn hình.
export function resolutionOptions(screenW, screenH) {
  const out = ['native'];
  for (const [w, h] of STD_RESOLUTIONS) {
    if (w <= screenW && h <= screenH) out.push(`${w}x${h}`);
  }
  if (out.length === 1) out.push('1280x720');
  return out;
}

export function renderSize(cssW, cssH, dpr, scale) {
  return [Math.max(1, Math.round(cssW * dpr * scale)), Math.max(1, Math.round(cssH * dpr * scale))];
}

// Cảnh báo (không chặn) khi lựa chọn có thể vượt khả năng phần cứng.
export function warnings(settings, display = {}) {
  const w = [];
  const eff = effective(settings, 0);
  const sw = (display.width || 1920) * (display.scaleFactor || 1);
  if (settings.preset !== 'auto' && eff.shadow >= 4 && eff.ao >= 2 && sw >= 2560) {
    w.push('Ultra ở độ phân giải từ 2K trở lên cần GPU rời mạnh; máy yếu có thể dưới 60 FPS.');
  }
  if (settings.renderScale > 100) w.push('Render Scale trên 100% tốn GPU nhiều (siêu lấy mẫu).');
  if (settings.vsync && display.refreshRate && settings.fpsLimit > display.refreshRate) {
    w.push(`V-Sync đang bật nên FPS tối đa là ${display.refreshRate} (tần số quét màn hình).`);
  }
  if (!settings.vsync && settings.fpsLimit === 0) w.push('Tắt V-Sync và không giới hạn FPS: GPU chạy hết công suất, máy có thể nóng/ồn.');
  const res = parseRes(settings.resolution);
  if (res && display.width && (res[0] > display.width || res[1] > display.height)) {
    w.push('Độ phân giải lớn hơn màn hình; cửa sổ sẽ bị thu về vừa màn hình.');
  }
  return w;
}

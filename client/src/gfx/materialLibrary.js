// Thư viện vật liệu PBR chuẩn: bê tông, bê tông sơn, thép, kim loại gỉ, gỗ, nhựa, cao su, vải, kính, đất, nhựa đường.
// Không bắt buộc đủ mọi map; thiếu thì dùng thông số mặc định của loại vật liệu (suy ra từ tên material trong file GLB).
import { enhanceMaterial } from './surfacefx.js';

export const PRESETS = {
  painted_concrete: { roughness: 0.8, metalness: 0 },
  concrete: { roughness: 0.92, metalness: 0 },
  rust: { roughness: 0.85, metalness: 0.55 },
  steel: { roughness: 0.4, metalness: 0.9 },
  metal: { roughness: 0.45, metalness: 0.85 },
  wood: { roughness: 0.8, metalness: 0 },
  plastic: { roughness: 0.55, metalness: 0 },
  rubber: { roughness: 0.95, metalness: 0 },
  fabric: { roughness: 0.95, metalness: 0, sheen: 0.6 },
  glass: { roughness: 0.05, metalness: 0, glass: true },
  asphalt: { roughness: 0.95, metalness: 0 },
  ground: { roughness: 1, metalness: 0 },
};
const ORDER = Object.keys(PRESETS); // painted_concrete trước concrete để khớp đúng

export function presetFor(materialName) {
  const n = String(materialName || '').toLowerCase().replace(/[\s\-.]+/g, '_');
  return ORDER.find((k) => n.includes(k)) || null;
}

const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
const tracked = new Set(); // texture đã đăng ký để chỉnh anisotropy khi đổi mức đồ họa
let currentAniso = 4;

// Chuẩn hoá một cảnh GLB vừa nạp: vật liệu, bóng đổ, anisotropy. options.grime: áp shader bám bẩn (cho môi trường).
export function prepare(root, { grime = false, castShadow = true } = {}) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mine = o.userData && o.userData.castShadow !== undefined ? !!o.userData.castShadow : castShadow;
    o.castShadow = mine;
    o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const p = presetFor(m.name);
      if (p && m.isMeshStandardMaterial) {
        const def = PRESETS[p];
        if (!m.roughnessMap) m.roughness = def.roughness;
        if (!m.metalnessMap && m.metalness === 1) m.metalness = def.metalness; // GLB mặc định metallic=1 khi quên đặt
        if (def.glass) { m.transparent = true; m.opacity = Math.min(m.opacity, 0.3); m.depthWrite = false; }
      }
      if (grime && m.isMeshStandardMaterial) enhanceMaterial(m);
      for (const k of TEX_KEYS) {
        const t = m[k];
        if (t) { t.anisotropy = currentAniso; tracked.add(t); }
      }
    }
  });
}

// Đăng ký texture ngoài (gói texture) để chỉnh anisotropy theo mức đồ họa.
export function trackTexture(t) {
  t.anisotropy = currentAniso;
  tracked.add(t);
}

export function setAnisotropy(n) {
  currentAniso = n;
  for (const t of tracked) { t.anisotropy = n; t.needsUpdate = true; }
}

export function forget(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const k of TEX_KEYS) if (m && m[k]) tracked.delete(m[k]);
  });
}

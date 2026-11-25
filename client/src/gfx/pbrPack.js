// Texture PBR chất lượng cao từ thư viện tài nguyên (gói Ultra Texture): thay bản vẽ nhanh bằng canvas khi có.
// bindings.textures = { brick: { color, normal, roughness, tile }, ... } (asset id). Thiếu hoặc lỗi => giữ texture sinh bằng code (fallback).
import * as THREE from 'three';
import { trackTexture } from './materialLibrary.js';

const packs = new Map(); // kind -> { color, normal, roughness, tile }

export const getPbr = (kind) => packs.get(kind) || null;
export const hasPbr = () => packs.size > 0;
export function clearPbr() {
  for (const p of packs.values()) for (const t of [p.color, p.normal, p.roughness]) if (t) t.dispose();
  packs.clear();
}

function loadTex(loader, url, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      trackTexture(t);
      resolve(t);
    }, undefined, () => reject(new Error('không nạp được ' + url)));
  });
}

// Trả về số loại bề mặt nạp được. Lỗi từng loại chỉ làm loại đó dùng fallback.
export async function loadPbrPack(assets, bindings, onProgress = null) {
  const loader = new THREE.TextureLoader();
  const kinds = Object.entries(bindings || {});
  let n = 0;
  for (const [kind, b] of kinds) {
    try {
      const [color, normal, roughness] = await Promise.all([
        loadTex(loader, assets.url(b.color), true),
        b.normal ? loadTex(loader, assets.url(b.normal), false) : null,
        b.roughness ? loadTex(loader, assets.url(b.roughness), false) : null,
      ]);
      packs.set(kind, { color, normal, roughness, tile: b.tile || 0 });
    } catch (e) {
      console.warn('[assets] texture', kind, e.message);
    }
    n++;
    if (onProgress) onProgress(n / kinds.length);
  }
  return packs.size;
}

// Nạp model GLB/GLTF 2.0 với Draco, KTX2 (Basis) và Meshopt. Bộ giải mã nằm cục bộ (dist/decoders), không dùng CDN.
// Bất đồng bộ, có tiến độ, hết giờ (timeout) và báo lỗi rõ ràng.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Giải phóng toàn bộ tài nguyên GPU của một cảnh GLTF (chỉ gọi khi KHÔNG còn bản sao nào dùng chung material/texture).
export function disposeObject(root) {
  const mats = new Set();
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => mats.add(x));
  });
  for (const m of mats) {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'envMap']) if (m[k]) m[k].dispose();
    m.dispose();
  }
}

export class AssetLoader {
  constructor(renderer, decoderBase) {
    this.draco = new DRACOLoader().setDecoderPath(decoderBase + 'draco/');
    this.ktx2 = new KTX2Loader().setTranscoderPath(decoderBase + 'basis/').detectSupport(renderer);
    this.gltf = new GLTFLoader();
    this.gltf.setDRACOLoader(this.draco);
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }

  // Trả về Promise<gltf>. Hết giờ hoặc lỗi thì reject (người gọi quyết định fallback).
  load(url, { timeoutMs = 20000, onProgress = null } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`hết giờ khi tải ${url}`));
      }, timeoutMs);
      this.gltf.load(
        url,
        (g) => {
          if (settled) { disposeObject(g.scene); return; } // đến muộn sau timeout: bỏ
          settled = true;
          clearTimeout(timer);
          resolve(g);
        },
        (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(`không tải được ${url}`));
        },
      );
    });
  }

  dispose() {
    this.draco.dispose();
    this.ktx2.dispose();
  }
}

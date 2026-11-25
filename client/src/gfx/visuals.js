// Cổng duy nhất để phần còn lại của game dùng tài nguyên 3D từ thư viện (GLB). Chưa có tài nguyên/lỗi => mọi hàm trả null và game dùng
// model dựng bằng code (fallback), nên gameplay không bao giờ phụ thuộc vào việc có asset hay không.
import * as THREE from 'three';
import { AssetManager } from './assetManager.js';
import { AssetLoader } from './assetLoader.js';
import { ModelCache } from './modelCache.js';
import { LodManager, LOD_SCALE } from './lodManager.js';
import { setAnisotropy } from './materialLibrary.js';
import { loadPbrPack, hasPbr } from './pbrPack.js';
import { resetSurfaceMaterials } from './textures.js';

class Visuals {
  constructor() {
    this.assets = new AssetManager();
    this.loader = null;
    this.cache = null;
    this.lod = new LodManager();
    this.ready = false;
  }

  async init(renderer) {
    const ok = await this.assets.init();
    if (!ok) return false;
    this.loader = new AssetLoader(renderer, this.assets.decoderBase);
    this.cache = new ModelCache(this.loader, this.assets);
    this.ready = true;
    return true;
  }

  // Nạp trước mọi model được gắn (binding) cho súng và nhân vật. Lỗi từng file chỉ làm file đó dùng fallback.
  async preload(onProgress = null) {
    if (!this.ready) return;
    const b = this.assets.bindings;
    const ids = [...Object.values(b.weapons || {}), ...Object.values(b.characters || {}).flat()];
    let n = 0;
    await Promise.all(ids.map((id) => this.cache.load(id).then(() => { n++; if (onProgress) onProgress(n / Math.max(1, ids.length)); })));
  }

  // Nạp texture PBR chất lượng cao (nếu có gói). Trả về true nếu có loại nào được nạp (khi đó cần dựng lại bản đồ).
  async loadTextures(onProgress = null) {
    if (!this.ready) return false;
    const b = this.assets.bindings.textures;
    if (!b || !Object.keys(b).length) return false;
    const n = await loadPbrPack(this.assets, b, onProgress);
    if (n > 0) resetSurfaceMaterials();
    return n > 0;
  }

  get hasTextures() { return hasPbr(); }

  has(id) { return !!this.cache && this.cache.has(id); }
  instantiate(id) { return this.cache ? this.cache.instantiate(id) : null; }

  // Model súng GLB: nòng hướng -Z, gốc ở thân súng. Node rỗng "Muzzle" và "Eject" cho vị trí nòng/cửa thoát vỏ đạn.
  weaponModel(weaponId) {
    const aid = this.assets.bindings.weapons && this.assets.bindings.weapons[weaponId];
    if (!aid || !this.has(aid)) return null;
    const inst = this.instantiate(aid);
    const obj = inst.object;
    obj.updateMatrixWorld(true);
    const find = (re) => { let f = null; obj.traverse((o) => { if (!f && re.test(o.name)) f = o; }); return f; };
    const at = (n) => (n ? n.getWorldPosition(new THREE.Vector3()) : null);
    const box = new THREE.Box3().setFromObject(obj);
    const group = new THREE.Group();
    group.add(obj);
    return {
      group,
      muzzle: at(find(/^muzzle/i)) || new THREE.Vector3(0, 0.01, box.min.z),
      eject: at(find(/^eject/i)) || new THREE.Vector3(0.04, 0.02, 0),
      len: box.max.z - box.min.z,
    };
  }

  // Áp mức đồ họa hiện tại: anisotropy và hệ số khoảng cách LOD.
  applyQuality(eff) {
    setAnisotropy(eff.aniso || 4);
    this.lod.setScale(LOD_SCALE[Math.max(0, Math.min(3, eff.fx | 0))]);
  }
}

export const visuals = new Visuals();

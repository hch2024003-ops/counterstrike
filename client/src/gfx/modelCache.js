// Bộ nhớ đệm model theo asset id: không tải trùng, nhân bản đúng cách (kể cả skeleton), đếm tham chiếu, giải phóng an toàn.
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { prepare, forget } from './materialLibrary.js';
import { disposeObject } from './assetLoader.js';

export class ModelCache {
  constructor(loader, assets) {
    this.loader = loader;
    this.assets = assets;
    this.map = new Map(); // id -> { state, promise, gltf, refs }
  }

  // Tải một lần duy nhất dù nhiều nơi gọi cùng lúc. Lỗi => null (người gọi dùng fallback).
  load(id, { onProgress = null, grime = false, castShadow = true } = {}) {
    let e = this.map.get(id);
    if (e) return e.promise;
    const url = this.assets.url(id);
    if (!url) return Promise.resolve(null);
    e = { state: 'loading', gltf: null, refs: 0, promise: null };
    e.promise = this.loader.load(url, { onProgress })
      .then((g) => {
        prepare(g.scene, { grime, castShadow });
        e.gltf = g;
        e.state = 'ready';
        return g;
      })
      .catch((err) => {
        e.state = 'error';
        e.error = err;
        console.warn('[assets] không nạp được', id, err.message);
        return null;
      });
    this.map.set(id, e);
    return e.promise;
  }

  has(id) {
    const e = this.map.get(id);
    return !!e && e.state === 'ready';
  }

  // Bản sao dùng được ngay (đồng bộ). Chia sẻ geometry/material/texture với bản gốc; skeleton được nhân bản riêng.
  instantiate(id) {
    const e = this.map.get(id);
    if (!e || e.state !== 'ready') return null;
    let skinned = false;
    e.gltf.scene.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
    const object = skinned ? cloneSkinned(e.gltf.scene) : e.gltf.scene.clone(true);
    e.refs++;
    return { id, object, animations: e.gltf.animations || [] };
  }

  // Chỉ gỡ bản sao khỏi cảnh; KHÔNG dispose material/texture dùng chung.
  release(inst) {
    if (!inst) return;
    const e = this.map.get(inst.id);
    if (e && e.refs > 0) e.refs--;
    if (inst.object && inst.object.parent) inst.object.parent.remove(inst.object);
  }

  // Giải phóng hẳn model khi không còn ai dùng (ví dụ đổi bản đồ).
  evict(id) {
    const e = this.map.get(id);
    if (!e || e.refs > 0 || !e.gltf) return false;
    forget(e.gltf.scene);
    disposeObject(e.gltf.scene);
    this.map.delete(id);
    return true;
  }

  clear() {
    for (const id of [...this.map.keys()]) { const e = this.map.get(id); if (e) e.refs = 0; this.evict(id); }
  }

  stats() {
    let ready = 0; let refs = 0;
    for (const e of this.map.values()) { if (e.state === 'ready') ready++; refs += e.refs; }
    return { models: this.map.size, ready, refs };
  }
}

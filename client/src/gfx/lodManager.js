// LOD theo khoảng cách camera; khoảng cách nhân với hệ số theo mức đồ họa (thấp: chuyển model đơn giản sớm hơn).
import * as THREE from 'three';

export const LOD_SCALE = [0.6, 0.85, 1.0, 1.3]; // tương ứng mức hiệu ứng 0..3

export class LodManager {
  constructor() {
    this.scale = 1;
    this.items = new Set(); // { lod, base: [..] }
  }

  // levels: [{ object, distance }] sắp theo distance tăng dần (level đầu = gần nhất, distance 0).
  create(levels) {
    const lod = new THREE.LOD();
    const base = [];
    for (const l of levels) { lod.addLevel(l.object, l.distance * this.scale); base.push(l.distance); }
    this.items.add({ lod, base });
    return lod;
  }

  setScale(s) {
    this.scale = s;
    for (const it of this.items) it.lod.levels.forEach((lv, i) => { lv.distance = it.base[i] * s; });
  }

  remove(lod) {
    for (const it of this.items) if (it.lod === lod) this.items.delete(it);
  }
}

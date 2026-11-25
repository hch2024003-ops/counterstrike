// Hiệu ứng không khí theo bản đồ, bám quanh camera: cát bay (sa mạc), cánh hoa rơi (Hồ Gươm), sương mù trôi (núi, cầu), mưa phùn (cầu).
// Dùng một Points/LineSegments, không tạo vật thể mới mỗi khung hình. Tắt khi mức hiệu ứng thấp.
import * as THREE from 'three';
import { glowSprite } from './textures.js';

const R = 16; // nửa cạnh vùng hiệu ứng quanh camera
const H = 12; // chiều cao vùng hiệu ứng

const KINDS = {
  // n: số hạt; v: vận tốc cơ bản; jit: dao động ngẫu nhiên; size/color/opacity: hiển thị
  sand: { n: 420, v: [7, 0.1, 2.2], jit: 1.2, size: 0.07, color: '#e8cf9a', opacity: 0.55, add: false },
  petals: { n: 110, v: [0.7, -0.85, 0.3], jit: 0.35, size: 0.16, color: '#e46a5a', opacity: 0.9, add: false, sway: 1.2 },
  mist: { n: 70, v: [0.5, 0, 0.25], jit: 0.15, size: 3.2, color: '#dfe5e8', opacity: 0.1, add: false },
  rain: { n: 520, v: [1.6, -17, 0.4], jit: 1.5, line: true, color: '#cdd8e2', opacity: 0.35 },
};

export class AmbientFx {
  constructor(scene, kinds) {
    this.scene = scene;
    this.objs = [];
    this.visible = true;
    for (const k of kinds || []) {
      const spec = KINDS[k];
      if (spec) this.objs.push(this.make(spec));
    }
  }

  make(spec) {
    const n = spec.n;
    const pos = new Float32Array(n * (spec.line ? 6 : 3));
    const vel = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    const base = new Float32Array(n * 3); // vị trí hạt (với mưa: đầu trên của vệt)
    for (let i = 0; i < n; i++) {
      base[i * 3] = (Math.random() * 2 - 1) * R;
      base[i * 3 + 1] = Math.random() * H;
      base[i * 3 + 2] = (Math.random() * 2 - 1) * R;
      for (let c = 0; c < 3; c++) vel[i * 3 + c] = spec.v[c] + (Math.random() - 0.5) * 2 * spec.jit;
      phase[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    let obj;
    if (spec.line) {
      obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity, depthWrite: false }));
    } else {
      obj = new THREE.Points(geo, new THREE.PointsMaterial({
        map: glowSprite(64), size: spec.size, color: spec.color, transparent: true, opacity: spec.opacity, depthWrite: false,
        sizeAttenuation: true, blending: spec.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
    }
    obj.frustumCulled = false;
    this.scene.add(obj);
    return { spec, obj, pos, vel, base, phase, t: 0 };
  }

  setVisible(on) {
    this.visible = on;
    for (const o of this.objs) o.obj.visible = on;
  }

  update(dt, cam) {
    if (!this.visible) return;
    for (const o of this.objs) {
      const { spec, base, vel, pos, phase } = o;
      o.t += dt;
      const n = spec.n;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        base[k] += vel[k] * dt + (spec.sway ? Math.sin(o.t * 1.3 + phase[i]) * spec.sway * dt : 0);
        base[k + 1] += vel[k + 1] * dt;
        base[k + 2] += vel[k + 2] * dt;
        // Tuần hoàn quanh camera để lúc nào cũng có hạt xung quanh
        if (base[k + 1] < 0) base[k + 1] += H; else if (base[k + 1] > H) base[k + 1] -= H;
        for (const c of [0, 2]) {
          const ref = c === 0 ? cam.x : cam.z;
          const rel = base[k + c] - ref;
          if (rel > R) base[k + c] -= 2 * R; else if (rel < -R) base[k + c] += 2 * R;
        }
        if (spec.line) {
          const s = i * 6;
          pos[s] = base[k]; pos[s + 1] = base[k + 1]; pos[s + 2] = base[k + 2];
          pos[s + 3] = base[k] - vel[k] * 0.035; pos[s + 4] = base[k + 1] - vel[k + 1] * 0.035; pos[s + 5] = base[k + 2] - vel[k + 2] * 0.035;
        } else {
          pos[k] = base[k]; pos[k + 1] = base[k + 1]; pos[k + 2] = base[k + 2];
        }
      }
      o.obj.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    for (const o of this.objs) {
      this.scene.remove(o.obj);
      o.obj.geometry.dispose();
      o.obj.material.dispose();
    }
    this.objs = [];
  }
}

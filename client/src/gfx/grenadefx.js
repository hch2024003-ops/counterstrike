// Hiệu ứng lựu đạn: quả đang bay (nội suy từ snapshot), nổ (cầu lửa, khói đen, tia lửa), bom khói (đám mây dày che tầm nhìn).
// Khói chỉ che tầm nhìn bằng hình ảnh; đạn vẫn bay xuyên khói (giống bom khói ngoài đời).
import * as THREE from 'three';

function softTexture(noise) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  if (noise) { // vân nhẹ để cụm khói không giống đĩa tròn
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
      g.beginPath();
      g.arc(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 14, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAX_SMOKE = 3; // số bom khói tối đa tồn tại cùng lúc (tối ưu hiệu năng)

export class GrenadeFx {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.tex = softTexture(true);
    this.glow = softTexture(false);
    this.nades = new Map(); // id -> { mesh, target }
    this.smokes = [];
    this.booms = [];
    this.fragGeo = new THREE.SphereGeometry(0.06, 10, 8);
    this.smokeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10);
    this.fragMat = new THREE.MeshStandardMaterial({ color: 0x3d4a32, roughness: 0.6, metalness: 0.3 });
    this.smokeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.4 });
    this.puffs = 22; // số cụm khói mỗi bom; giảm khi mức hiệu ứng thấp

    // Đường ngắm quỹ đạo khi giữ phím ném: một đường gấp khúc + vòng đánh dấu chỗ rơi
    this.pathN = 64;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pathN * 3), 3));
    this.pathLine = new THREE.Line(pg, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, depthTest: false }));
    this.pathLine.frustumCulled = false;
    this.pathLine.renderOrder = 20;
    this.pathLine.visible = false;
    this.scene.add(this.pathLine);
    this.pathRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    this.pathRing.rotation.x = -Math.PI / 2;
    this.pathRing.renderOrder = 20;
    this.pathRing.visible = false;
    this.scene.add(this.pathRing);
  }

  // pts: [[x,y,z],...] quỹ đạo dự đoán; kind: 'frag' | 'smoke' (đổi màu)
  showPath(pts, kind) {
    const arr = this.pathLine.geometry.attributes.position.array;
    const n = Math.min(this.pathN, pts.length);
    for (let i = 0; i < this.pathN; i++) {
      const p = pts[Math.min(i, n - 1)];
      arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2];
    }
    this.pathLine.geometry.attributes.position.needsUpdate = true;
    const col = kind === 'smoke' ? 0xbfe3ff : 0xffe27a;
    this.pathLine.material.color.setHex(col);
    this.pathRing.material.color.setHex(col);
    this.pathLine.visible = true;
    const e = pts[pts.length - 1];
    this.pathRing.position.set(e[0], Math.max(0.03, e[1] - 0.1), e[2]);
    this.pathRing.visible = true;
  }

  hidePath() {
    this.pathLine.visible = false;
    this.pathRing.visible = false;
  }

  setQuality(fx) {
    this.puffs = fx >= 2 ? 22 : fx >= 1 ? 14 : 8;
  }

  // list: [[id, kind(0 frag/1 smoke), x, y, z], ...] từ snapshot
  setNades(list) {
    const seen = new Set();
    for (const [id, kind, x, y, z] of list || []) {
      seen.add(id);
      let n = this.nades.get(id);
      if (!n) {
        const mesh = new THREE.Mesh(kind ? this.smokeGeo : this.fragGeo, kind ? this.smokeMat : this.fragMat);
        mesh.castShadow = true;
        mesh.position.set(x, y, z);
        this.scene.add(mesh);
        n = { mesh, target: new THREE.Vector3(x, y, z) };
        this.nades.set(id, n);
      }
      n.target.set(x, y, z);
    }
    for (const [id, n] of this.nades) {
      if (!seen.has(id)) {
        this.scene.remove(n.mesh);
        this.nades.delete(id);
      }
    }
  }

  // Cầu lửa + khói đen + tia lửa. p: [x,y,z]
  boom(p) {
    const mk = (tex, color, additive) => {
      const m = new THREE.SpriteMaterial({
        map: tex, color, transparent: true, depthWrite: false, toneMapped: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const s = new THREE.Sprite(m);
      s.position.set(p[0], p[1] + 0.4, p[2]);
      this.scene.add(s);
      return s;
    };
    const flash = mk(this.glow, new THREE.Color(5, 3.2, 1.2), true);
    const parts = [{ s: flash, t: 0, life: 0.35, size0: 2, size1: 9, a0: 1, rise: 0 }];
    for (let i = 0; i < 9; i++) {
      const s = mk(this.tex, new THREE.Color(0.22, 0.2, 0.19), false);
      s.position.x += (Math.random() - 0.5) * 1.6;
      s.position.z += (Math.random() - 0.5) * 1.6;
      parts.push({ s, t: 0, life: 1.4 + Math.random() * 0.8, size0: 1.2, size1: 4.5 + Math.random() * 2, a0: 0.75, rise: 1 + Math.random() });
    }
    this.booms.push(parts);
    if (this.fx) this.fx.burst(p, [0, 1, 0], 36, [3.4, 2.0, 0.7], 12);
  }

  // Bom khói nổ tại p, tồn tại ms mili giây.
  smoke(id, p, ms) {
    if (this.smokes.length >= MAX_SMOKE) this.removeSmoke(this.smokes.shift());
    const sprites = [];
    const bigger = 22 / this.puffs; // ít cụm hơn thì mỗi cụm to hơn để vẫn che kín
    for (let i = 0; i < this.puffs; i++) {
      const m = new THREE.SpriteMaterial({
        map: this.tex, color: new THREE.Color(0.66, 0.68, 0.7).multiplyScalar(0.85 + Math.random() * 0.25),
        transparent: true, depthWrite: false, opacity: 0, toneMapped: false,
      });
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 2.4;
      const base = new THREE.Vector3(p[0] + Math.cos(a) * r, p[1] + 0.3 + Math.random() * 3.2, p[2] + Math.sin(a) * r);
      s.position.copy(base);
      const size = (2.6 + Math.random() * 1.8) * Math.sqrt(bigger);
      s.scale.setScalar(size * 0.3);
      m.rotation = Math.random() * 6.28;
      this.scene.add(s);
      sprites.push({ s, base, size, phase: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.15 });
    }
    this.smokes.push({ id, sprites, t: 0, life: ms / 1000 });
  }

  removeSmoke(z) {
    for (const e of z.sprites) {
      this.scene.remove(e.s);
      e.s.material.dispose();
    }
  }

  update(dt) {
    const k = Math.min(1, dt * 14);
    for (const n of this.nades.values()) {
      n.mesh.position.lerp(n.target, k);
      n.mesh.rotation.x += dt * 9;
      n.mesh.rotation.z += dt * 5;
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const parts = this.booms[i];
      let alive = false;
      for (const e of parts) {
        e.t += dt;
        const u = Math.min(1, e.t / e.life);
        if (u >= 1) {
          if (e.s.parent) {
            this.scene.remove(e.s);
            e.s.material.dispose();
          }
          continue;
        }
        alive = true;
        const sz = e.size0 + (e.size1 - e.size0) * (1 - Math.pow(1 - u, 2));
        e.s.scale.setScalar(sz);
        e.s.material.opacity = e.a0 * (1 - u) * (u < 0.1 ? u / 0.1 : 1);
        e.s.position.y += e.rise * dt;
      }
      if (!alive) this.booms.splice(i, 1);
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const z = this.smokes[i];
      z.t += dt;
      const grow = Math.min(1, z.t / 1.6); // phình ra trong 1.6 giây
      const fade = Math.min(1, Math.max(0, (z.life - z.t) / 3)); // tan dần 3 giây cuối
      for (const e of z.sprites) {
        e.s.scale.setScalar(e.size * (0.3 + 0.7 * grow));
        e.s.material.opacity = 0.88 * grow * fade;
        e.s.material.rotation += e.spin * dt;
        e.s.position.set(
          e.base.x + Math.sin(z.t * 0.35 + e.phase) * 0.25,
          e.base.y + Math.sin(z.t * 0.5 + e.phase) * 0.15 + z.t * 0.02,
          e.base.z + Math.cos(z.t * 0.3 + e.phase) * 0.25,
        );
      }
      if (z.t >= z.life) {
        this.removeSmoke(z);
        this.smokes.splice(i, 1);
      }
    }
  }

  clear() {
    this.hidePath();
    for (const n of this.nades.values()) this.scene.remove(n.mesh);
    this.nades.clear();
    for (const z of this.smokes) this.removeSmoke(z);
    this.smokes.length = 0;
    for (const parts of this.booms) for (const e of parts) { this.scene.remove(e.s); e.s.material.dispose(); }
    this.booms.length = 0;
  }
}

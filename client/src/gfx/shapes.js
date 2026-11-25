// Bộ tạo hình dùng chung cho súng/nhân vật 0.5: cạnh vát bo, extrude theo profile, lathe, gộp theo vật liệu.
// Mọi hàm trả về BufferGeometry đã có position/normal/uv, sẵn sàng gộp bằng mergeAll().
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Hộp bo cạnh: w (x) × h (y) × d (z), r = bán kính bo (mét).
export function rbox(w, h, d, r = 0.004, x = 0, y = 0, z = 0) {
  const rr = Math.max(0.0005, Math.min(r, w * 0.45, h * 0.45, d * 0.45));
  const hw = w / 2 - rr;
  const hh = h / 2 - rr;
  const s = new THREE.Shape();
  s.moveTo(-hw, -hh);
  s.lineTo(hw, -hh);
  s.lineTo(hw, hh);
  s.lineTo(-hw, hh);
  s.closePath();
  const depth = Math.max(0.0005, d - rr * 2);
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: rr, bevelSize: rr, bevelSegments: 3, curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.translate(x, y, z);
  return g;
}

// Extrude đa giác nhìn từ bên hông: pts = [[z, y], ...] (z âm là phía nòng), width = độ dày theo trục x.
export function side(pts, width, bevel = 0.003, x = 0) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  const b = Math.min(bevel, width * 0.4);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.0005, width - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.8,
    bevelSegments: 1, curveSegments: 6,
  });
  // shape x -> trục z của súng, shape y -> y, chiều extrude -> x
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 - b + x, 0, 0);
  return g;
}

// Trụ tròn nằm dọc trục Z. z0 -> z1 (z âm hướng nòng).
export function tubeZ(r0, r1, z0, z1, x = 0, y = 0, seg = 14) {
  const len = Math.abs(z1 - z0);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return g;
}

// Lathe quanh trục Y: prof = [[r, y], ...]
export function lathe(prof, seg = 14) {
  return new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), seg);
}

// Lathe quanh trục Z (cho nòng, ống giảm thanh, đầu giảm giật): prof = [[r, z], ...]
export function latheZ(prof, x = 0, y = 0, seg = 14) {
  const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, 0);
  return g;
}

// Ellipsoid (đầu, cơ bắp): bán kính rx, ry, rz.
export function ellipsoid(rx, ry, rz, x = 0, y = 0, z = 0, wSeg = 16, hSeg = 12) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

// Đoạn chi thon: nối hai điểm a -> b, bán kính ra và rb (giống cơ đùi/cẳng tay).
export function limb(a, b, ra, rb, seg = 10, squashZ = 1) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, false);
  g.scale(1, 1, squashZ);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function xform(g, { p = [0, 0, 0], r = [0, 0, 0], s = null } = {}) {
  if (s) g.scale(s[0], s[1], s[2]);
  g.rotateZ(r[2]);
  g.rotateY(r[1]);
  g.rotateX(r[0]);
  g.translate(p[0], p[1], p[2]);
  return g;
}

function uniformAttrs(g) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k);
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
}

export function mergeAll(geos) {
  const list = geos.map(uniformAttrs);
  const m = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  for (const g of geos) g.dispose();
  return m;
}

// parts: { tênVậtLiệu: [geometry...] }, mats: bảng vật liệu -> Group nhiều mesh (mỗi vật liệu một mesh).
export function buildGroup(parts, mats, { shadow = true } = {}) {
  const grp = new THREE.Group();
  for (const [name, geos] of Object.entries(parts)) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeAll(geos), mats[name]);
    mesh.castShadow = shadow;
    grp.add(mesh);
  }
  return grp;
}

// Texture nhiễu mờ dùng cho roughness/bump của kim loại, vải (tạo một lần, dùng chung).
const noiseCache = new Map();
export function noiseTexture(seed = 1, size = 128, lo = 150, hi = 255, repeat = 6) {
  const key = `${seed}:${size}:${lo}:${hi}:${repeat}`;
  if (noiseCache.has(key)) return noiseCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // nhiễu hai tầng cho vân mịn tự nhiên
    const v = lo + (hi - lo) * (0.6 * rnd() + 0.4 * rnd());
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  noiseCache.set(key, t);
  return t;
}

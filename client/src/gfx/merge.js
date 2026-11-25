// Gộp các mesh tĩnh cùng vật liệu thành một mesh để giảm draw call (CPU là nút thắt thường gặp của Three.js).
// Bỏ qua: InstancedMesh, ShaderMaterial, vật liệu trong suốt, mesh có renderOrder, và mesh đánh dấu userData.noMerge.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv'];

function slice(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const name of ATTRS) {
    const a = g.attributes[name];
    const arr = a.array.slice(start * a.itemSize, (start + count) * a.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

function mergeable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noMerge || o.renderOrder !== 0) return false;
  const g = o.geometry;
  if (!g || !ATTRS.every((n) => g.attributes[n])) return false;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  return mats.every((m) => !m.isShaderMaterial && !m.transparent && !m.isSpriteMaterial);
}

// cell: cạnh ô lưới (m). Mỗi ô một mesh gộp riêng, nên vùng ngoài tầm nhìn/ngoài vùng bóng bị bỏ qua.
export function mergeStaticMeshes(root, cell = 30) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const box = new THREE.Box3();
  const ctr = new THREE.Vector3();
  const removed = [];
  let before = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    before++;
    if (!mergeable(o)) return;
    const base = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    base.applyMatrix4(o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    box.setFromObject(o).getCenter(ctr);
    const cellKey = `${Math.floor(ctr.x / cell)},${Math.floor(ctr.z / cell)}`;
    const parts = o.geometry.groups.length && Array.isArray(o.material)
      ? o.geometry.groups.map((gr) => ({ mat: mats[gr.materialIndex], start: gr.start, count: gr.count }))
      : [{ mat: mats[0], start: 0, count: base.attributes.position.count }];
    for (const p of parts) {
      const key = `${p.mat.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${cellKey}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: p.mat, cast: o.castShadow, recv: o.receiveShadow, geos: [] }));
      b.geos.push(p.start === 0 && p.count === base.attributes.position.count ? base.clone() : slice(base, p.start, p.count));
    }
    base.dispose();
    removed.push(o);
  });
  for (const o of removed) {
    o.parent.remove(o);
    o.geometry.dispose();
  }
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!geo) continue;
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.name = 'merged';
    root.add(m);
  }
  return { before, after: buckets.size, removed: removed.length };
}

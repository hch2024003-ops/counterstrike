// Nhân vật dựng từ model GLB có rig: nhiều mức LOD (mỗi mức một skeleton riêng), hoạt cảnh theo tốc độ/trạng thái.
// Quy ước asset (bindings.characters.A/B = [lod0, lod1, ...]): node rỗng "WeaponSocket" (hoặc xương bàn tay phải) để gắn súng, xương "Spine" để nghiêng theo góc ngắm,
// clip: Idle, Walk, Run, Crouch_Idle, Crouch_Walk, Jump, Reload, Death. Vị trí/hitbox của server không đổi; model chỉ là hình ảnh.
import * as THREE from 'three';
import { visuals } from './visuals.js';
import { AnimationController } from './animationManager.js';

const DISTANCES = [0, 18, 40, 80];

function findFirst(root, re) {
  let f = null;
  root.traverse((o) => { if (!f && re.test(o.name)) f = o; });
  return f;
}

export function tryBuildGlbCharacter(team) {
  if (!visuals.ready) return null;
  const list = visuals.assets.bindings.characters && visuals.assets.bindings.characters[team];
  if (!list || !list.length || !visuals.has(list[0])) return null;

  const parts = [];
  const levels = [];
  list.forEach((id, i) => {
    if (!visuals.has(id)) return;
    const inst = visuals.instantiate(id);
    if (!inst) return;
    parts.push({ inst, ctrl: new AnimationController(inst.object, inst.animations), spine: findFirst(inst.object, /spine/i) });
    levels.push({ object: inst.object, distance: DISTANCES[Math.min(i, DISTANCES.length - 1)] });
  });
  if (!levels.length) return null;

  const root = new THREE.Group();
  const lod = levels.length > 1 ? visuals.lod.create(levels) : null;
  root.add(lod || levels[0].object);
  const first = parts[0].inst.object;
  const socket = findFirst(first, /^weaponsocket$/i) || findFirst(first, /(hand.?r|right.?hand|hand_r)/i) || root;

  return {
    root,
    socket,
    update(dt, speed, pitch, airborne, crouch = false, dead = false) {
      for (const p of parts) {
        if (lod && p.inst.object.visible === false) continue; // chỉ cập nhật mức LOD đang hiện
        p.ctrl.setLocomotion({ speed, airborne, crouch, dead });
        p.ctrl.update(dt);
        if (p.spine) p.spine.rotation.x += pitch * 0.5; // nghiêng thân theo góc ngắm, cộng lên hoạt cảnh
      }
    },
    dispose() {
      if (lod) visuals.lod.remove(lod);
      for (const p of parts) { p.ctrl.dispose(); visuals.cache.release(p.inst); }
    },
  };
}

// Nhân vật 0.5 "Modern Tactical Realism": tỷ lệ người thật, cơ chi thon, mũ chiến thuật + kính, áo giáp có túi đạn,
// balo, găng, ủng. Hai phe khác trang phục rõ (A: cát/đất, B: xám xanh đậm) và đều có dải nhận diện màu đội.
// Giữ nguyên API cũ (Character, makeCorpse, updateCorpse) nên world.js không cần sửa.
// Hình học dựng một lần cho mỗi phe rồi chia sẻ giữa mọi nhân vật (tiết kiệm bộ nhớ, ít draw call).
import * as THREE from 'three';
import { TEAM_COLORS } from '../config.js';
import { buildGun, GUN_MAT } from './guns.js';
import { rbox, limb, ellipsoid, mergeAll, noiseTexture, xform } from './shapes.js';
import { tryBuildGlbCharacter } from './glbCharacter.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const fabricRough = noiseTexture(21, 128, 170, 255, 3);

const PALETTE = {
  A: { uniform: 0x7b6d52, vest: 0x5c5340, pouch: 0x4d4636, helmet: 0x6b5f47, boot: 0x2b241c, face: 'goggles', accent: 0xc4503e },
  B: { uniform: 0x3d4650, vest: 0x24282d, pouch: 0x1b1e22, helmet: 0x2b3036, boot: 0x16181b, face: 'mask', accent: 0x3f7bc0 },
};

const mats = new Map();
function teamMats(team) {
  if (mats.has(team)) return mats.get(team);
  const p = PALETTE[team] || PALETTE.A;
  const accent = new THREE.Color(TEAM_COLORS[team] || p.accent).lerp(new THREE.Color(p.accent), 0.5);
  // Vải: lớp sheen (ánh mờ ở rìa) giúp áo/quần giống vải thật thay vì nhựa mờ.
  const fab = (c, r = 0.95) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, metalness: 0, roughnessMap: fabricRough, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x9a9a92) });
  const m = {
    uniform: fab(p.uniform),
    vest: fab(p.vest, 0.88),
    pouch: fab(p.pouch, 0.9),
    helmet: new THREE.MeshStandardMaterial({ color: p.helmet, roughness: 0.55, metalness: 0.08, roughnessMap: fabricRough }),
    boot: new THREE.MeshStandardMaterial({ color: p.boot, roughness: 0.7, metalness: 0.02 }),
    mask: fab(0x15171a, 0.95),
    // Dải nhận diện đội: mờ, hơi sáng để dễ thấy nhưng không phát sáng
    team: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7, metalness: 0, emissive: accent.clone().multiplyScalar(0.12) }),
    skin: GUN_MAT.skin,
    glove: GUN_MAT.glove,
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1116, roughness: 0.05, metalness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.45, metalness: 0.85 }),
  };
  mats.set(team, m);
  return m;
}

// Cache hình học đã gộp: key -> { matName: BufferGeometry }
const geoCache = new Map();
function part(key, team, build, shadow = true) {
  const ck = `${team}:${key}`;
  let entry = geoCache.get(ck);
  if (!entry) {
    const parts = build();
    entry = {};
    for (const [name, geos] of Object.entries(parts)) if (geos.length) entry[name] = mergeAll(geos);
    geoCache.set(ck, entry);
  }
  const m = teamMats(team);
  const g = new THREE.Group();
  for (const [name, geo] of Object.entries(entry)) {
    const mesh = new THREE.Mesh(geo, m[name]);
    mesh.castShadow = shadow;
    g.add(mesh);
  }
  return g;
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Khuỷu tay theo IK hai xương: vai s, tay h, chiều dài l1/l2, hint = hướng khuỷu gập ra.
function elbow(s, h, l1, l2, hint) {
  const S = V(s);
  const H = V(h);
  const d = Math.min(S.distanceTo(H), l1 + l2 - 0.002);
  const dir = H.clone().sub(S).normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const hv = V(hint);
  const perp = hv.sub(dir.clone().multiplyScalar(hv.dot(dir))).normalize();
  return S.clone().add(dir.multiplyScalar(a)).add(perp.multiplyScalar(hh)).toArray();
}

// Tay cầm súng: vai -> khuỷu -> bàn tay (găng) cho từng loại súng. Toạ độ trong nhóm arms.
const HOLD = {
  1: { r: [0.12, -0.15, -0.165], l: [0.105, -0.085, -0.56] }, // súng trường
  2: { r: [0.12, -0.13, -0.215], l: [0.1, -0.135, -0.205] }, // súng lục
  3: { r: [0.12, -0.145, -0.17], l: [0.105, -0.1, -0.6] }, // shotgun
  4: { r: [0.12, -0.15, -0.165], l: [0.105, -0.085, -0.56] }, // AK
  5: { r: [0.12, -0.145, -0.17], l: [0.105, -0.09, -0.48] }, // tiểu liên
  6: { r: [0.12, -0.15, -0.165], l: [0.105, -0.08, -0.62] }, // bắn tỉa
  7: { r: [0.12, -0.15, -0.165], l: [0.105, -0.12, -0.5] }, // đại liên
  8: { r: [0.12, -0.13, -0.215], l: [0.095, -0.135, -0.205] }, // Desert Eagle
  9: { r: [0.12, -0.145, -0.17], l: [0.105, -0.1, -0.55] }, // shotgun tự động
};

function armsFor(team, slot) {
  return part(`arms${slot}`, team, () => {
    const P = { uniform: [], glove: [], vest: [], team: [] };
    const hold = HOLD[slot];
    for (const sx of [1, -1]) {
      const hand = sx > 0 ? hold.r : hold.l;
      const shoulder = [sx * 0.2, 0.02, 0.02];
      const el = elbow(shoulder, hand, 0.29, 0.27, [sx * 0.8, -1, 0.15]);
      P.uniform.push(ellipsoid(0.058, 0.062, 0.062, shoulder[0], shoulder[1], shoulder[2], 12, 8)); // vai
      P.uniform.push(limb(shoulder, el, 0.055, 0.046, 10));
      P.uniform.push(limb(el, [el[0] * 0.2 + hand[0] * 0.8, el[1] * 0.2 + hand[1] * 0.8, el[2] * 0.2 + hand[2] * 0.8], 0.047, 0.036, 10));
      P.uniform.push(ellipsoid(0.05, 0.05, 0.05, el[0], el[1], el[2], 10, 8)); // khuỷu
      // Găng + ngón: bàn tay chính + cụm ngón nắm
      const hp = V(hand);
      const palm = rbox(0.052, 0.036, 0.075, 0.01, hp.x, hp.y, hp.z);
      P.glove.push(palm);
      P.glove.push(rbox(0.05, 0.018, 0.034, 0.007, hp.x + sx * 0.006, hp.y - 0.022, hp.z - 0.036));
      P.glove.push(limb([hp.x - sx * 0.02, hp.y + 0.006, hp.z + 0.02], [hp.x - sx * 0.03, hp.y + 0.02, hp.z - 0.04], 0.011, 0.009, 6)); // ngón cái
      if (sx > 0) P.team.push(rbox(0.012, 0.06, 0.07, 0.003, el[0] * 0.4 + shoulder[0] * 0.6 + 0.045, (el[1] + shoulder[1]) / 2, (el[2] + shoulder[2]) / 2)); // băng tay đội
    }
    return P;
  });
}

function legPart(team, side) {
  return part(`thigh${side}`, team, () => {
    const P = { uniform: [], vest: [], pouch: [], metal: [] };
    P.uniform.push(limb([0, 0.02, 0], [0, -0.43, 0.01], 0.092, 0.066, 12));
    P.uniform.push(ellipsoid(0.095, 0.1, 0.1, 0, 0.0, 0, 12, 8)); // mông/đùi trên
    P.pouch.push(rbox(0.03, 0.15, 0.1, 0.012, side * 0.085, -0.2, 0.0)); // túi hông
    P.vest.push(ellipsoid(0.058, 0.07, 0.05, 0, -0.43, -0.05, 10, 8)); // đầu gối đệm
    if (side > 0) P.pouch.push(rbox(0.04, 0.17, 0.09, 0.012, 0.09, -0.16, 0.02)); // bao súng ngắn
    return P;
  });
}

function shinPart(team) {
  return part('shin', team, () => {
    const P = { uniform: [], boot: [], metal: [] };
    P.uniform.push(limb([0, 0.0, 0.0], [0, -0.38, 0.0], 0.066, 0.05, 12));
    P.boot.push(limb([0, -0.28, 0], [0, -0.43, 0], 0.058, 0.056, 12)); // cổ ủng
    P.boot.push(rbox(0.105, 0.075, 0.265, 0.025, 0, -0.455, -0.05)); // mũi + thân ủng
    P.boot.push(rbox(0.1, 0.05, 0.1, 0.02, 0, -0.43, 0.05)); // gót
    P.boot.push(rbox(0.108, 0.025, 0.285, 0.008, 0, -0.485, -0.055)); // đế
    return P;
  });
}

function torsoPart(team) {
  return part('torso', team, () => {
    const P = { uniform: [], vest: [], pouch: [], team: [], metal: [] };
    // Thân áo + hông + thắt lưng
    P.uniform.push(rbox(0.4, 0.46, 0.23, 0.07, 0, 0.0, 0));
    P.uniform.push(rbox(0.35, 0.2, 0.22, 0.06, 0, -0.27, 0));
    P.uniform.push(ellipsoid(0.09, 0.07, 0.095, 0, 0.26, 0, 12, 8)); // gốc cổ
    P.vest.push(rbox(0.37, 0.05, 0.25, 0.015, 0, -0.18, 0)); // thắt lưng chiến thuật
    P.metal.push(rbox(0.05, 0.036, 0.02, 0.006, 0, -0.18, -0.13));
    // Áo giáp: tấm trước/sau, vai, nẹp bên
    P.vest.push(rbox(0.385, 0.42, 0.075, 0.03, 0, 0.02, -0.13));
    P.vest.push(rbox(0.38, 0.4, 0.07, 0.03, 0, 0.02, 0.125));
    P.vest.push(rbox(0.065, 0.12, 0.26, 0.02, -0.2, 0.2, 0));
    P.vest.push(rbox(0.065, 0.12, 0.26, 0.02, 0.2, 0.2, 0));
    P.vest.push(rbox(0.05, 0.3, 0.2, 0.02, -0.2, -0.03, 0)); // cummerbund bên
    P.vest.push(rbox(0.05, 0.3, 0.2, 0.02, 0.2, -0.03, 0));
    // Túi đạn ngực (3 túi có nắp) + túi dụng cụ
    for (const x of [-0.115, 0, 0.115]) {
      P.pouch.push(rbox(0.1, 0.14, 0.05, 0.012, x, -0.04, -0.19));
      P.vest.push(rbox(0.1, 0.035, 0.054, 0.01, x, 0.02, -0.19)); // nắp túi
    }
    P.pouch.push(rbox(0.12, 0.09, 0.05, 0.012, 0.12, -0.17, -0.18));
    // Bảng nhận diện đội (nhỏ, mờ) ở ngực trái + vai
    P.team.push(rbox(0.075, 0.045, 0.01, 0.004, -0.11, 0.14, -0.172));
    P.team.push(rbox(0.05, 0.03, 0.012, 0.004, -0.2, 0.26, 0.0));
    P.team.push(rbox(0.05, 0.03, 0.012, 0.004, 0.2, 0.26, 0.0));
    // Balo tấn công + cuộn chăn + dây
    P.pouch.push(rbox(0.3, 0.38, 0.13, 0.04, 0, 0.02, 0.22));
    P.pouch.push(rbox(0.22, 0.14, 0.09, 0.03, 0, -0.08, 0.31));
    P.uniform.push(limb([-0.12, 0.25, 0.26], [0.12, 0.25, 0.26], 0.05, 0.05, 10));
    P.metal.push(rbox(0.03, 0.02, 0.02, 0.004, 0, 0.0, 0.29));
    return P;
  });
}

function headPart(team) {
  const p = PALETTE[team] || PALETTE.A;
  return part('head', team, () => {
    const P = { skin: [], helmet: [], mask: [], glass: [], team: [], pouch: [], metal: [], vest: [] };
    // Cổ + đầu (mặt thon, mũi, cằm)
    P.skin.push(limb([0, -0.16, 0.0], [0, -0.01, 0.0], 0.052, 0.045, 10));
    const face = p.face === 'mask' ? P.mask : P.skin;
    face.push(ellipsoid(0.083, 0.108, 0.097, 0, 0.045, -0.005, 18, 14));
    face.push(ellipsoid(0.05, 0.05, 0.06, 0, -0.03, -0.03, 12, 8)); // hàm + cằm
    face.push(ellipsoid(0.014, 0.026, 0.02, 0, 0.03, -0.1, 8, 6)); // sống mũi
    P.skin.push(ellipsoid(0.014, 0.025, 0.012, -0.085, 0.04, 0.0, 6, 6)); // tai
    P.skin.push(ellipsoid(0.014, 0.025, 0.012, 0.085, 0.04, 0.0, 6, 6));
    // Mũ bảo hộ kiểu ACH: vỏ nửa cầu + vành trước/sau + ray hông + ngàm NVG
    const shell = new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
    shell.scale(0.125, 0.118, 0.15);
    xform(shell, { p: [0, 0.07, 0.005], r: [-0.08, 0, 0] });
    P.helmet.push(shell);
    P.helmet.push(rbox(0.2, 0.014, 0.05, 0.006, 0, 0.088, -0.12)); // vành trước
    P.helmet.push(rbox(0.19, 0.016, 0.06, 0.006, 0, 0.04, 0.125)); // vành sau (gáy)
    P.helmet.push(rbox(0.02, 0.05, 0.1, 0.006, -0.123, 0.07, 0.0)); // ray hông
    P.helmet.push(rbox(0.02, 0.05, 0.1, 0.006, 0.123, 0.07, 0.0));
    P.metal.push(rbox(0.05, 0.04, 0.02, 0.006, 0, 0.115, -0.12)); // ngàm NVG
    P.team.push(rbox(0.1, 0.022, 0.012, 0.004, 0, 0.145, -0.13)); // dải đội trước mũ
    P.pouch.push(rbox(0.1, 0.045, 0.045, 0.012, 0, 0.1, 0.14)); // túi đối trọng sau mũ
    P.vest.push(rbox(0.015, 0.02, 0.08, 0.004, 0, 0.0, -0.01)); // quai cằm (đơn giản)
    // Phe A: kính chiến thuật đeo mắt; phe B: balaclava + kính cao
    P.glass.push(rbox(0.172, 0.05, 0.034, 0.014, 0, 0.065, -0.093));
    P.vest.push(rbox(0.188, 0.012, 0.1, 0.004, 0, 0.065, -0.045)); // dây kính ôm đầu
    // Tai nghe liên lạc
    P.vest.push(ellipsoid(0.02, 0.05, 0.05, -0.095, 0.045, 0.01, 8, 8));
    P.vest.push(ellipsoid(0.02, 0.05, 0.05, 0.095, 0.045, 0.01, 8, 8));
    return P;
  });
}

function makeNameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.font = 'bold 34px Segoe UI, Arial, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.strokeText(name, 128, 44);
    g.fillStyle = color;
    g.fillText(name, 128, 44);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  sp.scale.set(1.5, 0.375, 1);
  sp.position.y = 2.2;
  sp.renderOrder = 10;
  return sp;
}

// Mẫu súng dùng chung (clone nhẹ vì geometry/vật liệu được chia sẻ).
const SLOT_ID = { 1: 'rifle', 2: 'pistol', 3: 'shotgun', 4: 'ak', 5: 'smg', 6: 'sniper', 7: 'lmg', 8: 'deagle', 9: 'autoshotgun' };
const gunCache = {};
function gunFor(id) {
  if (!gunCache[id]) gunCache[id] = buildGun(id);
  return gunCache[id];
}

export class Character {
  constructor(name, team, showName) {
    this.team = team;
    this.group = new THREE.Group();
    this.phase = Math.random() * 6;
    this.slot = 1;
    this.lean = 0;

    // Model GLB (nếu thư viện tài nguyên có) hoặc nhân vật dựng bằng code (fallback)
    this.glb = tryBuildGlbCharacter(team);
    if (this.glb) {
      this.group.add(this.glb.root);
      this.legs = [];
      this.torso = new THREE.Group();
      this.head = new THREE.Group();
      this.arms = new THREE.Group();
      this.gunHolder = new THREE.Group();
      this.glb.socket.add(this.gunHolder);
    } else {
    // Chân: pivot ở hông, đầu gối gập khi bước
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.1, 0.92, 0);
      hip.add(legPart(team, sx));
      const knee = new THREE.Group();
      knee.position.set(0, -0.43, 0.01);
      knee.add(shinPart(team));
      hip.add(knee);
      this.group.add(hip);
      this.legs.push({ hip, knee });
    }

    this.torso = new THREE.Group();
    this.torso.position.set(0, 1.2, 0);
    this.torso.add(torsoPart(team));
    this.group.add(this.torso);

    this.head = new THREE.Group();
    this.head.position.set(0, 1.62, 0);
    this.head.add(headPart(team));
    this.group.add(this.head);

    // Tay + súng: nhóm xoay theo góc ngắm. Mỗi loại súng có bộ tay riêng (tư thế cầm đúng).
    this.arms = new THREE.Group();
    this.arms.position.set(0, 1.4, 0);
    this.group.add(this.arms);
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.12, -0.06, -0.28);
    this.arms.add(this.gunHolder);
    }

    this.guns = {};
    this.armSets = {};
    this.ensureSlot(1);
    this.guns[1].visible = true;
    if (this.armSets[1]) this.armSets[1].visible = true;

    if (showName) {
      this.label = makeNameSprite(name, TEAM_COLORS[team] || '#ffffff');
      this.group.add(this.label);
    }
    this.group.visible = false;
  }

  // Dựng súng + tay cho một kiểu dáng khi cần lần đầu (tránh dựng sẵn cả 9 bộ cho mỗi nhân vật).
  ensureSlot(slot) {
    if (this.guns[slot]) return;
    const id = SLOT_ID[slot];
    if (!id) return;
    const g = gunFor(id).group.clone();
    g.visible = false;
    g.traverse((x) => { x.castShadow = false; }); // súng nhỏ, không cần đổ bóng
    this.gunHolder.add(g);
    this.guns[slot] = g;
    if (!this.glb) { // model GLB tự có tay; nhân vật dựng bằng code cần bộ tay riêng cho từng súng
      const a = armsFor(this.team, slot);
      a.visible = false;
      this.arms.add(a);
      this.armSets[slot] = a;
    }
  }

  setSlot(slot) {
    if (slot === this.slot) return;
    this.ensureSlot(slot);
    this.slot = slot;
    for (const [s, g] of Object.entries(this.guns)) g.visible = Number(s) === slot;
    for (const [s, a] of Object.entries(this.armSets)) a.visible = Number(s) === slot;
  }

  // speed: m/s mặt phẳng ngang (từ nội suy). airborne: đang nhảy.
  animate(dt, speed, pitch, airborne) {
    if (this.glb) { this.glb.update(dt, speed, pitch, airborne); return; }
    const k = Math.min(speed / 5.6, 1);
    this.phase += dt * (3 + speed * 1.55);
    const sw = Math.sin(this.phase) * 0.8 * k;
    const air = airborne ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? sw : -sw;
      const leg = this.legs[i];
      leg.hip.rotation.x = air ? (i ? 0.55 : -0.45) : s;
      // đầu gối gập khi chân vung về trước/bắt đầu nhấc, thẳng khi chạm đất
      leg.knee.rotation.x = air ? 0.95 : Math.max(0, -s) * 1.25 + 0.04 * k;
    }
    // Thân nghiêng nhẹ về trước khi chạy, xoay nhịp theo bước, hạ thấp khi ở trên không
    const target = k * 0.1 + (air ? 0.04 : 0);
    this.lean += (target - this.lean) * Math.min(1, dt * 10);
    const bob = Math.abs(Math.cos(this.phase)) * 0.04 * k;
    this.torso.position.y = 1.2 + bob - (air ? 0.05 : 0);
    this.torso.rotation.x = this.lean;
    this.torso.rotation.y = Math.sin(this.phase) * 0.07 * k;
    this.torso.rotation.z = Math.sin(this.phase) * 0.025 * k;
    this.head.position.y = 1.62 + bob * 0.85;
    this.head.rotation.x = pitch * 0.8;
    this.arms.position.y = 1.4 + bob;
    this.arms.rotation.x = pitch;
    this.arms.rotation.y = -Math.sin(this.phase) * 0.03 * k;
  }

  dispose() {
    if (this.glb) this.glb.dispose();
    if (this.label) {
      this.label.material.map.dispose();
      this.label.material.dispose();
    }
  }
}

// Xác chết: giữ nguyên tư thế lúc ngã rồi đổ ngửa ra sau, nằm lại vài giây.
export function makeCorpse(character, x, y, z, yaw) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.y = yaw;
  const body = character.glb ? cloneSkinned(character.group) : character.group.clone(true);
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  body.visible = true;
  body.traverse((o) => {
    if (o.isSprite) o.visible = false;
  });
  pivot.add(body);
  return { pivot, body, t: 0, life: 7, side: Math.random() < 0.5 ? -1 : 1 };
}

export function updateCorpse(c, dt) {
  c.t += dt;
  const k = Math.min(c.t / 0.55, 1);
  const ease = 1 - Math.pow(1 - k, 3);
  c.body.rotation.x = ease * (Math.PI / 2 - 0.12);
  c.body.rotation.z = ease * 0.25 * c.side;
  c.body.position.y = ease * 0.12;
  if (c.t > c.life - 1) c.pivot.position.y -= dt * 0.25; // chìm xuống trước khi biến mất
  return c.t < c.life;
}

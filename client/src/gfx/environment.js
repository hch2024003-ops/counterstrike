// Dựng toàn bộ môi trường: mặt đất, các khối bản đồ có vật liệu thật, trang trí tường, đèn pha, đường chân trời,
// ánh sáng hoàng hôn và bụi bay trong nắng. Các khối va chạm lấy từ map.json (khớp server); phần trang trí không cản đường.
import * as THREE from 'three';
import { worldUvBox } from './geometry.js';
import { mergeStaticMeshes } from './merge.js';
import {
  materialFor, barrelMaterial, groundMaterial, groundMaterialFor, decorMaterial, signTexture, glowSprite, makeCanvas, rng,
} from './textures.js';
import { SUN_DIR, SUN_COLOR, FOG_COLOR } from './sky.js';
import { visuals } from './visuals.js';

const rim = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.7 });
const steel = new THREE.MeshStandardMaterial({ color: 0x555b62, roughness: 0.55, metalness: 0.7 });
const rustSteel = new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 0.7, metalness: 0.5 });
// Vật liệu dùng chung để mesh tĩnh có thể gộp theo vật liệu (giảm draw call).
const LENS_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.45, 1.3), toneMapped: false });
const PILLAR_LAMP_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.35, 0.25), toneMapped: false });

function addBox(parent, box) {
  const { mats, tiles, tilesPerFace } = materialFor(box);
  const [w, h, d] = box.s;
  const geo = worldUvBox(w, h, d, tiles || [2, 2], tilesPerFace || null);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(box.p[0], box.p[1], box.p[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBarrel(parent, box) {
  const [x, y, z] = box.p;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const side = barrelMaterial(box.c);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.14, 24, 1), [side, rim, rim]);
  cyl.position.y = 0.6;
  cyl.castShadow = cyl.receiveShadow = true;
  g.add(cyl);
  // Hai vành thép trên/dưới
  for (const yy of [0.04, 1.16]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.435, 0.435, 0.07, 24), rim);
    ring.position.y = yy;
    ring.castShadow = false;
    g.add(ring);
  }
  // Nắp thùng: miệng tròn nhỏ
  const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), steel);
  bung.position.set(0.18, 1.2, 0.1);
  g.add(bung);
  g.rotation.y = (x * 7.13 + z * 3.7) % 6.28;
  parent.add(g);
}

function lampPost(parent, x, y, z, dirToCenter, beams) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  // đèn quay vào giữa bãi, hơi chúc xuống
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), rim);
  housing.castShadow = false;
  g.add(housing);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.05), LENS_MAT);
  lens.position.z = 0.22;
  g.add(lens);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), steel);
  arm.position.set(0, 0, -0.35);
  g.add(arm);
  // hướng: +z của đèn nhìn vào giữa bãi
  g.lookAt(new THREE.Vector3(x + dirToCenter.x * 10, y - 3.5, z + dirToCenter.z * 10));
  parent.add(g);

  // Chùm sáng thể tích mờ
  const H = 11;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.6, H, 24, 1, true), beams);
  cone.geometry.translate(0, -H / 2, 0);
  const dir = new THREE.Vector3(dirToCenter.x * 0.55, -1, dirToCenter.z * 0.55).normalize();
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  cone.position.set(x + dirToCenter.x * 0.3, y - 0.1, z + dirToCenter.z * 0.3);
  cone.renderOrder = 5;
  cone.userData.beam = true;
  parent.add(cone);
}

function addWallDecor(parent, beams) {
  // Biển hiệu sơn trên tường
  const signs = [
    { p: [0, 3.9, -29.97], r: 0, size: [14, 3.5], lines: ['HACHIHI LOGISTICS'], font: 'bold 118px Arial', bg: null, stripe: true },
    { p: [0, 3.9, 29.97], r: Math.PI, size: [14, 3.5], lines: ['HACHIHI LOGISTICS'], font: 'bold 118px Arial', bg: null, stripe: true },
    { p: [29.97, 3.9, 0], r: -Math.PI / 2, size: [12, 3], lines: ['KHU VỰC 7', 'CHỈ NHÂN VIÊN'], font: 'bold 92px Arial', bg: null, stripe: true },
    { p: [-29.97, 3.9, 0], r: Math.PI / 2, size: [12, 3], lines: ['KHO B-12', 'CẤM HÚT THUỐC'], font: 'bold 92px Arial', bg: null, stripe: true },
  ];
  for (const s of signs) {
    const tex = signTexture(s.lines, { w: 1024, h: 256, font: s.font, fg: '#f0ebe0', stripe: s.stripe });
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(s.size[0], s.size[1]),
      new THREE.MeshStandardMaterial({
        map: tex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })
    );
    m.position.set(...s.p);
    m.rotation.y = s.r;
    m.receiveShadow = true;
    parent.add(m);
  }

  // Ống thép chạy dọc hai tường đông/tây
  for (const sx of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 58, 12), rustSteel);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx * 29.55, 4.9, 0);
    pipe.castShadow = false;
    parent.add(pipe);
    const pipe2 = pipe.clone();
    pipe2.scale.set(0.7, 1, 0.7);
    pipe2.position.set(sx * 29.6, 4.45, 0);
    parent.add(pipe2);
    for (let z = -27; z <= 27; z += 6) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.08), steel);
      br.position.set(sx * 29.78, 4.7, z);
      parent.add(br);
    }
  }
  // Mái đua (viền kim loại trên đỉnh tường)
  for (const [x, z, w, d] of [[0, -30.4, 63, 1.5], [0, 30.4, 63, 1.5], [-30.4, 0, 1.5, 63], [30.4, 0, 1.5, 63]]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), rim);
    cap.position.set(x, 6.15, z);
    cap.castShadow = true;
    parent.add(cap);
  }
  // Đèn pha trên tường
  for (const x of [-18, -6, 6, 18]) {
    lampPost(parent, x, 5.4, -29.6, new THREE.Vector3(0, 0, 1), beams);
    lampPost(parent, x, 5.4, 29.6, new THREE.Vector3(0, 0, -1), beams);
  }
  for (const z of [-14, 14]) {
    lampPost(parent, -29.6, 5.4, z, new THREE.Vector3(1, 0, 0), beams);
    lampPost(parent, 29.6, 5.4, z, new THREE.Vector3(-1, 0, 0), beams);
  }
}


// Cửa cuốn công nghiệp + vạch sơn an toàn trên tường (chỉ trang trí, không va chạm).
function addRollDoors(parent) {
  const c = makeCanvas(256);
  const g = c.getContext('2d');
  g.fillStyle = '#6d727a';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, y + 12, 256, 4);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(0, y, 256, 3);
  }
  const rr = rng(77);
  for (let i = 0; i < 420; i++) { // bẩn/gỉ nhẹ
    g.fillStyle = `rgba(${70 + rr() * 40},${50 + rr() * 20},${35},${rr() * 0.12})`;
    g.fillRect(rr() * 256, rr() * 256, 2 + rr() * 6, 1 + rr() * 14);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const frame = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.7 });
  const place = (x, y, z, ry) => {
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    grp.rotation.y = ry;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.2), mat);
    door.position.set(0, 2.1, 0);
    door.receiveShadow = true;
    grp.add(door);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 4.2), frame);
      post.position.set(sx * 2.65, 2.1, 0.005);
      grp.add(post);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.3), frame);
    top.position.set(0, 4.35, 0.005);
    grp.add(top);
    parent.add(grp);
  };
  for (const x of [-21, 21]) {
    place(x, 0, -29.97, 0);
    place(x, 0, 29.97, Math.PI);
  }
  place(29.97, 0, 22, -Math.PI / 2);
  place(-29.97, 0, -22, Math.PI / 2);
}

// Chóp dầm ở đỉnh các trụ bê tông cho đỡ trơ.
function addPillarCaps(parent, boxes) {
  for (const b of boxes) {
    if (b.m !== 'pillar') continue;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(b.s[0] + 0.5, 0.35, b.s[2] + 0.5), rim);
    cap.position.set(b.p[0], b.p[1] + b.s[1] / 2 + 0.05, b.p[2]);
    cap.castShadow = true;
    parent.add(cap);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), PILLAR_LAMP_MAT);
    lamp.position.set(b.p[0], b.p[1] + b.s[1] / 2 + 0.35, b.p[2]);
    parent.add(lamp);
  }
}

// Đường chân trời công nghiệp: nhà xưởng, bồn chứa, ống khói, cần cẩu ngoài tường (không với tới được).
function addSkyline(parent) {
  const rand = rng(2024);
  const group = new THREE.Group();
  const winC = makeCanvas(128);
  const wg = winC.getContext('2d');
  wg.fillStyle = '#1b1e26';
  wg.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const lit = rand() < 0.22;
      wg.fillStyle = lit ? `rgb(${210 + rand() * 40},${170 + rand() * 40},${100 + rand() * 40})` : '#272b36';
      wg.fillRect(x * 16 + 3, y * 16 + 4, 10, 8);
    }
  }
  const winTex = new THREE.CanvasTexture(winC);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  winTex.colorSpace = THREE.SRGBColorSpace;
  const bMat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.9, color: 0x80858f });
  bMat.emissiveMap = winTex;
  bMat.emissive = new THREE.Color(0.2, 0.19, 0.16);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const N = 54;
  const inst = new THREE.InstancedMesh(unit, bMat, N);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rand() * 0.1;
    const r = 78 + rand() * 60;
    const w = 7 + rand() * 18;
    const d = 7 + rand() * 18;
    const h = 7 + Math.pow(rand(), 1.5) * 38;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 0.5, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * Math.PI, 0)), new THREE.Vector3(w, h, d));
    inst.setMatrixAt(i, m4);
  }
  inst.castShadow = false;
  group.add(inst);

  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.9, metalness: 0.3 });
  const redLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 0.2), toneMapped: false });
  // Bồn chứa + ống khói
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const r = 85 + rand() * 40;
    const stack = i % 2 === 0;
    const geo = stack ? new THREE.CylinderGeometry(2.4, 3.4, 52, 14) : new THREE.CylinderGeometry(7, 7, 14, 20);
    const m = new THREE.Mesh(geo, dark);
    m.position.set(Math.cos(a) * r, stack ? 25 : 6.5, Math.sin(a) * r);
    group.add(m);
    if (stack) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), redLight);
      l.position.set(m.position.x, 52, m.position.z);
      group.add(l);
    }
  }
  // Cần cẩu cổng
  for (const a of [0.7, 2.6, 4.4]) {
    const r = 82;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.rotation.y = -a + Math.PI / 2;
    const leg = new THREE.BoxGeometry(2.2, 34, 2.2);
    for (const dx of [-14, 14]) {
      const l = new THREE.Mesh(leg, dark);
      l.position.set(dx, 17, 0);
      g.add(l);
    }
    const jib = new THREE.Mesh(new THREE.BoxGeometry(46, 2.4, 2.6), dark);
    jib.position.set(0, 34.5, 0);
    g.add(jib);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), redLight);
    tip.position.set(22, 36.2, 0);
    g.add(tip);
    group.add(g);
  }
  parent.add(group);
  return group;
}

// Mặt đất bên ngoài tường (che khoảng trống dưới đường chân trời).
function addOuterGround(parent, color = 0x34363a) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(420, 40),
    new THREE.MeshStandardMaterial({ color, roughness: 1 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.03;
  m.receiveShadow = false;
  parent.add(m);
}


// ---------------------------------------------------------------- trang trí không va chạm (địa danh)
// k: box | cyl | cone | sphere | plane | prism | seg. s: kích thước theo từng loại; r: góc quay [x,y,z]; seg: a,b là hai đầu.
function uvScale(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
}

function prismGeo(w, h, d) {
  // Lăng trụ tam giác: dài w (trục x), đáy d (trục z), cao h. Đỉnh sống mái ở y = h/2.
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const yb = -h / 2;
  const yt = h / 2;
  const P = [
    // hai mái dốc
    [x0, yb, z1], [x1, yb, z1], [x1, yt, 0], [x0, yt, 0],
    [x1, yb, z0], [x0, yb, z0], [x0, yt, 0], [x1, yt, 0],
    // hai đầu hồi
    [x0, yb, z0], [x0, yb, z1], [x0, yt, 0],
    [x1, yb, z1], [x1, yb, z0], [x1, yt, 0],
    // đáy
    [x0, yb, z0], [x1, yb, z0], [x1, yb, z1], [x0, yb, z1],
  ];
  const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [14, 15, 16, 17]];
  const tris = [[8, 9, 10], [11, 12, 13]];
  const pos = [];
  const uv = [];
  const addTri = (a, b, c) => {
    for (const p of [a, b, c]) {
      pos.push(...P[p]);
      uv.push(P[p][0] / 3, P[p][2] / 3 + P[p][1] / 3);
    }
  };
  for (const q of quads) { addTri(q[0], q[1], q[2]); addTri(q[0], q[2], q[3]); }
  for (const t of tris) addTri(t[0], t[1], t[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function addDecor(parent, list) {
  for (const d of list || []) {
    if (d.k === 'model') { // prop GLB từ thư viện tài nguyên (bỏ qua nếu chưa có)
      const inst = visuals.instantiate(d.model);
      if (!inst) continue;
      inst.object.position.set(d.p[0], d.p[1], d.p[2]);
      if (d.r) inst.object.rotation.set(d.r[0], d.r[1], d.r[2]);
      if (d.s) inst.object.scale.set(d.s[0], d.s[1], d.s[2]);
      parent.add(inst.object);
      continue;
    }
    const m = decorMaterial(d.m || 'plaster', d.c || '#888888');
    let geo;
    let tile = 3;
    switch (d.k) {
      case 'box': geo = worldUvBox(d.s[0], d.s[1], d.s[2], [3, 3], null); break;
      case 'cyl': geo = new THREE.CylinderGeometry(d.s[0], d.s[1], d.s[2], d.s[3] || 16, 1); uvScale(geo, (2 * Math.PI * d.s[1]) / tile, d.s[2] / tile); break;
      case 'cone': geo = new THREE.ConeGeometry(d.s[0], d.s[1], d.seg || 16, 1); uvScale(geo, (2 * Math.PI * d.s[0]) / tile, d.s[1] / tile); break;
      case 'sphere': geo = new THREE.SphereGeometry(d.s[0], 14, 10); uvScale(geo, 1.5, 1.5); break;
      case 'plane': geo = new THREE.PlaneGeometry(d.s[0], d.s[1]); geo.rotateX(-Math.PI / 2); tile = d.tile || (d.m === 'water' ? 4 : 3); uvScale(geo, d.s[0] / tile, d.s[1] / tile); break;
      case 'prism': geo = prismGeo(d.s[0], d.s[1], d.s[2]); break;
      case 'seg': {
        const a = new THREE.Vector3(...d.a);
        const b = new THREE.Vector3(...d.b);
        const len = a.distanceTo(b);
        geo = new THREE.CylinderGeometry(d.s[0], d.s[0], len, 6, 1);
        geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
        const mid = a.clone().add(b).multiplyScalar(0.5);
        geo.translate(mid.x, mid.y, mid.z);
        break;
      }
      default: continue;
    }
    const mesh = new THREE.Mesh(geo, m);
    if (d.k !== 'seg') mesh.position.set(d.p[0], d.p[1], d.p[2]);
    if (d.r) mesh.rotation.set(d.r[0], d.r[1], d.r[2]);
    mesh.castShadow = d.k !== 'plane' && d.k !== 'seg'; // cáp, mặt nước không đổ bóng
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

// Bụi bay trong nắng: điểm sáng nhỏ trôi chậm quanh người chơi.
function makeDust() {
  const N = 260;
  const pos = new Float32Array(N * 3);
  const rand = rng(8);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rand() - 0.5) * 28;
    pos[i * 3 + 1] = rand() * 8;
    pos[i * 3 + 2] = (rand() - 0.5) * 28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowSprite(64), size: 0.09, transparent: true, opacity: 0.32, depthWrite: false,
    blending: THREE.AdditiveBlending, color: new THREE.Color(0.9, 0.9, 0.85), sizeAttenuation: true,
  }));
  pts.frustumCulled = false;
  return pts;
}

export function buildEnvironment(scene, MAP, renderer) {
  const root = new THREE.Group();
  scene.add(root);
  const T = MAP.theme || { kind: 'warehouse' };
  const warehouse = T.kind === 'warehouse';

  // Mặt đất: theo chất liệu của từng bản đồ
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP.size, MAP.size), warehouse ? groundMaterial(MAP.size) : groundMaterialFor(T.ground, MAP.size));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  addOuterGround(root, warehouse ? 0x34363a : new THREE.Color(T.ground && T.ground.c ? T.ground.c : '#34363a').multiplyScalar(0.55));

  // Khối bản đồ
  for (const b of MAP.boxes) {
    if (b.m === 'barrel') addBarrel(root, b);
    else addBox(root, b);
  }
  addDecor(root, MAP.decor);

  // Chùm sáng đèn pha
  const beams = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Color(0.85, 0.9, 1.0) }, uOp: { value: 0.045 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform vec3 uCol; uniform float uOp; void main(){ float edge=pow(abs(dot(normalize(vN),normalize(vV))),1.4); float a=pow(vUv.y,1.7)*uOp*edge; gl_FragColor=vec4(uCol*a,a); }',
  });
  if (warehouse) {
    addWallDecor(root, beams);
    addRollDoors(root);
    addPillarCaps(root, MAP.boxes);
    addSkyline(root);
  }
  const mergeStats = mergeStaticMeshes(root);

  // Ánh sáng
  const hemi = new THREE.HemisphereLight(T.hemi ? new THREE.Color(T.hemi[0]) : 0xb6c2d2, T.hemi ? new THREE.Color(T.hemi[1]) : 0x5c5c5a, 1.05);
  scene.add(hemi);
  const sunDir = T.sunDir ? new THREE.Vector3(...T.sunDir).normalize() : SUN_DIR;
  const follow = MAP.size > 64; // bản đồ lớn: vùng bóng nhỏ hơn, bám theo người chơi (nét hơn, nhẹ hơn)
  const ext = follow ? 40 : Math.max(46, MAP.size * 0.78);
  const sun = new THREE.DirectionalLight(T.sunColor ? new THREE.Color(T.sunColor) : SUN_COLOR, T.sunI || 3.3);
  sun.position.copy(sunDir).multiplyScalar(ext * 2);
  sun.target.position.set(0, 0, 0);
  const sc = sun.shadow.camera;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 20; sc.far = ext * 4.2;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 2.5;
  sun.castShadow = true;
  scene.add(sun);
  scene.add(sun.target);
  // Ánh sáng nền ấm phản xạ từ mặt đất
  const bounce = new THREE.DirectionalLight(0xc6cbd2, 0.28);
  bounce.position.set(sunDir.x * -50, 6, sunDir.z * -50);
  scene.add(bounce);

  scene.fog = new THREE.Fog(T.fog ? new THREE.Color(T.fog) : FOG_COLOR, T.fogNear || 85, T.fogFar || 300);

  const dust = makeDust();
  scene.add(dust);
  const dustVel = new Float32Array(dust.geometry.attributes.position.count * 3);
  const r2 = rng(99);
  for (let i = 0; i < dustVel.length; i++) dustVel[i] = (r2() - 0.5) * 0.25;

  return {
    root, sun, hemi, bounce, beams, dust, mergeStats, follow, sunDir, shadowExt: ext, sunDist: ext * 2,
    update(dt, camPos) {
      if (!dust.visible) return;
      const p = dust.geometry.attributes.position;
      const a = p.array;
      const cnt = Math.min(p.count, dust.geometry.drawRange.count);
      for (let i = 0; i < cnt; i++) {
        const k = i * 3;
        a[k] += dustVel[k] * dt;
        a[k + 1] += dustVel[k + 1] * dt * 0.6 + 0.02 * dt;
        a[k + 2] += dustVel[k + 2] * dt;
        // Tuần hoàn quanh camera
        for (let c = 0; c < 3; c++) {
          const ref = c === 1 ? 4 : camPos[c === 0 ? 'x' : 'z'];
          const half = c === 1 ? 5 : 14;
          if (a[k + c] > ref + half) a[k + c] -= half * 2;
          else if (a[k + c] < ref - half) a[k + c] += half * 2;
        }
      }
      p.needsUpdate = true;
    },
  };
}

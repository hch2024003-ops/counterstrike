// Làm bề mặt trông "thật" hơn mà không cần thêm texture:
//  1. enhanceMaterial(): shader theo toạ độ thế giới — phá lặp texture (biến thiên màu quy mô lớn), bám bẩn ở chân tường,
//     vệt nước chảy trên tường. Mặt sàn chỉ có biến thiên màu, không bị tối.
//  2. Decals: vết đạn và vết cháy do lựu đạn, tồn tại vài chục giây rồi mờ dần.
import * as THREE from 'three';

export const GRIME = { uniform: { value: 1 } }; // 0 tắt, 1 bật (tắt khi mức hiệu ứng thấp)
export const WET = { uniform: { value: 0.5 } }; // độ ẩm của bản đồ hiện tại (0 khô .. 1 ướt): vũng nước đọng trên sàn

const enhanced = new Set(); // vật liệu đã gắn shader bám bẩn, để tắt đồng loạt nếu shader lỗi
let grimeDisabled = false;

// Tắt shader bám bẩn/vũng nước (khi GPU/driver biên dịch lỗi): vật liệu quay về shader chuẩn của three.
export function disableGrime() {
  if (grimeDisabled) return;
  grimeDisabled = true;
  for (const m of enhanced) {
    m.onBeforeCompile = () => {};
    m.customProgramCacheKey = () => 'hachihi-plain';
    m.needsUpdate = true;
  }
}

export function enhanceMaterial(m) {
  if (grimeDisabled) return m;
  enhanced.add(m);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = GRIME.uniform;
    shader.uniforms.uWet = WET.uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uGrime;
uniform float uWet;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 gN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
float gVert = 1.0 - abs(gN.y);
float gH = smoothstep(0.0, 1.3, vWPos.y);
float gMacro = gNoise(vWPos.xz * 0.17 + vWPos.y * 0.31) * 0.6 + gNoise(vWPos.xz * 0.63 - vWPos.y * 0.5) * 0.4;
float gStreak = gNoise(vec2((vWPos.x + vWPos.z) * 2.1, vWPos.y * 0.12));
float gDirt = (1.0 - gH) * (0.35 + 0.65 * gMacro) * gVert;
float gFloor = step(0.9, abs(gN.y)) * step(vWPos.y, 0.06);
float gWet = gFloor * smoothstep(0.62, 0.74, gNoise(vWPos.xz * 0.11 + 7.3) * 0.7 + gNoise(vWPos.xz * 0.45) * 0.3) * uWet * uGrime;
vec3 gC = diffuseColor.rgb * (0.82 + 0.36 * gMacro);
gC = mix(gC, gC * vec3(0.42, 0.38, 0.33), gDirt * 0.6);
gC *= 1.0 - 0.16 * gStreak * smoothstep(1.0, 4.0, vWPos.y) * gVert;
gC *= 1.0 - 0.35 * gWet; // vũng nước làm sàn sẫm hơn
diffuseColor.rgb = mix(diffuseColor.rgb, gC, uGrime);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.06, gWet); // vũng nước bóng, phản chiếu bầu trời`);
  };
  m.customProgramCacheKey = () => 'hachihi-grime-2';
  return m;
}

// ---------------------------------------------------------------- decal
function holeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let grd = g.createRadialGradient(64, 64, 2, 64, 64, 60);
  grd.addColorStop(0, 'rgba(10,8,6,0.0)');
  grd.addColorStop(0.08, 'rgba(8,6,5,0.95)');
  grd.addColorStop(0.22, 'rgba(25,20,16,0.7)');
  grd.addColorStop(0.5, 'rgba(60,52,44,0.28)');
  grd.addColorStop(1, 'rgba(60,52,44,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(20,16,12,0.55)'; // vết nứt toả ra
  g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * 6.28;
    const l = 14 + Math.random() * 38;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 8, 64 + Math.sin(a) * 8);
    g.lineTo(64 + Math.cos(a + 0.15) * l, 64 + Math.sin(a + 0.15) * l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(5,4,3,0.85)');
  grd.addColorStop(0.45, 'rgba(15,12,10,0.6)');
  grd.addColorStop(1, 'rgba(15,12,10,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) { // rìa rách, không tròn đều
    g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.25})`;
    const a = Math.random() * 6.28;
    const r = 30 + Math.random() * 34;
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3 + Math.random() * 8, 0, 6.28);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const LIFE = 28; // giây tồn tại
const FADE = 6; // giây mờ dần

export class Decals {
  constructor(scene, holes = 72, scorches = 6) {
    this.scene = scene;
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.holeTex = holeTexture();
    this.scorchTex = scorchTexture();
    this.holes = this.pool(holes, this.holeTex);
    this.scorches = this.pool(scorches, this.scorchTex);
    this.hi = 0;
    this.si = 0;
    this.t = 0;
  }

  pool(n, tex) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: true,
      });
      const mesh = new THREE.Mesh(this.geo, m);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      list.push({ mesh, born: -1e9 });
    }
    return list;
  }

  place(entry, p, n, size) {
    const m = entry.mesh;
    m.position.set(p[0] + n[0] * 0.006, p[1] + n[1] * 0.006, p[2] + n[2] * 0.006);
    m.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(size);
    m.material.opacity = 1;
    m.visible = true;
    entry.born = this.t;
  }

  // Vết đạn trên bề mặt: p điểm trúng, n pháp tuyến bề mặt.
  hole(p, n) {
    this.place(this.holes[this.hi++ % this.holes.length], p, n, 0.1 + Math.random() * 0.07);
  }

  // Vết cháy trên sàn do lựu đạn nổ.
  scorch(p) {
    this.place(this.scorches[this.si++ % this.scorches.length], [p[0], 0, p[2]], [0, 1, 0], 3.2 + Math.random() * 0.8);
  }

  update(dt) {
    this.t += dt;
    for (const list of [this.holes, this.scorches]) {
      for (const e of list) {
        if (!e.mesh.visible) continue;
        const age = this.t - e.born;
        if (age > LIFE + FADE) e.mesh.visible = false;
        else if (age > LIFE) e.mesh.material.opacity = 1 - (age - LIFE) / FADE;
      }
    }
  }

  clear() {
    for (const list of [this.holes, this.scorches]) for (const e of list) e.mesh.visible = false;
  }
}

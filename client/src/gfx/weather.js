// Environment FX — phần dựng hình. Toàn bộ chuyển động hạt chạy trên GPU (vertex shader), CPU chỉ cập nhật vài uniform mỗi khung:
//  - Mưa: LineSegments, nghiêng theo gió, mật độ chỉnh bằng drawRange (không tạo/hủy gì).
//  - Tuyết / lá bay / bụi: Points; sương sát đất: vài billboard (InstancedBufferGeometry) trôi theo gió.
//  - Sấm chớp: chỉ nâng cường độ ánh sáng môi trường + trời + exposure trong ~0.5 giây, KHÔNG tạo đèn động.
//  - Mặt đất ướt: dùng lại uniform WET của vật liệu mặt đất (không thêm vật liệu/texture mới).
//  - Mọi hạt nằm trong một hộp quanh camera (culling theo khoảng cách); ngoài hộp không vẽ.
// Thời tiết chỉ mang tính trang trí: tầm nhìn (sương) giảm tối đa ~20%, chớp sáng bị chặn trần, hạt bị làm mờ khi sát camera.
import * as THREE from 'three';
import { WET } from './surfacefx.js';
import {
  weatherFor, CLEAR_STATE, LightningSchedule, resolveEnv, sanitizeEnv, ENV_DEFAULTS,
} from './envlogic.js';

const RAIN_MAX = 4500;
const SNOW_MAX = 2400;
const LEAF_MAX = 120;
const DUST_MAX = 360;
const MIST_MAX = 36;

const WRAP = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uBox;
uniform vec3 uOff;
uniform float uYDown;
vec3 wrapPos(float f) {
  vec3 o = vec3(cameraPosition.x - uBox.x * 0.5, cameraPosition.y - uYDown, cameraPosition.z - uBox.z * 0.5);
  return o + mod(aSeed.xyz * uBox + uOff * f - o, uBox);
}`;

const RAIN_VERT = /* glsl */ `
${WRAP}
attribute float aEnd;
uniform vec3 uDir;
uniform float uLen;
varying float vA;
void main() {
  float f = 0.85 + 0.3 * aSeed.w;
  vec3 p = wrapPos(f);
  p -= uDir * (uLen * aEnd);
  float d = length((p - cameraPosition).xz);
  vA = (1.0 - aEnd * 0.85) * (1.0 - smoothstep(uBox.x * 0.33, uBox.x * 0.5, d)) * smoothstep(0.8, 2.4, d);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() { gl_FragColor = vec4(uColor, uOpacity * vA); }`;

const POINT_VERT = /* glsl */ `
${WRAP}
uniform float uTime;
uniform float uSize;
uniform float uPx;
uniform float uSway;
uniform float uSpin;
varying float vA;
varying float vRot;
varying float vSeed;
void main() {
  float f = 0.7 + 0.6 * aSeed.w;
  vec3 p = wrapPos(f);
  p.x += sin(uTime * (0.6 + aSeed.w) + aSeed.x * 40.0) * uSway;
  p.z += cos(uTime * (0.5 + aSeed.z) + aSeed.y * 40.0) * uSway;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec3 rel = p - cameraPosition;
  vA = smoothstep(0.6, 1.8, length(rel)) * (1.0 - smoothstep(uBox.x * 0.33, uBox.x * 0.5, length(rel.xz)));
  vRot = aSeed.w * 6.2831 + uTime * uSpin * (aSeed.x - 0.5) * 2.0;
  vSeed = aSeed.w;
  gl_PointSize = clamp(uSize * (0.6 + 0.8 * aSeed.z) * uPx / max(-mv.z, 0.1), 1.0, 40.0);
  gl_Position = projectionMatrix * mv;
}`;

const SOFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.45, 1.0, r);
  gl_FragColor = vec4(uColor, uOpacity * vA * a);
}`;

const LEAF_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uOpacity;
varying float vA;
varying float vRot;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  c = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
  float e = length(c * vec2(1.0, 2.3)) * 2.0;
  float a = 1.0 - smoothstep(0.7, 0.95, e);
  float vein = 1.0 - 0.25 * smoothstep(0.04, 0.0, abs(c.y));
  gl_FragColor = vec4(mix(uColor, uColor2, vSeed) * vein, uOpacity * vA * a);
}`;

const MIST_VERT = /* glsl */ `
${WRAP}
uniform vec2 uViewScale;
uniform float uSize;
varying float vA;
varying vec2 vUv;
void main() {
  float f = 0.6 + 0.8 * aSeed.w;
  vec3 c = wrapPos(f);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float sz = uSize * (0.7 + 0.6 * aSeed.z);
  mv.xy += position.xy * sz;
  float d = length(c - cameraPosition);
  vA = smoothstep(3.0, 8.0, d) * (1.0 - smoothstep(uBox.x * 0.33, uBox.x * 0.5, length((c - cameraPosition).xz)));
  vUv = position.xy + 0.5;
  gl_Position = projectionMatrix * mv;
}`;

const MIST_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, r);
  gl_FragColor = vec4(uColor, uOpacity * vA * a * a);
}`;

function seedAttr(n, rnd) {
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
}

function mat(vs, fs, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, fog: false,
  });
}

const lerp = (a, b, k) => a + (b - a) * k;

export class Weather {
  // world: cần world.scene, world.renderer, world.camera, world.sky, world.env ({hemi, sun}), world.gfx.
  constructor(world) {
    this.world = world;
    this.settings = sanitizeEnv(ENV_DEFAULTS);
    this.adaptLevel = 0;
    this.cfg = resolveEnv(this.settings, 0, 2);
    this.mapId = null;
    this.t = 0;
    this.st = 0;
    this.cur = { ...CLEAR_STATE };
    this.tgt = { ...CLEAR_STATE };
    this.sched = null;
    this.flash = 0;
    this.onThunder = null; // (vol) => void, do main.js nối với audio
    this.onRainLevel = null; // (level 0..1) => void
    this._fxSeen = -1;
    this.off = new THREE.Vector3(); // độ dịch tích luỹ (mưa/tuyết/hạt) — tích luỹ nên đổi gió không gây giật
    this.offSlow = new THREE.Vector3();
    this.base = null;
    this.size = new THREE.Vector2();

    const common = () => ({
      uBox: { value: new THREE.Vector3(28, 14, 28) },
      uOff: { value: new THREE.Vector3() },
      uYDown: { value: 4 },
    });

    // Mưa
    const rg = new THREE.BufferGeometry();
    const rnd = Math.random;
    const rainSeed = seedAttr(RAIN_MAX * 2, rnd);
    for (let i = 0; i < RAIN_MAX; i++) for (let k = 0; k < 4; k++) rainSeed[(i * 2 + 1) * 4 + k] = rainSeed[i * 2 * 4 + k]; // hai đầu của một vệt dùng chung seed
    const rainEnd = new Float32Array(RAIN_MAX * 2);
    for (let i = 0; i < RAIN_MAX; i++) rainEnd[i * 2 + 1] = 1;
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_MAX * 2 * 3), 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(rainSeed, 4));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(rainEnd, 1));
    this.rainU = { ...common(), uDir: { value: new THREE.Vector3(0, -1, 0) }, uLen: { value: 0.9 }, uColor: { value: new THREE.Color('#cfd9e4') }, uOpacity: { value: 0.32 } };
    this.rainU.uBox.value.set(28, 16, 28);
    this.rainU.uYDown.value = 5;
    this.rain = new THREE.LineSegments(rg, mat(RAIN_VERT, RAIN_FRAG, this.rainU));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 20;
    this.rain.geometry.setDrawRange(0, 0);
    this.rain.visible = false;

    // Tuyết
    this.snowU = { ...common(), uTime: { value: 0 }, uSize: { value: 0.07 }, uPx: { value: 500 }, uSway: { value: 0.35 }, uSpin: { value: 0 }, uColor: { value: new THREE.Color('#f4f8ff') }, uOpacity: { value: 0.85 } };
    this.snowU.uBox.value.set(26, 13, 26);
    this.snowU.uYDown.value = 4;
    this.snow = this._points(SNOW_MAX, POINT_VERT, SOFT_FRAG, this.snowU);

    // Lá bay
    this.leafU = { ...common(), uTime: { value: 0 }, uSize: { value: 0.22 }, uPx: { value: 500 }, uSway: { value: 0.9 }, uSpin: { value: 3 }, uColor: { value: new THREE.Color('#7f8f3a') }, uColor2: { value: new THREE.Color('#b86a2a') }, uOpacity: { value: 0.95 } };
    this.leafU.uBox.value.set(30, 9, 30);
    this.leafU.uYDown.value = 2.5;
    this.leaves = this._points(LEAF_MAX, POINT_VERT, LEAF_FRAG, this.leafU);

    // Bụi lơ lửng
    this.dustU = { ...common(), uTime: { value: 0 }, uSize: { value: 0.035 }, uPx: { value: 500 }, uSway: { value: 0.25 }, uSpin: { value: 0 }, uColor: { value: new THREE.Color('#fff3d6') }, uOpacity: { value: 0.5 } };
    this.dustU.uBox.value.set(14, 6, 14);
    this.dustU.uYDown.value = 2.2;
    this.dust = this._points(DUST_MAX, POINT_VERT, SOFT_FRAG, this.dustU);

    // Sương sát đất (billboard)
    const bg = new THREE.InstancedBufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    bg.setIndex([0, 1, 2, 0, 2, 3]);
    bg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr(MIST_MAX, rnd), 4));
    bg.instanceCount = 0;
    this.mistU = { ...common(), uSize: { value: 9 }, uViewScale: { value: new THREE.Vector2(1, 1) }, uColor: { value: new THREE.Color('#dde3e6') }, uOpacity: { value: 0.12 } };
    this.mistU.uBox.value.set(46, 2.4, 46);
    this.mistU.uYDown.value = 1.9;
    this.mist = new THREE.Mesh(bg, mat(MIST_VERT, MIST_FRAG, this.mistU));
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 21;
    this.mist.visible = false;

    for (const o of [this.rain, this.snow, this.leaves, this.dust, this.mist]) world.scene.add(o);
    this.lens = new LensFx();
    this.disposed = false;
  }

  _points(n, vs, fs, uniforms) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seedAttr(n, Math.random), 4));
    const p = new THREE.Points(g, mat(vs, fs, uniforms));
    p.frustumCulled = false;
    p.renderOrder = 22;
    p.geometry.setDrawRange(0, 0);
    p.visible = false;
    this.world.scene.add(p);
    return p;
  }

  // Gọi sau khi world dựng/đổi bản đồ: lưu ánh sáng/sương gốc để thời tiết điều chỉnh rồi trả lại đúng.
  setMap(mapId) {
    this.mapId = mapId;
    const w = this.world;
    const env = w.env;
    this.base = {
      hemi: env.hemi.intensity,
      sun: env.sun.intensity,
      envI: w.scene.environmentIntensity,
      exposure: w.renderer.toneMappingExposure,
      fogNear: w.scene.fog ? w.scene.fog.near : 0,
      fogFar: w.scene.fog ? w.scene.fog.far : 0,
      fogColor: w.scene.fog ? w.scene.fog.color.clone() : null,
      wet: WET.uniform.value,
    };
    this.cur = { ...CLEAR_STATE };
    this.tgt = { ...CLEAR_STATE };
    this.sched = null;
    this.flash = 0;
    if (this.pendingSeed !== undefined) this.setSeed(this.pendingSeed, true);
  }

  // Đặt thời tiết từ seed (đồng bộ giữa người chơi: cùng seed + cùng bản đồ => cùng thời tiết). instant: không chuyển mượt.
  setSeed(seed, instant = false) {
    this.pendingSeed = seed;
    if (!this.mapId) return;
    this.tgt = weatherFor(seed, this.mapId);
    this.st = 0; // đồng hồ sét tính từ lúc nhận seed (mọi máy bắt đầu cùng lúc, lệch tối đa bằng độ trễ mạng)
    this.sched = new LightningSchedule(seed, 0);
    if (instant) this.cur = { ...this.tgt };
    this.state = this.tgt.type;
  }

  // Về trời quang (menu, thoát trận).
  setClear(instant = true) {
    this.pendingSeed = undefined;
    this.tgt = { ...CLEAR_STATE };
    this.sched = null;
    if (instant) this.cur = { ...CLEAR_STATE };
  }

  setSettings(settings) {
    this.settings = sanitizeEnv(settings);
    this.refresh();
  }

  setAdaptiveLevel(level) {
    if (level === this.adaptLevel) return;
    this.adaptLevel = level;
    this.refresh();
  }

  refresh() {
    const fx = this.world.gfx ? this.world.gfx.fx : 2;
    this._fxSeen = fx;
    this.cfg = resolveEnv(this.settings, this.adaptLevel, fx);
    if (!this.cfg.camera) this.lens.set(0, 0);
    if (this.world.applyAmbient) this.world.applyAmbient();
  }

  // Trả ánh sáng/sương/độ ướt về giá trị gốc của bản đồ.
  restore() {
    const b = this.base;
    if (!b) return;
    const w = this.world;
    if (w.env && w.env.hemi) w.env.hemi.intensity = b.hemi;
    if (w.env && w.env.sun) w.env.sun.intensity = b.sun;
    w.scene.environmentIntensity = b.envI;
    w.renderer.toneMappingExposure = b.exposure;
    if (w.scene.fog) {
      w.scene.fog.near = b.fogNear;
      w.scene.fog.far = b.fogFar;
      if (b.fogColor) w.scene.fog.color.copy(b.fogColor);
    }
    if (w.sky) w.sky.material.uniforms.uFlash.value = 0;
    WET.uniform.value = b.wet;
    this.base = null;
  }

  update(dt) {
    if (this.disposed || !this.base) return;
    const w = this.world;
    if (this.world.gfx && this.world.gfx.fx !== this._fxSeen) this.refresh();
    this.t += dt;
    this.st += dt;
    const cfg = this.cfg;
    const c = this.cur;
    const g = this.tgt;
    // Chuyển mượt (~8 giây) giữa các trạng thái thời tiết
    const k = Math.min(1, dt / 5);
    for (const key of ['rain', 'snow', 'fog', 'storm', 'wind', 'dust', 'leaves', 'windDirX', 'windDirZ']) c[key] = lerp(c[key], g[key], k);
    c.type = g.type;

    const act = cfg.active;
    const rainK = act ? c.rain : 0;
    const snowK = act ? c.snow : 0;
    const windK = cfg.wind ? c.wind : 0.25 * c.wind;
    const dl = Math.hypot(c.windDirX, c.windDirZ) || 1;
    const wx = (c.windDirX / dl) * windK;
    const wz = (c.windDirZ / dl) * windK;

    // Tích luỹ độ dịch
    const fall = 12 + rainK * 8; // m/s
    this.off.x += wx * 0.55 * dt;
    this.off.z += wz * 0.55 * dt;
    this.off.y -= fall * dt;
    const sx = wx * 0.5;
    const sz = wz * 0.5;
    this.offSlow.x += sx * dt;
    this.offSlow.z += sz * dt;

    // Mưa
    const rainN = act ? Math.min(RAIN_MAX, Math.floor(cfg.counts.rain * rainK)) : 0;
    this.rain.visible = rainN > 20;
    if (this.rain.visible) {
      this.rain.geometry.setDrawRange(0, rainN * 2);
      this.rainU.uOff.value.copy(this.off);
      this.rainU.uDir.value.set(wx * 0.55, -fall, wz * 0.55).normalize();
      this.rainU.uLen.value = 0.7 + rainK * 0.6;
      this.rainU.uOpacity.value = 0.2 + rainK * 0.16;
    }

    // Tuyết
    const snowN = act ? Math.min(SNOW_MAX, Math.floor(cfg.counts.snow * snowK)) : 0;
    this.snow.visible = snowN > 20;
    if (this.snow.visible) {
      this.snow.geometry.setDrawRange(0, snowN);
      this.snowU.uTime.value = this.t;
      this.snowU.uOff.value.set(this.offSlow.x * 1.4, -(this.t * 1.1), this.offSlow.z * 1.4);
    }

    // Lá bay
    const leafN = act ? Math.min(LEAF_MAX, Math.floor(cfg.counts.leaves * c.leaves * (0.4 + 0.6 * Math.min(1, windK / 2)))) : 0;
    this.leaves.visible = leafN > 4;
    if (this.leaves.visible) {
      this.leaves.geometry.setDrawRange(0, leafN);
      this.leafU.uTime.value = this.t;
      this.leafU.uOff.value.set(this.offSlow.x * 3.2, -(this.t * 0.55), this.offSlow.z * 3.2);
    }

    // Bụi
    const dustN = act ? Math.min(DUST_MAX, Math.floor(cfg.counts.dust * c.dust)) : 0;
    this.dust.visible = dustN > 8;
    if (this.dust.visible) {
      this.dust.geometry.setDrawRange(0, dustN);
      this.dustU.uTime.value = this.t;
      this.dustU.uOff.value.set(this.offSlow.x * 0.8, Math.sin(this.t * 0.2) * 0.2, this.offSlow.z * 0.8);
    }

    // Sương sát đất
    const fogK = act && cfg.fog ? c.fog : 0;
    const mistN = act ? Math.min(MIST_MAX, Math.floor(cfg.counts.mist * (0.3 + 0.7 * fogK))) : 0;
    this.mist.visible = mistN > 2 && fogK > 0.02;
    if (this.mist.visible) {
      this.mist.geometry.instanceCount = mistN;
      this.mistU.uOff.value.set(this.offSlow.x * 0.6, 0, this.offSlow.z * 0.6);
      this.mistU.uOpacity.value = 0.05 + 0.1 * fogK;
    }

    // Kích thước điểm theo độ phân giải dựng
    w.renderer.getDrawingBufferSize(this.size);
    const px = this.size.y * 0.5 / Math.tan(THREE.MathUtils.degToRad(w.camera.fov) * 0.5);
    this.snowU.uPx.value = px;
    this.leafU.uPx.value = px;
    this.dustU.uPx.value = px;

    // Ánh sáng, sương, độ ướt (đều rất nhẹ)
    this._applyAtmosphere(act, rainK, fogK, snowK);
    this._applyLightning(act);

    if (this.onRainLevel) this.onRainLevel(act ? Math.min(1, rainK) : 0);
    this.lens.set(cfg.camera ? rainK : 0, this.t);
  }

  _applyAtmosphere(act, rainK, fogK, snowK) {
    const b = this.base;
    const w = this.world;
    const over = act ? Math.min(1, Math.max(rainK, fogK * 0.6, snowK * 0.7)) : 0; // độ âm u
    w.env.hemi.intensity = b.hemi * (1 - 0.1 * over);
    w.env.sun.intensity = b.sun * (1 - 0.3 * over * (1 - 0.4 * this.cur.storm)); // dịu nắng khi trời âm u; bóng đổ vẫn rõ
    const fogAmt = act ? Math.min(1, fogK + rainK * 0.15 + snowK * 0.15) : 0;
    const fog = w.scene.fog;
    if (fog) {
      // Giới hạn: tầm nhìn xa giảm tối đa 20% (cố ý nhẹ để không ảnh hưởng ngắm bắn)
      fog.far = b.fogFar * (1 - 0.2 * fogAmt);
      fog.near = b.fogNear * (1 - 0.25 * fogAmt);
      if (b.fogColor) fog.color.copy(b.fogColor).lerp(GREY, 0.35 * fogAmt);
    }
    WET.uniform.value = Math.max(b.wet, (act ? Math.min(1, rainK * 1.2) : 0) * 0.95);
    if (w.sky) w.sky.material.uniforms.uOvercast.value = over;
  }

  _applyLightning(act) {
    const b = this.base;
    const w = this.world;
    let flash = 0;
    if (act && this.cfg.thunder && this.sched && this.cur.storm > 0.5) {
      flash = this.sched.flashAt(this.st);
      for (const e of this.sched.takeThunder(this.st)) if (this.onThunder) this.onThunder(e.thunderVol);
    }
    this.flash = flash;
    const cam = this.cfg.camera ? 1 : 0.6; // tắt "hiệu ứng camera" làm chớp dịu hơn nữa
    const f = flash * cam;
    const over = w.sky.material.uniforms.uOvercast.value;
    w.env.hemi.intensity = b.hemi * (1 - 0.1 * over) + f * 1.1;
    w.scene.environmentIntensity = b.envI + f * 0.7;
    w.renderer.toneMappingExposure = b.exposure * (1 + 0.25 * f);
    w.sky.material.uniforms.uFlash.value = f * 1.4;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.restore();
    for (const o of [this.rain, this.snow, this.leaves, this.dust, this.mist]) {
      this.world.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    this.lens.dispose();
  }
}

const GREY = new THREE.Color(0.72, 0.75, 0.79);

// Giọt mưa trên ống kính: lớp DOM CSS rất nhẹ (không đụng WebGL). Tắt được trong cài đặt (cameraFx).
class LensFx {
  constructor() {
    this.el = null;
    this.last = -1;
  }

  _make() {
    if (this.el || typeof document === 'undefined') return;
    if (!document.getElementById('lensFxStyle')) {
      const st = document.createElement('style');
      st.id = 'lensFxStyle';
      st.textContent = '#lensFx{position:fixed;inset:0;pointer-events:none;z-index:3;opacity:0;transition:opacity .6s;mix-blend-mode:screen}' +
        '#lensFx i{position:absolute;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.55),rgba(190,210,230,.12) 55%,transparent 70%);animation:lensDrip 9s linear infinite}' +
        '@keyframes lensDrip{0%{transform:translateY(0) scale(1);opacity:0}8%{opacity:1}85%{opacity:.8}100%{transform:translateY(38px) scale(.7);opacity:0}}';
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.id = 'lensFx';
    for (let i = 0; i < 14; i++) {
      const d = document.createElement('i');
      const s = 6 + Math.random() * 14;
      d.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${s}px;height:${s * 1.25}px;animation-delay:${-Math.random() * 9}s;animation-duration:${6 + Math.random() * 7}s`;
      el.appendChild(d);
    }
    document.body.appendChild(el);
    this.el = el;
  }

  set(rain) {
    const v = rain > 0.35 ? Math.min(0.9, (rain - 0.2) * 1.2) : 0; // chỉ khi mưa vừa trở lên
    if (Math.abs(v - this.last) < 0.03) return;
    this.last = v;
    if (v === 0 && !this.el) return;
    this._make();
    if (this.el) this.el.style.opacity = String(v);
  }

  dispose() {
    if (this.el) this.el.remove();
    this.el = null;
  }
}

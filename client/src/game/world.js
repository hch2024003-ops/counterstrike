// Thế giới 3D: bản đồ PBR, bầu trời, ánh sáng, hậu kỳ, người chơi khác, hiệu ứng.
import * as THREE from 'three';
import { applyHeightFog } from '../gfx/heightfog.js';
import { getMapData } from './maps.js';
import { INTERP_DELAY_MS } from '../config.js';
import { EYE } from './controller.js';
import { SnapshotBuffer, ClockSync } from '../multiplayer/interp.js';
import { buildEnvironment } from '../gfx/environment.js';
import { makeSky, makeEnvironment, setSkyTheme } from '../gfx/sky.js';
import { Post } from '../gfx/post.js';
import { Fx } from '../gfx/fx.js';
import { GrenadeFx } from '../gfx/grenadefx.js';
import { AmbientFx } from '../gfx/ambientfx.js';
import { Weather } from '../gfx/weather.js';
import { Decals, GRIME, WET, disableGrime } from '../gfx/surfacefx.js';
import { visuals } from '../gfx/visuals.js';
import { Character, makeCorpse, updateCorpse } from '../gfx/characters.js';
import { faceNormalAt } from '../gfx/impact.js';
import { setAnisotropy } from '../gfx/textures.js';

applyHeightFog(); // sương mù theo độ cao: phải chạy trước khi vật liệu nào được biên dịch
const MAP = getMapData('warehouse');
export const MAP_DATA = MAP;

const boxesOf = (data) => data.boxes.map((b) => ({
  minX: b.p[0] - b.s[0] / 2, maxX: b.p[0] + b.s[0] / 2,
  minY: b.p[1] - b.s[1] / 2, maxY: b.p[1] + b.s[1] / 2,
  minZ: b.p[2] - b.s[2] / 2, maxZ: b.p[2] + b.s[2] / 2,
}));
let AABBS = boxesOf(MAP);

class RemotePlayer {
  constructor(id, name, team, showName) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.alive = false;
    this.pitch = 0;
    this.buf = new SnapshotBuffer();
    this.lastX = 0;
    this.lastZ = 0;
    this.lastY = 0;
    this.hasLast = false;
    this.stepDist = 0;
    this.speed = 0;
    this.crouch = false; // từ snapshot
    this.ct = 0; // mức ngồi 0..1 (mượt dần) để hạ thấp thân hình
    this.eyeH = EYE; // độ cao mắt hiện tại (dùng khi theo dõi người khác)
    this.ch = new Character(name, team, showName);
    this.group = this.ch.group;
    this.head = this.ch.head;
    this.arms = this.ch.arms;
  }
  setSlot(slot) {
    this.ch.setSlot(slot);
  }
  dispose() {
    this.ch.dispose();
  }
}

export class World {
  constructor(container) {
    // MSAA phần cứng rất tốn ở độ phân giải cao: chỉ bật khi màn hình ≤ 2560×1440 (vật lý).
    const px = window.innerWidth * window.innerHeight * (window.devicePixelRatio || 1) ** 2;
    this.interpDelay = INTERP_DELAY_MS; // server báo giá trị thực khi vào phòng (LAN dùng 50 ms)
    this.renderer = new THREE.WebGLRenderer({ antialias: px <= 2560 * 1440, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false; // ta reset tay mỗi khung để đếm đủ cả các lần vẽ
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scale = 1; // Render Scale (hệ số độ phân giải dựng 3D so với độ phân giải màn hình)
    this.gfx = null; // thông số đồ họa đang áp dụng
    this.onStep = null;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.sky = makeSky();
    this.scene.add(this.sky);
    this.envTex = null;
    try {
      this.envTex = makeEnvironment(this.renderer);
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 0.9;
    } catch (e) {
      console.warn('[gfx] Không tạo được bản đồ môi trường:', e);
    }
    this.mapId = MAP.id || 'warehouse';
    WET.uniform.value = MAP.theme && MAP.theme.wet !== undefined ? MAP.theme.wet : 0.5;
    this.env = buildEnvironment(this.scene, MAP, this.renderer);
    this.sun = this.env.sun;
    this.fx = new Fx(this.scene);
    this.gren = new GrenadeFx(this.scene, this.fx);
    this.decals = new Decals(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.weather = new Weather(this); // Environment FX: mưa, sấm chớp, gió, sương, bụi, lá, tuyết (toàn bộ bằng shader)
    this.weather.setMap(this.mapId);
    // Shader lỗi trên máy này: báo lên màn hình và tự tắt hiệu ứng gây lỗi (không làm hỏng toàn cảnh)
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const src = gl.getShaderSource(fs) || '';
      const log = (gl.getShaderInfoLog(vs) || '') + (gl.getShaderInfoLog(fs) || '');
      const kind = src.includes('vWPos') ? 'bám bẩn' : src.includes('uSharp') ? 'làm nét' : 'khác';
      if (window.__fatal) window.__fatal.once('shader-' + kind, `Lỗi shader (${kind}); game đã tự tắt hiệu ứng này`, log.slice(0, 500));
      if (kind === 'bám bẩn') disableGrime();
      else if (kind === 'làm nét') this.post.disableSharpen();
    };
    this.corpses = [];
    this.time = 0;

    this.roster = new Map();
    this.remotes = new Map();
    this.hiddenId = 0;
    this.effects = [];
    this.onResize = null;
    this.clock = new ClockSync();
    this._s = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

    window.addEventListener('resize', () => this.resize());
    this.beamMeshes = [];
    this.env.root.traverse((o) => { if (o.userData.beam) this.beamMeshes.push(o); });
    this.applyGfx({ shadow: 3, shadowSize: 2048, ao: 0, post: 1, fx: 2, scale: 1, aniso: 8 });
  }

  // Hiệu ứng không khí của bản đồ (cát bay, hoa rơi, sương, mưa). kinds: mảng tên hoặc undefined.
  setAmbient(kinds) {
    this._ambKinds = kinds || [];
    this.applyAmbient();
  }

  // Khi hệ thống Environment FX bật thì nó tự lo mưa (có điều khiển bật/tắt, cường độ, gió); bỏ lớp mưa phùn cũ để không chồng hai lớp mưa.
  applyAmbient() {
    let kinds = this._ambKinds || [];
    if (this.weather && this.weather.settings.enabled) kinds = kinds.filter((k) => k !== 'rain');
    const sig = kinds.join(',');
    if (sig === this._ambSig && this.ambient !== undefined) return;
    this._ambSig = sig;
    if (this.ambient) this.ambient.dispose();
    this.ambient = kinds.length ? new AmbientFx(this.scene, kinds) : null;
    if (this.ambient && this.gfx) this.ambient.setVisible(this.gfx.fx >= 1);
  }

  // Tên card đồ họa (nếu trình duyệt cho phép đọc), dùng để chọn mức đồ họa Auto ban đầu.
  gpuName() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    } catch { return ''; }
  }

  // Dựng lại môi trường của bản đồ hiện tại (ví dụ sau khi nạp xong texture chất lượng cao).
  reloadMap() {
    const id = this.mapId;
    this.mapId = null;
    return this.loadMap(id);
  }

  // Đổi bản đồ: dựng lại môi trường, ánh sáng, trời và hộp va chạm hiển thị. Trả về dữ liệu bản đồ.
  loadMap(id) {
    const data = getMapData(id);
    if (this.mapId === data.id) return data;
    this.mapId = data.id;
    if (this.weather) this.weather.restore(); // trả ánh sáng/sương về gốc trước khi bỏ môi trường cũ
    const old = this.env;
    this.scene.remove(old.root, old.sun, old.sun.target, old.hemi, old.bounce, old.dust);
    old.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); // vật liệu/texture dùng chung nên giữ lại
    if (old.sun.shadow.map) old.sun.shadow.map.dispose();
    setSkyTheme(this.sky, data.theme);
    WET.uniform.value = data.theme && data.theme.wet !== undefined ? data.theme.wet : 0;
    if (this.envTex) this.envTex.dispose();
    try {
      this.envTex = makeEnvironment(this.renderer, data.theme);
      this.scene.environment = this.envTex;
    } catch (e) {
      console.warn('[gfx] Không tạo được bản đồ môi trường:', e);
    }
    this.env = buildEnvironment(this.scene, data, this.renderer);
    this.sun = this.env.sun;
    AABBS = boxesOf(data);
    this.beamMeshes = [];
    this.env.root.traverse((o) => { if (o.userData.beam) this.beamMeshes.push(o); });
    this.clearEffects();
    if (this.weather) this.weather.setMap(data.id);
    this.setAmbient(data.theme && data.theme.ambient);
    const g = this.gfx;
    this.gfx = null;
    if (g) this.applyGfx(g); // áp lại bóng đổ/hiệu ứng cho đèn mặt trời mới
    return data;
  }

  // Áp dụng thông số đồ họa (từ settings.effective). Chỉ làm phần gì thật sự thay đổi, để Auto đổi mức không gây khựng:
  // không dựng lại scene, không tạo lại texture; shader chỉ biên dịch lại khi bật/tắt bóng đổ hoặc đèn loé nòng.
  applyGfx(e) {
    const p = this.gfx || {};
    this.gfx = e;
    const on = e.shadowSize > 0;
    if (p.shadowSize === undefined || (p.shadowSize > 0) !== on) {
      this.renderer.shadowMap.enabled = on;
      this.sun.castShadow = on;
      this.scene.traverse((o) => {
        if (o.material && !o.isSprite) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
        }
      });
    }
    if (on && p.shadowSize !== e.shadowSize) {
      this.sun.shadow.mapSize.set(e.shadowSize, e.shadowSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    if (p.post !== e.post || p.ao !== e.ao) this.post.setLevel(e.post, e.ao);
    if (this.ambient) this.ambient.setVisible(e.fx >= 1);
    this.gren.setQuality(e.fx);
    visuals.applyQuality(e);
    GRIME.uniform.value = e.fx >= 1 ? 1 : 0;
    if (p.fx !== e.fx) {
      this.fx.setLevel(e.fx);
      const cfg = this.fx.cfg;
      for (const b of this.beamMeshes) b.visible = cfg.beams;
      const dust = this.env.dust;
      dust.visible = cfg.dust > 0;
      dust.geometry.setDrawRange(0, Math.floor(dust.geometry.attributes.position.count * cfg.dust));
    }
    if (p.aniso !== e.aniso) setAnisotropy(Math.min(e.aniso, this.renderer.capabilities.getMaxAnisotropy()));
    if (p.scale !== e.scale) {
      this.scale = e.scale;
      this.resize();
    }
  }

  // Biên dịch trước shader (cảnh chính + súng cầm tay) để lần vẽ đầu không bị khựng.
  warmup(extraScene, extraCamera) {
    try {
      this.renderer.compile(this.scene, this.camera);
      if (extraScene) this.renderer.compile(extraScene, extraCamera);
    } catch (e) {
      /* không quan trọng */
    }
  }

  // Tỉ lệ điểm ảnh: độ phân giải gốc của màn hình (DPR, tối đa 2) nhân Render Scale. HUD là DOM nên luôn nét.
  get pixelRatio() {
    return Math.max(0.35, Math.min(window.devicePixelRatio || 1, 2) * this.scale);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h); // kích thước CSS giữ nguyên = cửa sổ; chỉ bộ đệm vẽ đổi theo Render Scale
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h, this.pixelRatio);
    if (this.onResize) this.onResize(w / h);
  }

  // ---------- Người chơi khác ----------
  setRoster(roster) {
    this.roster = roster;
    for (const [id, rp] of this.remotes) {
      const info = roster.get(id);
      if (!info || info.team !== rp.team) this.removeRemote(id);
    }
  }

  removeRemote(id) {
    const rp = this.remotes.get(id);
    if (!rp) return;
    this.scene.remove(rp.group);
    rp.dispose();
    this.remotes.delete(id);
  }

  clearRemotes() {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
  }

  // ts: thời điểm snapshot theo đồng hồ server; recvNow: lúc nhận theo đồng hồ client (performance.now()).
  applySnapshot(list, ts, recvNow, myId, myTeam) {
    const t = this.clock.map(ts, recvNow);
    const seen = new Set();
    for (const e of list) {
      const [id, x, y, z, yaw, pitch, , slot, cr] = e;
      if (id === myId) continue;
      const info = this.roster.get(id);
      if (!info) continue;
      let rp = this.remotes.get(id);
      if (!rp) {
        rp = new RemotePlayer(id, info.name, info.team, info.team === myTeam);
        this.scene.add(rp.group);
        this.remotes.set(id, rp);
      }
      if (!rp.alive) {
        // Vừa hồi sinh: bỏ dữ liệu cũ để không nội suy từ vị trí vòng trước.
        rp.buf.clear();
        rp.hasLast = false;
      }
      rp.buf.push(t, x, y, z, yaw, pitch);
      rp.setSlot(slot);
      rp.crouch = cr === 1;
      rp.alive = true;
      seen.add(id);
    }
    for (const rp of this.remotes.values()) {
      if (!seen.has(rp.id) && rp.alive) {
        rp.alive = false;
        rp.buf.clear();
        if (rp.group.visible && rp.hasLast) this.spawnCorpse(rp);
        rp.group.visible = false;
      }
    }
  }

  aliveRemotes() {
    const out = [];
    for (const rp of this.remotes.values()) if (rp.alive) out.push(rp);
    return out.sort((a, b) => a.id - b.id);
  }

  // ---------- Hiệu ứng ----------
  spawnCorpse(rp) {
    const c = makeCorpse(rp.ch, rp.group.position.x, rp.group.position.y, rp.group.position.z, rp.group.rotation.y);
    this.scene.add(c.pivot);
    this.corpses.push(c);
    while (this.corpses.length > 8) this.removeCorpse(this.corpses.shift());
  }

  removeCorpse(c) {
    this.scene.remove(c.pivot);
  }

  // Vệt đạn + va chạm. hit: trúng người (từ server). Trả về điểm trúng để nơi khác dùng nếu cần.
  addTracer(from, to, color, hit) {
    this.fx.tracer(from, to);
    const p = [to[0], to[1], to[2]];
    const nrm = hit ? null : faceNormalAt(AABBS, p);
    this.fx.impact(p, nrm, !!hit);
    if (nrm && this.gfx && this.gfx.fx >= 1) this.decals.hole(p, nrm); // vết đạn bám lại trên tường
  }

  muzzleFlash(pos, strength) {
    this.fx.muzzleFlash(pos, strength);
  }

  // ---------- Cập nhật & vẽ ----------
  // now: performance.now() (ms). Đối thủ được vẽ ở quá khứ INTERP_DELAY_MS để luôn có 2 snapshot để nội suy.
  update(dt, now) {
    const renderT = now - this.interpDelay;
    const s = this._s;
    for (const rp of this.remotes.values()) {
      if (!rp.alive || !rp.buf.sample(renderT, s)) continue;
      const g = rp.group;
      g.position.set(s.x, s.y, s.z);
      g.rotation.y = s.yaw;
      rp.pitch = s.pitch;
      // Ngồi: hạ thấp (nén) thân hình theo tỉ lệ khớp hitbox server (mắt 1.6 → 1.15). Animation ngồi thật cần model GLB có rig.
      rp.ct += ((rp.crouch ? 1 : 0) - rp.ct) * Math.min(1, dt * 14);
      g.scale.y = 1 - 0.28 * rp.ct;
      rp.eyeH = EYE - 0.45 * rp.ct;
      g.visible = rp.id !== this.hiddenId;

      // Tiếng bước chân: mỗi ~2.3m đi bộ trên mặt đất.
      if (rp.hasLast) {
        const d = Math.hypot(s.x - rp.lastX, s.z - rp.lastZ);
        if (d < 1.5) rp.stepDist += d;
        if (rp.stepDist > 2.3) {
          rp.stepDist = 0;
          if (this.onStep) this.onStep(s.x, s.z, rp.id);
        }
      }
      if (rp.hasLast && dt > 0) {
        const inst = Math.hypot(s.x - rp.lastX, s.z - rp.lastZ) / dt;
        rp.speed += (Math.min(inst, 9) - rp.speed) * Math.min(1, dt * 10);
      }
      rp.ch.animate(dt, rp.speed, s.pitch, s.y > 0.12 && Math.abs(s.y - rp.lastY) > 0.002);
      rp.lastX = s.x;
      rp.lastY = s.y;
      rp.lastZ = s.z;
      rp.hasLast = true;
    }

    this.time += dt;
    this.fx.update(dt);
    this.gren.update(dt);
    this.decals.update(dt);
    if (this.ambient) this.ambient.update(dt, this.camera.position);
    if (this.weather) this.weather.update(dt);
    this.env.update(dt, this.camera.position);
    this.sky.material.uniforms.uTime.value = this.time;
    this.sky.position.copy(this.camera.position);
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      if (!updateCorpse(this.corpses[i], dt)) {
        this.removeCorpse(this.corpses[i]);
        this.corpses.splice(i, 1);
      }
    }
  }

  setCamera(x, y, z, yaw, pitch) {
    this.camera.position.set(x, y, z);
    this.camera.rotation.set(pitch, yaw, 0);
  }

  // Góc nhìn dọc (độ): đổi khi vào/ra ống ngắm.
  setFov(deg) {
    if (Math.abs(this.camera.fov - deg) < 0.01) return;
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  get boxes() { return AABBS; }

  // Bản đồ lớn: đưa vùng bóng đổ theo người chơi, làm tròn theo texel để bóng không nhấp nháy khi di chuyển.
  followShadow() {
    const e = this.env;
    if (!e.follow || !this.sun.castShadow) return;
    const texel = (2 * e.shadowExt) / this.sun.shadow.mapSize.x;
    const x = Math.round(this.camera.position.x / texel) * texel;
    const z = Math.round(this.camera.position.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + e.sunDir.x * e.sunDist, e.sunDir.y * e.sunDist, z + e.sunDir.z * e.sunDist);
    this.sun.target.updateMatrixWorld();
  }

  render(viewmodel) {
    this.followShadow();
    this.renderer.info.reset();
    if (this.post.enabled) {
      this.post.render(1 / 60, this.time);
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
    if (viewmodel) {
      this.renderer.clearDepth();
      this.renderer.render(viewmodel.scene, viewmodel.camera);
    }
  }

  clearEffects() {
    this.fx.clear();
    this.gren.clear();
    this.decals.clear();
    for (const c of this.corpses) this.removeCorpse(c);
    this.corpses.length = 0;
  }
}

export { EYE };

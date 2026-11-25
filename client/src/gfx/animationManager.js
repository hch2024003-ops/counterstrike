// Điều khiển hoạt cảnh nhân vật GLB: chọn clip theo trạng thái (đứng/đi/chạy/nhảy/ngồi/chết), chuyển mượt, clip một lần (thay đạn, chết).
import * as THREE from 'three';
import { STATES, findClipName, pickLocomotion, locomotionTimeScale } from './animLogic.js';

export class AnimationController {
  constructor(root, clips) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    const names = clips.map((c) => c.name);
    for (const st of STATES) {
      const n = findClipName(names, st);
      if (n) this.actions[st] = this.mixer.clipAction(clips.find((c) => c.name === n));
    }
    this.current = null;
    this.oneShot = null;
    this.mixer.addEventListener('finished', (e) => {
      if (this.oneShot && this.actions[this.oneShot] === e.action && this.oneShot !== 'death') this.oneShot = null;
    });
  }

  has(state) { return !!this.actions[state]; }

  play(state, { fade = 0.15 } = {}) {
    const next = this.actions[state];
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  // Clip phát một lần (reload, fire, death). Chết giữ nguyên tư thế cuối.
  playOnce(state) {
    const a = this.actions[state];
    if (!a) return false;
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.oneShot = state;
    this.play(state, { fade: 0.08 });
    return true;
  }

  // info: { speed, airborne, crouch, dead } — gọi mỗi khung hình.
  setLocomotion(info) {
    if (info.dead && !this.oneShot) { if (!this.playOnce('death')) this.play('idle'); return; }
    if (this.oneShot) return;
    const st = pickLocomotion(info);
    const use = this.actions[st] ? st : (st === 'crouch_walk' ? 'crouch' : st === 'crouch' ? 'idle' : st === 'run' ? 'walk' : 'idle');
    this.play(use);
    const a = this.actions[use];
    if (a) a.timeScale = locomotionTimeScale(use, info.speed);
  }

  update(dt) { this.mixer.update(dt); }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}

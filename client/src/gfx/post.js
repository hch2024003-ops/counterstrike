// Hậu kỳ kiểu FPS cạnh tranh: MSAA, bloom nhẹ, AO (tuỳ chọn), tone mapping ACES, chỉnh màu nhẹ, tối góc nhẹ.
// Không có grain/chromatic aberration (làm mờ đối thủ). Các pass được tạo một lần và bật/tắt bằng cờ để Auto
// đổi mức không phải dựng lại hay biên dịch lại shader mỗi lần.
// Nếu thiết bị không hỗ trợ, tự tắt và game vẫn vẽ bình thường (xem World.render).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVig: { value: 0.25 },
    uSharp: { value: 0.45 },
    uDither: { value: 1.0 / 255.0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uDither;
    uniform float uVig;
    uniform float uSharp;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      //SHARPEN-BEGIN
      // Làm nét nhẹ (unsharp mask 4 điểm, giới hạn để không viền sáng): chi tiết gạch/kim loại/đối thủ rõ hơn
      vec2 tx = 1.0 / vec2(textureSize(tDiffuse, 0));
      vec3 blur = 0.25 * (texture2D(tDiffuse, vUv + vec2(tx.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(tx.x, 0.0)).rgb
                        + texture2D(tDiffuse, vUv + vec2(0.0, tx.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, tx.y)).rgb);
      col += clamp(col - blur, -0.08, 0.08) * uSharp * 2.0;
      //SHARPEN-END
      // Chỉnh màu nhẹ: tương phản và bão hoà vừa phải, giữ rõ chi tiết vùng tối
      col = (col - 0.5) * 1.05 + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.08);
      // Phân tông: bóng đổ hơi lạnh, vùng sáng hơi ấm (cảm giác phim/game thi đấu)
      col *= mix(vec3(0.96, 0.995, 1.05), vec3(1.0), smoothstep(0.0, 0.45, l));
      col *= mix(vec3(1.0), vec3(1.05, 1.0, 0.95), smoothstep(0.55, 1.0, l));
      // Tối góc nhẹ (smoothstep đúng thứ tự cạnh: edge0 < edge1)
      vec2 c = vUv - 0.5;
      float v = 1.0 - smoothstep(0.30, 0.95, length(c * vec2(1.0, 0.92)));
      col *= mix(1.0, v, uVig);
      // Dither nhẹ (±0.5/255) chống vệt bậc thang ở bầu trời/sương mù gradient
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      col += (n - 0.5) * uDither;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

// post: 0 tắt (vẽ trực tiếp), 1 bloom nhẹ + MSAA x2, 2 bloom + MSAA x4. ao: 0 tắt, 1 vừa, 2 cao.
export const BLOOM = [0, 0.2, 0.3];
export const VIGNETTE = [0, 0.22, 0.3];

export class Post {
  // Tắt bước làm nét nếu shader lỗi trên GPU này (hậu kỳ còn lại vẫn chạy).
  disableSharpen() {
    if (!this.grade || this._noSharp) return;
    this._noSharp = true;
    const mat = this.grade.material;
    mat.fragmentShader = mat.fragmentShader.replace(/\/\/SHARPEN-BEGIN[\s\S]*?\/\/SHARPEN-END/, '');
    mat.needsUpdate = true;
  }

  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloom = null;
    this.ao = null;
    this.grade = null;
    this.samples = 0;
    this.level = 0; // post
    this.aoLevel = 0;
    this.failed = false;
    this.w = 1280;
    this.h = 720;
    this.pr = 1;
  }

  _create(samples) {
    this._destroy();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x || this.w, size.y || this.h, { type: THREE.HalfFloatType, samples });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(this.pr);
    composer.setSize(this.w, this.h);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.2, 0.6, 0.95);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    this.composer = composer;
    this.bloom = bloom;
    this.grade = grade;
    this.samples = samples;
    this.ao = null; // AO được tạo khi cần lần đầu
  }

  _ensureAo() {
    if (this.ao || !this.composer) return;
    const ao = new GTAOPass(this.scene, this.camera, this.w * this.pr, this.h * this.pr);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    // GTAO chèn ngay sau RenderPass, trước bloom
    this.composer.insertPass(ao, 1);
    this.ao = ao;
  }

  // Đặt mức hậu kỳ và AO. Rẻ khi chỉ đổi cờ; chỉ dựng lại khi cần số mẫu MSAA khác hoặc lần đầu.
  setLevel(post, ao) {
    if (this.failed) return;
    try {
      if (post <= 0) {
        this.level = 0;
        this.aoLevel = 0;
        return;
      }
      const samples = post >= 2 ? 4 : 2;
      if (!this.composer || this.samples !== samples) this._create(samples);
      this.level = post;
      this.bloom.strength = BLOOM[post];
      this.grade.uniforms.uVig.value = VIGNETTE[post];
      this.aoLevel = ao;
      if (ao > 0) {
        this._ensureAo();
        this.ao.updateGtaoMaterial({
          radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.0,
          samples: ao >= 2 ? 16 : 8, distanceFallOff: 1, screenSpaceRadius: false,
        });
      }
      if (this.ao) this.ao.enabled = ao > 0;
    } catch (e) {
      console.warn('[gfx] Không bật được hậu kỳ, dùng vẽ trực tiếp:', e);
      this.failed = true;
      this._destroy();
      this.level = 0;
    }
  }

  get enabled() {
    return this.level > 0 && !!this.composer && !this.failed;
  }

  setSize(w, h, pr) {
    this.w = w;
    this.h = h;
    this.pr = pr;
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
  }

  render(dt) {
    this.composer.render(dt);
  }

  _destroy() {
    if (this.composer) {
      for (const p of this.composer.passes) if (p.dispose) p.dispose();
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.composer = null;
    this.bloom = null;
    this.ao = null;
    this.grade = null;
    this.samples = 0;
  }

  dispose() {
    this._destroy();
    this.level = 0;
  }
}

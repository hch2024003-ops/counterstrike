// Bầu trời 0.5: ban ngày nhiều mây mỏng, trung tính (xám xanh), mặt trời cao nên bóng đổ ngắn và dễ đọc đối thủ.
// Vẫn dựng bản đồ môi trường (PMREM) từ chính bầu trời để kim loại/nhựa phản chiếu đúng tông lạnh trung tính.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.78, -0.28).normalize(); // cao trên đầu: bóng ngắn, ít che đối thủ
export const SUN_COLOR = new THREE.Color(1.0, 0.95, 0.88);
export const FOG_COLOR = new THREE.Color(0.62, 0.66, 0.7);

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // luôn ở xa nhất
}`;

const frag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;
uniform float uTime;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunCol;
uniform float uFlash;
uniform float uOvercast;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
  col = mix(col, uTop, smoothstep(0.2, 0.9, h));

  // Quầng sáng mặt trời dịu, không có đĩa chói
  float s = max(dot(d, uSun), 0.0);
  col += uSunCol * pow(s, 8.0) * 0.18;
  col += uSunCol * pow(s, 90.0) * 0.5;

  // Mây tầng xám nhạt, mềm
  if (d.y > 0.02) {
    vec2 uv = d.xz / (d.y + 0.3) * 1.2 + vec2(uTime * 0.003, 0.0);
    float c = fbm(uv * 1.5);
    float cover = smoothstep(0.42, 0.75, c);
    vec3 cloudCol = mix(vec3(0.62, 0.65, 0.69), vec3(0.88, 0.89, 0.9), smoothstep(0.4, 0.8, c));
    col = mix(col, cloudCol, cover * smoothstep(0.02, 0.3, d.y) * 0.8);
  }
  col = mix(col, uHorizon * 0.92, (1.0 - smoothstep(-0.2, 0.0, d.y)));
  // Thời tiết: trời âm u (xám dần) và chớp sáng khi sấm sét; cả hai bằng 0 thì không đổi gì.
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(lum) * vec3(0.82, 0.86, 0.92), uOvercast * 0.55);
  col += vec3(0.7, 0.78, 1.0) * uFlash * (0.35 + 0.65 * smoothstep(-0.1, 0.5, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

// Bảng màu trời theo bản đồ: theme.sky = { top, mid, horizon }, theme.sunColor. Thiếu thì dùng mặc định.
export function setSkyTheme(mesh, theme) {
  const u = mesh.material.uniforms;
  const sky = (theme && theme.sky) || null;
  u.uTop.value.set(sky ? sky.top : '#4d6b94');
  u.uMid.value.set(sky ? sky.mid : '#8099b3');
  u.uHorizon.value.set(sky ? sky.horizon : '#b3bdc4');
  u.uSunCol.value.set(theme && theme.sunColor ? theme.sunColor : '#ffedcc');
  const d = theme && theme.sunDir ? new THREE.Vector3(...theme.sunDir).normalize() : SUN_DIR;
  u.uSun.value.copy(d);
}

export function makeSky(theme) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(0.3, 0.42, 0.58) },
      uMid: { value: new THREE.Color(0.5, 0.6, 0.7) },
      uHorizon: { value: new THREE.Color(0.7, 0.74, 0.77) },
      uSunCol: { value: new THREE.Color(1.0, 0.93, 0.8) },
      uFlash: { value: 0 },
      uOvercast: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000; // vẽ sau vật thể đặc: early-z loại bỏ phần bị che, shader mây chỉ chạy ở vùng trời thật
  if (theme) setSkyTheme(mesh, theme);
  return mesh;
}

// Bản đồ môi trường (PMREM) chụp từ chính bầu trời.
export function makeEnvironment(renderer, theme) {
  const envScene = new THREE.Scene();
  const sky = makeSky(theme);
  envScene.add(sky);
  // Mặt đất giả xám bê tông để phản chiếu ánh nền dưới chân
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(300, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.26, 0.27, 0.28) })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  ground.geometry.dispose();
  ground.material.dispose();
  return rt.texture;
}

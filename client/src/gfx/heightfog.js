// Sương mù theo độ cao: vá các đoạn shader fog của Three.js để sương dày ở sát mặt đất và mỏng dần khi lên cao.
// Áp cho mọi vật liệu có fog (THREE.Fog thường), không cần đổi vật liệu hay scene.
// Gọi applyHeightFog() MỘT LẦN trước khi vật liệu nào được biên dịch (xem world.js). Gọi lại là vô hại.
// Nếu phiên bản Three.js đổi nội dung chunk khiến không vá được, hàm trả false và giữ sương mù mặc định.
import * as THREE from 'three';

// strength: 0 = sương đều như cũ, 1 = rất dày sát đất. falloff: độ giảm theo mét độ cao (lớn = mỏng nhanh hơn).
export const HEIGHT_FOG = { strength: 0.5, falloff: 0.1 };

let applied = false;

export function applyHeightFog() {
  if (applied) return true;
  const C = THREE.ShaderChunk;
  const need = ['fog_pars_vertex', 'fog_vertex', 'fog_pars_fragment', 'fog_fragment'];
  if (!need.every((k) => typeof C[k] === 'string')) return false;
  const LINEAR = 'smoothstep( fogNear, fogFar, vFogDepth )';
  if (!C.fog_fragment.includes(LINEAR) || !C.fog_pars_vertex.includes('varying float vFogDepth;')
    || !C.fog_pars_fragment.includes('varying float vFogDepth;') || !C.fog_vertex.includes('vFogDepth = - mvPosition.z;')) return false;

  const S = HEIGHT_FOG.strength.toFixed(3);
  const F = HEIGHT_FOG.falloff.toFixed(3);
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogY;');
  // Độ cao thế giới của đỉnh = vị trí camera-space xoay ngược về thế giới + vị trí camera. Đúng cả với InstancedMesh.
  C.fog_vertex = C.fog_vertex.replace(
    'vFogDepth = - mvPosition.z;',
    'vFogDepth = - mvPosition.z;\n\tvFogY = (mvPosition.xyz * mat3(viewMatrix)).y + cameraPosition.y;'
  );
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogY;');
  C.fog_fragment = C.fog_fragment.replace(
    LINEAR,
    `${LINEAR} * ( ${(1 - HEIGHT_FOG.strength).toFixed(3)} + ${S} * exp( - max( vFogY, 0.0 ) * ${F} ) )`
  );
  applied = true;
  return true;
}

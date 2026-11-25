// Súng 0.5: dựng từ profile cạnh bên (extrude có vát), ray picatinny, ốp tản nhiệt, nòng/đầu giảm giật bằng lathe.
// Giữ nguyên API cũ: buildGun(id) -> { group, muzzle, eject, len }, buildHands(id), GUN_MAT.
// Hướng nòng về -Z, gốc ở khối thân; muzzle/eject giữ đúng toạ độ cũ nên không ảnh hưởng gameplay.
import * as THREE from 'three';
import { rbox, side, tubeZ, latheZ, limb, ellipsoid, xform, buildGroup, noiseTexture } from './shapes.js';
import { visuals } from './visuals.js';

const rough = noiseTexture(7, 128, 120, 255, 5);

export const GUN_MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.42, metalness: 0.9, roughnessMap: rough }),
  dark: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5, metalness: 0.7, roughnessMap: rough }),
  poly: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.78, metalness: 0.05, roughnessMap: rough }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4328, roughness: 0.55, metalness: 0.03, roughnessMap: rough }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb8923f, roughness: 0.35, metalness: 0.9 }),
  dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.2), toneMapped: false }),
  glass: new THREE.MeshStandardMaterial({ color: 0x0a1218, roughness: 0.05, metalness: 0.6 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xb98563, roughness: 0.72, metalness: 0 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.85, metalness: 0, roughnessMap: rough }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4b5340, roughness: 0.92, metalness: 0, roughnessMap: rough }),
};

// Ray picatinny: dãy răng nhỏ dọc theo z.
function rail(z0, z1, y, w = 0.026, step = 0.016) {
  const out = [rbox(w * 0.8, 0.006, z1 - z0, 0.0015, 0, y - 0.004, (z0 + z1) / 2)];
  for (let z = z0 + step / 2; z < z1; z += step) out.push(rbox(w, 0.006, step * 0.55, 0.001, 0, y, z));
  return out;
}

const MODELS = {
  rifle() {
    const P = { steel: [], dark: [], poly: [], wood: [], brass: [], dot: [], glass: [] };
    // Hộp khoá nòng dưới + trên (profile cạnh bên)
    P.dark.push(side([[-0.13, -0.04], [0.2, -0.04], [0.23, -0.02], [0.23, 0.04], [-0.13, 0.04], [-0.14, 0.0]], 0.052, 0.004));
    P.steel.push(side([[-0.12, 0.034], [0.22, 0.034], [0.23, 0.052], [0.17, 0.066], [-0.1, 0.066], [-0.13, 0.05]], 0.046, 0.003));
    P.steel.push(...rail(-0.12, 0.2, 0.07));
    // Cửa thoát vỏ + cần lên đạn + nút khoá
    P.dark.push(rbox(0.006, 0.024, 0.07, 0.002, 0.027, 0.018, -0.03));
    P.steel.push(rbox(0.012, 0.014, 0.03, 0.003, 0.03, 0.034, 0.05));
    P.dark.push(rbox(0.006, 0.014, 0.022, 0.002, -0.028, -0.005, 0.01));
    // Ốp lót nòng polymer có khe tản nhiệt + ray trên, ray dưới ngắn
    P.poly.push(side([[-0.12, -0.034], [-0.52, -0.026], [-0.52, 0.03], [-0.12, 0.038]], 0.05, 0.005));
    for (let z = -0.18; z > -0.5; z -= 0.045) P.dark.push(rbox(0.054, 0.008, 0.02, 0.002, 0, 0.0, z));
    P.steel.push(...rail(-0.5, -0.13, 0.036, 0.022, 0.018));
    P.steel.push(...rail(-0.44, -0.2, -0.032, 0.02, 0.018));
    // Khối khí + nòng + ống dẫn + đầu giảm giật
    P.steel.push(rbox(0.026, 0.034, 0.04, 0.005, 0, 0.012, -0.55));
    P.steel.push(tubeZ(0.0105, 0.0105, -0.52, -0.8, 0, 0.012, 14));
    P.steel.push(tubeZ(0.007, 0.007, -0.53, -0.7, 0, 0.034, 8));
    P.dark.push(latheZ([[0.011, -0.8], [0.019, -0.805], [0.019, -0.825], [0.016, -0.83], [0.019, -0.835], [0.019, -0.855], [0.014, -0.87], [0.0, -0.87]], 0, 0.012, 16));
    // Đầu ruồi + chân đế
    P.dark.push(side([[-0.74, 0.02], [-0.72, 0.02], [-0.725, 0.056], [-0.735, 0.056]], 0.006, 0.0008));
    P.dark.push(rbox(0.026, 0.016, 0.03, 0.003, 0, 0.026, -0.73));
    // Hộp tiếp đạn cong (profile), có gân
    P.steel.push(side([[-0.05, -0.036], [0.012, -0.036], [-0.004, -0.1], [-0.034, -0.16], [-0.058, -0.208], [-0.118, -0.196], [-0.098, -0.15], [-0.078, -0.1]], 0.032, 0.0035));
    P.dark.push(side([[-0.058, -0.208], [-0.118, -0.196], [-0.12, -0.206], [-0.06, -0.218]], 0.034, 0.002));
    P.dark.push(rbox(0.036, 0.04, 0.012, 0.002, 0, -0.024, -0.07)); // cổ hộp tiếp đạn
    // Tay cầm + cò + bảo vệ cò
    P.poly.push(side([[0.07, -0.03], [0.115, -0.03], [0.158, -0.138], [0.105, -0.148], [0.088, -0.12]], 0.034, 0.005));
    P.dark.push(rbox(0.008, 0.034, 0.012, 0.002, 0, -0.056, 0.055));
    P.dark.push(rbox(0.01, 0.006, 0.07, 0.002, 0.014, -0.075, 0.03));
    P.dark.push(rbox(0.01, 0.006, 0.07, 0.002, -0.014, -0.075, 0.03));
    P.dark.push(rbox(0.036, 0.006, 0.01, 0.002, 0, -0.075, -0.004));
    // Báng gập: hai thanh + má + đế cao su
    P.poly.push(side([[0.22, 0.03], [0.31, 0.024], [0.425, -0.004], [0.428, -0.112], [0.31, -0.068], [0.22, -0.038]], 0.04, 0.006));
    P.dark.push(rbox(0.044, 0.118, 0.02, 0.005, 0, -0.058, 0.432));
    P.dark.push(rbox(0.03, 0.01, 0.1, 0.003, 0, 0.026, 0.3));
    // Ống ngắm chấm đỏ: đế, thân, kính, chấm
    P.dark.push(rbox(0.03, 0.012, 0.06, 0.003, 0, 0.078, 0.02));
    P.dark.push(rbox(0.04, 0.042, 0.075, 0.008, 0, 0.1, 0.02));
    P.dark.push(rbox(0.044, 0.008, 0.08, 0.003, 0, 0.123, 0.02));
    P.glass.push(rbox(0.032, 0.028, 0.004, 0.001, 0, 0.1, -0.019));
    P.dot.push(rbox(0.004, 0.004, 0.004, 0.0005, 0, 0.104, -0.021));
    // Dây đeo gắn (khuyên) ở hai đầu
    P.steel.push(tubeZ(0.004, 0.004, 0.19, 0.2, 0.03, 0.0, 6));
    return {
      group: buildGroup(P, GUN_MAT),
      muzzle: new THREE.Vector3(0, 0.012, -0.87),
      eject: new THREE.Vector3(0.04, 0.02, -0.02),
      len: 0.88,
    };
  },

  pistol() {
    const P = { steel: [], dark: [], poly: [], dot: [] };
    // Thanh trượt có rãnh trượt, khuyết ngắm, đầu ruồi
    P.steel.push(side([[-0.19, 0.012], [0.062, 0.012], [0.066, 0.05], [0.058, 0.056], [-0.17, 0.056], [-0.19, 0.04]], 0.03, 0.004));
    for (let i = 0; i < 6; i++) P.dark.push(rbox(0.034, 0.036, 0.004, 0.0012, 0, 0.034, 0.012 + i * 0.008));
    P.dark.push(rbox(0.02, 0.006, 0.014, 0.0015, 0, 0.06, 0.05));
    P.dark.push(rbox(0.006, 0.01, 0.008, 0.001, 0, 0.061, -0.16));
    P.dot.push(rbox(0.0025, 0.0025, 0.0025, 0.0003, 0, 0.0635, -0.1635));
    P.dark.push(rbox(0.006, 0.008, 0.03, 0.002, 0.016, 0.035, -0.02)); // cửa thoát vỏ
    // Khung + báng cầm có vân
    P.dark.push(side([[-0.15, 0.012], [0.066, 0.012], [0.07, -0.008], [0.1, -0.12], [0.06, -0.135], [0.036, -0.03], [-0.07, -0.03], [-0.13, -0.012]], 0.026, 0.003));
    P.poly.push(side([[0.07, -0.006], [0.098, -0.12], [0.064, -0.13], [0.04, -0.03]], 0.032, 0.004));
    for (let i = 0; i < 5; i++) P.dark.push(rbox(0.036, 0.004, 0.044, 0.001, 0, -0.03 - i * 0.018, 0.068 + i * 0.006));
    P.dark.push(rbox(0.008, 0.026, 0.01, 0.002, 0, -0.02, 0.012)); // cò
    P.dark.push(rbox(0.028, 0.006, 0.07, 0.002, 0, -0.038, -0.025)); // vành bảo vệ cò
    P.dark.push(rbox(0.026, 0.01, 0.07, 0.002, 0, -0.02, -0.07)); // ray dưới
    // Nòng nhô khỏi thanh trượt
    P.steel.push(tubeZ(0.0085, 0.0085, -0.19, -0.215, 0, 0.032, 12));
    return {
      group: buildGroup(P, GUN_MAT),
      muzzle: new THREE.Vector3(0, 0.032, -0.215),
      eject: new THREE.Vector3(0.02, 0.05, -0.04),
      len: 0.24,
    };
  },

  shotgun() {
    const P = { steel: [], dark: [], poly: [], wood: [] };
    // Thân máy + cửa nạp đạn dưới
    P.dark.push(side([[-0.12, -0.044], [0.17, -0.044], [0.19, -0.02], [0.19, 0.04], [-0.12, 0.04]], 0.05, 0.005));
    P.steel.push(rbox(0.012, 0.022, 0.07, 0.003, 0.028, 0.012, -0.02)); // cửa thoát vỏ
    P.steel.push(rbox(0.01, 0.01, 0.026, 0.003, 0.03, 0.026, 0.06)); // cần lên đạn
    // Nòng + ống tiếp đạn + vành giữ + đầu ruồi
    P.steel.push(tubeZ(0.017, 0.017, -0.12, -0.84, 0, 0.022, 16));
    P.steel.push(tubeZ(0.0135, 0.0135, -0.12, -0.62, 0, -0.026, 14));
    for (const z of [-0.3, -0.6]) P.dark.push(latheZ([[0.0, z], [0.022, z], [0.022, z - 0.016], [0.0, z - 0.016]], 0, -0.026, 12));
    P.steel.push(latheZ([[0.017, -0.82], [0.02, -0.826], [0.02, -0.84], [0.0, -0.84]], 0, 0.022, 14));
    P.dark.push(rbox(0.006, 0.014, 0.01, 0.0015, 0, 0.046, -0.8));
    // Tay bơm gỗ có rãnh
    P.wood.push(side([[-0.2, -0.05], [-0.46, -0.05], [-0.46, 0.0], [-0.2, 0.0]], 0.048, 0.006));
    for (let i = 0; i < 7; i++) P.dark.push(rbox(0.05, 0.004, 0.006, 0.0012, 0, -0.025, -0.24 - i * 0.032));
    // Báng gỗ cong + đế cao su
    P.wood.push(side([[0.18, 0.032], [0.3, 0.026], [0.43, -0.006], [0.435, -0.115], [0.3, -0.07], [0.18, -0.04]], 0.044, 0.008));
    P.dark.push(rbox(0.05, 0.118, 0.02, 0.005, 0, -0.06, 0.44));
    // Tay cầm, cò, bảo vệ cò
    P.poly.push(side([[0.08, -0.04], [0.12, -0.04], [0.145, -0.115], [0.1, -0.125]], 0.034, 0.005));
    P.dark.push(rbox(0.008, 0.03, 0.012, 0.002, 0, -0.06, 0.06));
    P.dark.push(rbox(0.026, 0.006, 0.08, 0.002, 0, -0.08, 0.035));
    return {
      group: buildGroup(P, GUN_MAT),
      muzzle: new THREE.Vector3(0, 0.022, -0.84),
      eject: new THREE.Vector3(0.04, 0.03, -0.05),
      len: 0.86,
    };
  },
};


// ---------------------------------------------------------------------------------------------
// Các súng bổ sung (0.7): AK, tiểu liên, bắn tỉa, đại liên, Desert Eagle, shotgun tự động.
// ---------------------------------------------------------------------------------------------
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mk = () => ({ steel: [], dark: [], poly: [], wood: [], brass: [], dot: [], glass: [] });

MODELS.ak = function ak() {
  const P = mk();
  P.dark.push(side([[-0.13, -0.04], [0.2, -0.04], [0.22, -0.02], [0.22, 0.045], [-0.13, 0.045], [-0.14, 0.0]], 0.05, 0.004));
  P.steel.push(side([[-0.12, 0.04], [0.22, 0.04], [0.22, 0.06], [0.16, 0.07], [-0.1, 0.07], [-0.12, 0.055]], 0.048, 0.003));
  P.wood.push(side([[-0.12, -0.032], [-0.5, -0.024], [-0.5, 0.03], [-0.12, 0.036]], 0.052, 0.006)); // ốp lót gỗ
  P.wood.push(side([[-0.12, 0.036], [-0.46, 0.033], [-0.46, 0.047], [-0.12, 0.052]], 0.04, 0.003));
  P.steel.push(tubeZ(0.0105, 0.0105, -0.5, -0.78, 0, 0.01, 14));
  P.steel.push(tubeZ(0.0075, 0.0075, -0.2, -0.66, 0, 0.034, 8)); // ống dẫn khí
  P.dark.push(latheZ([[0.011, -0.78], [0.017, -0.785], [0.017, -0.82], [0.013, -0.84], [0.0, -0.84]], 0, 0.01, 14));
  P.dark.push(side([[-0.7, 0.018], [-0.68, 0.018], [-0.685, 0.05], [-0.695, 0.05]], 0.006, 0.0008)); // đầu ruồi
  P.dark.push(rbox(0.012, 0.016, 0.03, 0.002, 0, 0.074, -0.04)); // thước ngắm sau
  P.steel.push(side([[-0.05, -0.036], [0.012, -0.036], [-0.012, -0.1], [-0.05, -0.16], [-0.095, -0.2], [-0.16, -0.19], [-0.13, -0.15], [-0.09, -0.1]], 0.034, 0.0035));
  P.wood.push(side([[0.07, -0.03], [0.115, -0.03], [0.15, -0.135], [0.1, -0.145], [0.085, -0.12]], 0.034, 0.005));
  P.dark.push(rbox(0.008, 0.034, 0.012, 0.002, 0, -0.056, 0.055));
  P.dark.push(rbox(0.036, 0.006, 0.07, 0.002, 0, -0.075, 0.03));
  P.wood.push(side([[0.22, 0.03], [0.32, 0.02], [0.43, -0.015], [0.43, -0.115], [0.32, -0.07], [0.22, -0.04]], 0.04, 0.007));
  P.dark.push(rbox(0.044, 0.1, 0.018, 0.005, 0, -0.065, 0.434));
  P.dark.push(rbox(0.006, 0.014, 0.05, 0.002, 0.027, 0.02, -0.02)); // cửa thoát vỏ
  return { group: buildGroup(P, GUN_MAT), muzzle: V3(0, 0.01, -0.84), eject: V3(0.04, 0.02, -0.02), len: 0.86 };
};

MODELS.smg = function smg() {
  const P = mk();
  P.dark.push(side([[-0.1, -0.04], [0.18, -0.04], [0.2, -0.02], [0.2, 0.045], [-0.1, 0.045], [-0.11, 0.0]], 0.05, 0.004));
  P.steel.push(...rail(-0.08, 0.18, 0.05, 0.022, 0.016));
  P.poly.push(side([[-0.1, -0.03], [-0.34, -0.026], [-0.34, 0.03], [-0.1, 0.036]], 0.048, 0.005));
  for (let z = -0.14; z > -0.32; z -= 0.035) P.dark.push(rbox(0.05, 0.008, 0.016, 0.002, 0, 0.0, z));
  P.steel.push(tubeZ(0.01, 0.01, -0.34, -0.42, 0, 0.012, 12));
  P.dark.push(latheZ([[0.013, -0.4], [0.021, -0.405], [0.021, -0.52], [0.016, -0.53], [0.0, -0.53]], 0, 0.012, 16)); // giảm thanh
  P.dark.push(side([[-0.02, -0.038], [0.03, -0.038], [0.034, -0.12], [0.036, -0.2], [-0.004, -0.205], [-0.006, -0.12]], 0.028, 0.003)); // mag thẳng
  P.poly.push(side([[0.07, -0.03], [0.114, -0.03], [0.142, -0.13], [0.1, -0.14], [0.086, -0.115]], 0.034, 0.005));
  P.dark.push(rbox(0.008, 0.03, 0.012, 0.002, 0, -0.054, 0.055));
  P.dark.push(rbox(0.032, 0.006, 0.07, 0.002, 0, -0.072, 0.03));
  P.dark.push(rbox(0.012, 0.014, 0.1, 0.003, 0.016, 0.0, 0.26)); // báng gập
  P.dark.push(rbox(0.012, 0.014, 0.1, 0.003, -0.016, 0.0, 0.26));
  P.dark.push(rbox(0.04, 0.09, 0.016, 0.004, 0, -0.03, 0.32));
  P.dark.push(rbox(0.036, 0.034, 0.05, 0.007, 0, 0.074, 0.02)); // chấm đỏ nhỏ
  P.glass.push(rbox(0.026, 0.022, 0.004, 0.001, 0, 0.074, -0.006));
  P.dot.push(rbox(0.003, 0.003, 0.003, 0.0005, 0, 0.077, -0.008));
  return { group: buildGroup(P, GUN_MAT), muzzle: V3(0, 0.012, -0.53), eject: V3(0.04, 0.02, -0.01), len: 0.56 };
};

MODELS.sniper = function sniper() {
  const P = mk();
  P.dark.push(side([[-0.1, -0.035], [0.2, -0.035], [0.22, -0.015], [0.22, 0.04], [-0.1, 0.04], [-0.11, 0.0]], 0.046, 0.004));
  P.steel.push(tubeZ(0.014, 0.012, -0.12, -0.75, 0, 0.012, 16)); // nòng nặng
  P.steel.push(tubeZ(0.011, 0.011, -0.75, -1.0, 0, 0.012, 14));
  P.dark.push(latheZ([[0.012, -1.0], [0.02, -1.005], [0.02, -1.04], [0.015, -1.06], [0.0, -1.06]], 0, 0.012, 16)); // đầu giảm giật
  P.poly.push(side([[-0.1, -0.035], [-0.6, -0.03], [-0.6, 0.02], [-0.1, 0.03]], 0.044, 0.006)); // ốp lót dài
  P.poly.push(side([[0.2, 0.03], [0.34, 0.025], [0.44, 0.0], [0.45, -0.13], [0.34, -0.09], [0.2, -0.04]], 0.044, 0.007)); // báng + má tựa
  P.dark.push(rbox(0.048, 0.12, 0.02, 0.005, 0, -0.065, 0.455));
  // Ống ngắm: thân lathe dọc Z + hai đầu loe + kính
  P.dark.push(latheZ([[0.0, -0.2], [0.026, -0.2], [0.02, -0.17], [0.02, 0.1], [0.027, 0.13], [0.0, 0.13]], 0, 0.08, 18));
  P.glass.push(latheZ([[0.0, -0.205], [0.022, -0.203], [0.0, -0.2]], 0, 0.08, 14));
  P.steel.push(rbox(0.012, 0.03, 0.016, 0.003, 0, 0.05, -0.02), rbox(0.012, 0.03, 0.016, 0.003, 0, 0.05, 0.1));
  // Cò khoá nòng: tay kéo bên phải + núm
  P.steel.push(rbox(0.05, 0.008, 0.008, 0.002, 0.04, 0.012, 0.06));
  P.steel.push(rbox(0.016, 0.016, 0.016, 0.006, 0.07, 0.012, 0.06));
  P.dark.push(side([[-0.04, -0.034], [0.03, -0.034], [0.03, -0.09], [-0.04, -0.09]], 0.03, 0.003)); // hộp tiếp đạn
  P.poly.push(side([[0.08, -0.03], [0.12, -0.03], [0.15, -0.13], [0.105, -0.14]], 0.032, 0.005));
  P.dark.push(rbox(0.008, 0.03, 0.012, 0.002, 0, -0.05, 0.06));
  P.dark.push(rbox(0.01, 0.006, 0.08, 0.002, 0, -0.07, 0.03));
  return { group: buildGroup(P, GUN_MAT), muzzle: V3(0, 0.012, -1.06), eject: V3(0.04, 0.02, 0.02), len: 1.1 };
};

MODELS.lmg = function lmg() {
  const P = mk();
  P.dark.push(side([[-0.13, -0.045], [0.22, -0.045], [0.24, -0.02], [0.24, 0.05], [-0.13, 0.05], [-0.14, 0.0]], 0.056, 0.004));
  P.steel.push(side([[-0.12, 0.045], [0.22, 0.045], [0.22, 0.068], [0.17, 0.078], [-0.1, 0.078], [-0.12, 0.06]], 0.05, 0.003));
  P.steel.push(...rail(-0.1, 0.18, 0.082, 0.03, 0.016));
  P.poly.push(side([[-0.12, -0.04], [-0.55, -0.03], [-0.55, 0.035], [-0.12, 0.042]], 0.056, 0.006));
  for (let z = -0.18; z > -0.54; z -= 0.04) P.dark.push(rbox(0.06, 0.01, 0.018, 0.002, 0, 0.0, z));
  P.steel.push(tubeZ(0.0125, 0.0125, -0.55, -0.88, 0, 0.012, 14));
  P.dark.push(latheZ([[0.013, -0.88], [0.02, -0.885], [0.02, -0.92], [0.015, -0.94], [0.0, -0.94]], 0, 0.012, 16));
  P.dark.push(rbox(0.1, 0.1, 0.12, 0.012, 0, -0.1, -0.02)); // hộp đạn lớn bên dưới
  P.dark.push(rbox(0.06, 0.016, 0.1, 0.004, 0, -0.158, -0.02));
  // chân chống hai càng gập
  P.steel.push(tubeZ(0.006, 0.006, -0.45, -0.45, 0.035, -0.07, 6));
  P.steel.push(limb([0.03, -0.03, -0.5], [0.07, -0.16, -0.58], 0.006, 0.006, 6), limb([-0.03, -0.03, -0.5], [-0.07, -0.16, -0.58], 0.006, 0.006, 6));
  P.poly.push(side([[0.07, -0.04], [0.116, -0.04], [0.15, -0.14], [0.1, -0.15], [0.088, -0.125]], 0.036, 0.005));
  P.dark.push(rbox(0.008, 0.034, 0.012, 0.002, 0, -0.06, 0.055));
  P.poly.push(side([[0.23, 0.03], [0.33, 0.02], [0.44, -0.005], [0.44, -0.115], [0.33, -0.07], [0.23, -0.04]], 0.044, 0.007));
  P.dark.push(rbox(0.048, 0.118, 0.02, 0.005, 0, -0.058, 0.446));
  P.dark.push(rbox(0.012, 0.016, 0.03, 0.003, 0.03, 0.04, 0.04)); // cần lên đạn
  return { group: buildGroup(P, GUN_MAT), muzzle: V3(0, 0.012, -0.94), eject: V3(0.045, 0.02, -0.03), len: 0.95 };
};

MODELS.deagle = function deagle() {
  const P = mk();
  P.steel.push(side([[-0.21, 0.01], [0.07, 0.01], [0.072, 0.056], [0.062, 0.062], [-0.2, 0.062], [-0.22, 0.04]], 0.034, 0.005)); // thanh trượt dày
  for (let i = 0; i < 5; i++) P.dark.push(rbox(0.038, 0.04, 0.004, 0.0012, 0, 0.036, 0.016 + i * 0.008));
  P.dark.push(side([[-0.17, 0.01], [0.07, 0.01], [0.074, -0.01], [0.1, -0.13], [0.056, -0.145], [0.034, -0.04], [-0.08, -0.04], [-0.15, -0.015]], 0.03, 0.004));
  P.poly.push(side([[0.074, -0.006], [0.1, -0.13], [0.06, -0.14], [0.04, -0.04]], 0.036, 0.005));
  P.dark.push(rbox(0.008, 0.026, 0.01, 0.002, 0, -0.02, 0.012));
  P.dark.push(rbox(0.03, 0.006, 0.07, 0.002, 0, -0.042, -0.03));
  P.steel.push(...rail(-0.2, 0.0, 0.066, 0.016, 0.012)); // ray ngang trên nòng
  P.steel.push(tubeZ(0.01, 0.01, -0.21, -0.235, 0, 0.034, 12));
  P.dark.push(rbox(0.008, 0.012, 0.01, 0.0015, 0, 0.068, -0.19)); // đầu ruồi
  P.dark.push(rbox(0.014, 0.012, 0.012, 0.0015, 0, 0.068, 0.05)); // thước ngắm
  return { group: buildGroup(P, GUN_MAT), muzzle: V3(0, 0.034, -0.235), eject: V3(0.025, 0.05, -0.04), len: 0.27 };
};

MODELS.autoshotgun = function autoshotgun() {
  const P = mk();
  P.dark.push(side([[-0.12, -0.044], [0.17, -0.044], [0.19, -0.02], [0.19, 0.04], [-0.12, 0.04]], 0.052, 0.005));
  P.steel.push(...rail(-0.1, 0.16, 0.044, 0.024, 0.016));
  P.steel.push(tubeZ(0.017, 0.017, -0.12, -0.7, 0, 0.018, 16));
  P.steel.push(tubeZ(0.0125, 0.0125, -0.12, -0.55, 0, -0.022, 14));
  P.dark.push(latheZ([[0.017, -0.7], [0.021, -0.706], [0.021, -0.73], [0.0, -0.73]], 0, 0.018, 14));
  P.poly.push(side([[-0.2, -0.05], [-0.42, -0.05], [-0.42, 0.004], [-0.2, 0.004]], 0.05, 0.006)); // ốp lót
  P.dark.push(rbox(0.06, 0.13, 0.07, 0.01, 0, -0.1, -0.02)); // hộp tiếp đạn
  P.poly.push(side([[0.18, 0.03], [0.3, 0.024], [0.42, -0.005], [0.425, -0.11], [0.3, -0.07], [0.18, -0.04]], 0.044, 0.008));
  P.dark.push(rbox(0.05, 0.116, 0.02, 0.005, 0, -0.058, 0.43));
  P.poly.push(side([[0.08, -0.04], [0.12, -0.04], [0.145, -0.115], [0.1, -0.125]], 0.034, 0.005));
  P.dark.push(rbox(0.008, 0.03, 0.012, 0.002, 0, -0.06, 0.06));
  P.dark.push(rbox(0.026, 0.006, 0.08, 0.002, 0, -0.08, 0.035));
  P.dark.push(rbox(0.006, 0.02, 0.05, 0.002, 0.028, 0.012, -0.03));
  return { group: buildGroup(P, GUN_MAT), muzzle: V3(0, 0.018, -0.73), eject: V3(0.04, 0.03, -0.04), len: 0.75 };
};

// Trả về { group, muzzle, eject, len } cho súng id; group hướng nòng về -Z, gốc ở khối thân.
export function buildGun(id) {
  const glb = visuals.weaponModel(id); // model GLB nếu thư viện tài nguyên có
  if (glb) return glb;
  return (MODELS[id] || MODELS.rifle)();
}

// Bàn tay găng có ngón: lòng bàn tay + 4 ngón cong + ngón cái. mirror = -1 cho tay trái.
function glove(P, x, y, z, { rx = 0, mirror = 1, curl = 0.9, scale = 1 } = {}) {
  const parts = [];
  parts.push(rbox(0.05 * scale, 0.03 * scale, 0.062 * scale, 0.008, 0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const fx = (-0.018 + i * 0.012) * scale;
    const a = limb([fx, 0.004, -0.03 * scale], [fx, -0.006 - curl * 0.012, -0.062 * scale], 0.0074 * scale, 0.0066 * scale, 7);
    const b = limb([fx, -0.006 - curl * 0.012, -0.062 * scale], [fx, -0.03 * curl * scale - 0.012, -0.052 * scale], 0.0066 * scale, 0.006 * scale, 7);
    parts.push(a, b);
  }
  parts.push(limb([0.026 * mirror * scale, 0.0, -0.01], [0.034 * mirror * scale, 0.012, -0.05 * scale], 0.009 * scale, 0.007 * scale, 7));
  for (const g of parts) {
    xform(g, { r: [rx, 0, 0], p: [x, y, z] });
    P.glove.push(g);
  }
  P.glove.push(rbox(0.054 * scale, 0.012, 0.014, 0.004, x, y - 0.002, z + 0.04 * scale)); // cổ tay găng
}

// Cánh tay + găng cầm súng cho góc nhìn thứ nhất (gộp thành vài mesh).
export function buildHands(id) {
  const P = { sleeve: [], glove: [] };
  if (id === 'pistol' || id === 'deagle') {
    glove(P, 0.0, -0.055, 0.03, { rx: 0.1, curl: 1.0 });
    P.sleeve.push(limb([0.012, -0.075, 0.1], [0.04, -0.15, 0.4], 0.03, 0.04, 12));
    glove(P, -0.034, -0.06, 0.036, { rx: 0.1, mirror: -1, curl: 0.8, scale: 0.9 });
    P.sleeve.push(limb([-0.03, -0.08, 0.1], [-0.07, -0.16, 0.4], 0.028, 0.038, 12));
  } else {
    // Tay phải ôm báng, tay trái đỡ ốp lót
    glove(P, 0.0, -0.1, 0.108, { rx: 0.35, curl: 1.0 });
    P.sleeve.push(limb([0.012, -0.115, 0.15], [0.045, -0.2, 0.42], 0.032, 0.044, 12));
    glove(P, -0.05, -0.012, -0.3, { rx: 0.0, mirror: -1, curl: 0.55, scale: 1.05 });
    P.sleeve.push(limb([-0.052, -0.03, -0.24], [-0.1, -0.15, 0.1], 0.03, 0.042, 12));
  }
  return buildGroup(P, GUN_MAT, { shadow: false });
}

export { ellipsoid };

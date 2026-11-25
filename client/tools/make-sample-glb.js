#!/usr/bin/env node
'use strict';
// Tạo file GLB mẫu hợp lệ (hộp kim loại PBR + hai node rỗng "Muzzle" và "Eject") để thử đường ống nạp model mà không cần Blender.
//   node tools/make-sample-glb.js [file-đích]    (mặc định assets/_samples/test_box.glb)
const fs = require('fs');
const path = require('path');

function buildBoxGlb({ w = 0.1, h = 0.1, d = 0.8 } = {}) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const faces = [
    [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
  ];
  const pos = []; const nor = []; const uv = []; const idx = [];
  faces.forEach(([n, vs], f) => {
    vs.forEach((v, i) => { pos.push(...v); nor.push(...n); uv.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); });
    idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  const P = new Float32Array(pos); const N = new Float32Array(nor); const U = new Float32Array(uv); const I = new Uint16Array(idx);
  const parts = [P, N, U, I].map((a) => Buffer.from(a.buffer));
  const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const padded = parts.map(pad);
  const offs = []; let o = 0; padded.forEach((b) => { offs.push(o); o += b.length; });
  const bin = Buffer.concat(padded);
  const json = {
    asset: { version: '2.0', generator: 'hachihi make-sample-glb' },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Root', children: [1, 2, 3] }, { name: 'Body', mesh: 0 }, { name: 'Muzzle', translation: [0, 0, -hz] }, { name: 'Eject', translation: [hx, hy, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'steel_dark', pbrMetallicRoughness: { baseColorFactor: [0.3, 0.3, 0.32, 1], metallicFactor: 0.9, roughnessFactor: 0.4 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-hx, -hy, -hz], max: [hx, hy, hz] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 24, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: parts.map((b, i) => ({ buffer: 0, byteOffset: offs[i], byteLength: b.length, target: i === 3 ? 34963 : 34962 })),
    buffers: [{ byteLength: bin.length }],
  };
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length;
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

module.exports = { buildBoxGlb };

if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'assets', '_samples', 'test_box.glb'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildBoxGlb());
  console.log('Đã tạo', out);
}

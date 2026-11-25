#!/usr/bin/env node
'use strict';
// Quét thư mục assets/, tính SHA-256 + kích thước từng file và sinh assets/manifest.json.
//   node tools/pack-assets.js [thư-mục-assets] [--allow-missing-license]
// Cấu hình đi kèm trong thư mục assets:
//   packs.json     { version, baseUrl?, lodDistances?, packages: { id: { name, version, bundled, deps, dirs: ["core/", ...] } } }
//   licenses.json  { "tiền-tố-đường-dẫn/": { name, author, source, url } }   (mọi asset PHẢI có giấy phép)
//   bindings.json  { weapons: { rifle: "weapons/rifle/assault_rifle" }, characters: { A: ["..._lod0", "..._lod1"], B: [...] } }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lib = require('../shared/assetManifest.cjs');

const SKIP_TOP = new Set(['map.json', 'publisher.pub.pem', 'manifest.json', 'manifest.json.sig', 'packs.json', 'licenses.json', 'bindings.json', 'README.md', 'maps', '_samples', 'decoders']);

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith('.')) continue;
    const rel = base ? base + '/' + name.name : name.name;
    if (!base && SKIP_TOP.has(name.name)) continue;
    if (name.isDirectory()) out.push(...walk(path.join(dir, name.name), rel));
    else if (lib.OK_EXT.has(lib.extOf(name.name))) out.push(rel);
  }
  return out.sort();
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function glbCompression(file) {
  if (lib.extOf(file) !== '.glb') return lib.extOf(file) === '.ktx2' ? 'ktx2' : 'none';
  const buf = fs.readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return 'none';
  const jsonLen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const used = j.extensionsUsed || [];
  if (used.includes('KHR_draco_mesh_compression')) return 'draco';
  if (used.includes('EXT_meshopt_compression')) return 'meshopt';
  return 'none';
}

function buildManifest(dir, { allowMissingLicense = false } = {}) {
  const read = (n, d) => (fs.existsSync(path.join(dir, n)) ? JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')) : d);
  const packs = read('packs.json', null);
  if (!packs) throw new Error('thiếu packs.json');
  const licenses = read('licenses.json', {});
  const bindings = read('bindings.json', {});
  const lodDist = packs.lodDistances || [18, 40, 80];
  const files = walk(dir);
  const assets = [];
  const errors = [];
  const stripExt = (p) => (['.glb', '.gltf', '.ktx2', '.png', '.jpg', '.jpeg', '.webp'].includes(lib.extOf(p)) ? p.slice(0, p.lastIndexOf('.')) : p);
  for (const rel of files) {
    const pkg = Object.entries(packs.packages).find(([, p]) => (p.dirs || []).some((d) => rel.startsWith(d)));
    if (!pkg) { errors.push(`${rel}: không thuộc package nào trong packs.json`); continue; }
    const lic = Object.entries(licenses).filter(([k]) => rel.startsWith(k)).sort((a, b) => b[0].length - a[0].length)[0];
    if (!lic && !allowMissingLicense) { errors.push(`${rel}: thiếu giấy phép trong licenses.json`); continue; }
    const abs = path.join(dir, rel);
    const a = {
      id: stripExt(rel), version: packs.packages[pkg[0]].version, path: rel, size: fs.statSync(abs).size, sha256: sha256(abs),
      package: pkg[0], compression: glbCompression(abs), license: lic ? lic[1] : { name: 'UNLICENSED-DEV', author: 'unknown' },
    };
    assets.push(a);
  }
  // LOD: asset *_lod0 liệt kê các *_lod1.. cùng thư mục
  for (const a of assets) {
    const m = /^(.*)_lod0$/.exec(a.id);
    if (!m) continue;
    const lods = [];
    for (let i = 1; i < 6; i++) {
      const s = assets.find((x) => x.id === `${m[1]}_lod${i}`);
      if (s) lods.push({ path: s.path, distance: lodDist[i - 1] || lodDist[lodDist.length - 1] * i });
    }
    if (lods.length) a.lods = lods;
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const manifest = { schema: lib.SCHEMA, version: packs.version, packages: Object.fromEntries(Object.entries(packs.packages).map(([id, p]) => [id, { name: p.name, version: p.version, bundled: !!p.bundled, deps: p.deps || [], size: assets.filter((a) => a.package === id).reduce((s, a) => s + a.size, 0) }])), assets, bindings };
  if (packs.baseUrl) manifest.baseUrl = packs.baseUrl;
  const v = lib.validateManifest(manifest, { allowLocal: allowMissingLicense });
  if (!v.ok) throw new Error(v.errors.join('\n'));
  return manifest;
}

module.exports = { buildManifest };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', 'assets'));
  try {
    const m = buildManifest(dir, { allowMissingLicense: process.argv.includes('--allow-missing-license') });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 1));
    console.log(`Đã ghi ${path.join(dir, 'manifest.json')}: ${m.assets.length} asset, ${Object.keys(m.packages).length} gói.`);
  } catch (e) {
    console.error('LỖI:\n' + e.message);
    process.exit(1);
  }
}

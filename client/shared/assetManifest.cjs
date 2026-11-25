'use strict';
// Quy tắc manifest của thư viện tài nguyên (dùng chung cho client, Electron và công cụ đóng gói).
// Manifest mô tả từng asset: id, version, path tương đối, size, SHA-256, package, nén, phụ thuộc, LOD, giấy phép.
// Không bao giờ chấp nhận file thực thi/JavaScript trong gói tài nguyên.

const SCHEMA = 1;
const OK_EXT = new Set(['.glb', '.gltf', '.bin', '.ktx2', '.png', '.jpg', '.jpeg', '.webp', '.json', '.ogg', '.wav', '.mp3']);
const COMPRESSION = ['none', 'draco', 'meshopt', 'ktx2', 'gzip'];
const SAFE_CHARS = /^[A-Za-z0-9._\-/]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function extOf(p) {
  const i = p.lastIndexOf('.');
  return i < 0 ? '' : p.slice(i).toLowerCase();
}

// Đường dẫn tương đối an toàn: không tuyệt đối, không "..", không ổ đĩa, không '\', chỉ ký tự cho phép, đuôi file trong danh sách trắng.
function isSafeRelPath(p) {
  if (typeof p !== 'string' || !p || p.length > 240) return false;
  if (!SAFE_CHARS.test(p) || p.startsWith('/') || p.includes('//')) return false;
  for (const seg of p.split('/')) if (seg === '' || seg === '.' || seg === '..' || seg.startsWith('.')) return false;
  return OK_EXT.has(extOf(p));
}

function isSafeBaseUrl(u, allowLocal) {
  if (typeof u !== 'string') return false;
  if (/^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._\-/]*)?$/.test(u)) return true;
  return !!allowLocal && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[A-Za-z0-9._\-/]*)?$/.test(u);
}

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  return 0;
}

// Trả về { ok, errors[] }.
function validateManifest(m, opts = {}) {
  const errors = [];
  const err = (s) => errors.push(s);
  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest không phải object'] };
  if (m.schema !== SCHEMA) err(`schema phải là ${SCHEMA}`);
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) err('version phải dạng x.y.z');
  const pk = m.packages && typeof m.packages === 'object' ? m.packages : null;
  if (!pk) err('thiếu packages');
  if (!Array.isArray(m.assets)) err('thiếu assets[]');
  if (m.baseUrl !== undefined && !isSafeBaseUrl(m.baseUrl, opts.allowLocal)) err('baseUrl phải là https (hoặc localhost khi kiểm thử)');
  if (errors.length) return { ok: false, errors };

  for (const [id, p] of Object.entries(pk)) {
    if (!/^[a-z0-9-]+$/.test(id)) err(`package id không hợp lệ: ${id}`);
    if (!p || typeof p.name !== 'string' || typeof p.version !== 'string' || !SEMVER.test(p.version)) err(`package ${id}: thiếu name/version`);
    for (const d of (p && p.deps) || []) if (!pk[d]) err(`package ${id}: phụ thuộc không tồn tại: ${d}`);
  }
  const ids = new Set();
  const paths = new Set();
  for (const a of m.assets) {
    const tag = a && a.id ? a.id : '(không id)';
    if (!a || typeof a.id !== 'string' || !/^[A-Za-z0-9._\-/]+$/.test(a.id)) { err(`asset id không hợp lệ: ${tag}`); continue; }
    if (ids.has(a.id)) err(`asset trùng id: ${a.id}`);
    ids.add(a.id);
    if (typeof a.version !== 'string' || !SEMVER.test(a.version)) err(`${tag}: version không hợp lệ`);
    if (!isSafeRelPath(a.path)) err(`${tag}: path không an toàn: ${a.path}`);
    else if (paths.has(a.path)) err(`${tag}: path trùng: ${a.path}`);
    else paths.add(a.path);
    if (!Number.isInteger(a.size) || a.size < 0) err(`${tag}: size không hợp lệ`);
    if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)) err(`${tag}: sha256 không hợp lệ`);
    if (!pk[a.package]) err(`${tag}: package không tồn tại: ${a.package}`);
    if (!COMPRESSION.includes(a.compression || 'none')) err(`${tag}: kiểu nén không hợp lệ`);
    if (!a.license || typeof a.license.name !== 'string' || !a.license.name) err(`${tag}: thiếu giấy phép (license.name)`);
    for (const l of a.lods || []) {
      if (!isSafeRelPath(l.path) || !(l.distance > 0)) err(`${tag}: LOD không hợp lệ`);
    }
  }
  for (const a of m.assets) for (const d of a.deps || []) if (!ids.has(d)) err(`${a.id}: phụ thuộc không tồn tại: ${d}`);
  // bindings: gắn tên logic (súng, nhân vật) với asset id
  const b = m.bindings || {};
  for (const [wid, aid] of Object.entries(b.weapons || {})) if (!ids.has(aid)) err(`bindings.weapons.${wid}: asset không tồn tại: ${aid}`);
  for (const [team, list] of Object.entries(b.characters || {})) for (const aid of list) if (!ids.has(aid)) err(`bindings.characters.${team}: asset không tồn tại: ${aid}`);
  for (const [kind, t] of Object.entries(b.textures || {})) {
    if (!/^[a-z_]+$/.test(kind)) err(`bindings.textures: tên không hợp lệ: ${kind}`);
    for (const k of ['color', 'normal', 'roughness']) if (t[k] !== undefined && !ids.has(t[k])) err(`bindings.textures.${kind}.${k}: asset không tồn tại: ${t[k]}`);
    if (!t.color) err(`bindings.textures.${kind}: thiếu color`);
    if (t.tile !== undefined && !(t.tile > 0 && t.tile < 100)) err(`bindings.textures.${kind}: tile không hợp lệ`);
  }
  return { ok: errors.length === 0, errors };
}

// Danh sách package cần cài (gồm phụ thuộc), phụ thuộc đứng trước. Ném lỗi nếu package lạ hoặc vòng phụ thuộc.
function resolvePackages(m, wanted) {
  const out = [];
  const state = new Map();
  const visit = (id, chain) => {
    if (!m.packages[id]) throw new Error(`package không tồn tại: ${id}`);
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new Error(`vòng phụ thuộc: ${[...chain, id].join(' -> ')}`);
    state.set(id, 1);
    for (const d of m.packages[id].deps || []) visit(d, [...chain, id]);
    state.set(id, 2);
    out.push(id);
  };
  for (const id of wanted) visit(id, []);
  return out;
}

const indexAssets = (m) => new Map(m.assets.map((a) => [a.id, a]));
const assetsOf = (m, pkg) => m.assets.filter((a) => a.package === pkg);

module.exports = { SCHEMA, OK_EXT, COMPRESSION, isSafeRelPath, isSafeBaseUrl, cmpVersion, validateManifest, resolvePackages, indexAssets, assetsOf, extOf };

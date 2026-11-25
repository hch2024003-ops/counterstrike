'use strict';
// Quản lý thư viện tài nguyên (chạy ở tiến trình chính Electron, không có trong renderer).
//  - Gói đi kèm bộ cài (bundledRoot, chỉ đọc) + gói người dùng cài thêm (installedRoot, ghi được).
//  - Kiểm tra SHA-256 và kích thước, cài từ thư mục cục bộ, tải có tiếp tục (resume), xác minh sau tải, hoàn tác khi lỗi.
//  - Tải từ xa CHỈ qua manifest có chữ ký Ed25519 khớp khoá công khai nhúng trong ứng dụng; không bao giờ tin URL do server game gửi.
//  - Không chấp nhận file thực thi/JavaScript (danh sách đuôi file trắng trong shared/assetManifest.cjs).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lib = require('../shared/assetManifest.cjs');

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const within = (root, abs) => abs === root || abs.startsWith(root + path.sep);

class AssetStore {
  // extraRoots: các thư mục tài nguyên dùng chung cho cả máy (ví dụ C:\\ProgramData\\HACHIHI\\assets, thư mục cạnh game, ổ mạng của tiệm net).
  // Chỉ đọc; ưu tiên: cài của người dùng > extraRoots (sau cùng thắng) > gói đi kèm. Máy dùng phần mềm khôi phục (Deep Freeze...) nên đặt gói ở đây.
  constructor({ bundledRoot, installedRoot, extraRoots = [], publicKeyPem = null, allowInsecureLocal = false, fetchImpl = null }) {
    this.bundledRoot = path.resolve(bundledRoot);
    this.installedRoot = path.resolve(installedRoot);
    this.extraRoots = extraRoots.filter(Boolean).map((r) => path.resolve(r)).filter((r) => r !== this.bundledRoot && r !== this.installedRoot);
    this.publicKeyPem = publicKeyPem;
    this.allowLocal = allowInsecureLocal;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.lastError = null;
  }

  // ------------------------------------------------------------ manifest
  _load(root) {
    const f = path.join(root, 'manifest.json');
    if (!fs.existsSync(f)) return null;
    try {
      const m = readJson(f);
      const v = lib.validateManifest(m, { allowLocal: this.allowLocal });
      if (!v.ok) { this.lastError = `manifest ${root} không hợp lệ: ${v.errors[0]}`; return null; }
      return m;
    } catch (e) {
      this.lastError = `không đọc được manifest ${root}: ${e.message}`;
      return null;
    }
  }

  // Gộp gói đi kèm, gói dùng chung và gói đã cài; asset phiên bản mới hơn thắng (bằng nhau: nguồn ưu tiên cao hơn thắng).
  merged() {
    const sources = [this.bundledRoot, ...this.extraRoots, this.installedRoot].map((root) => [root, this._load(root)]).filter(([, m]) => m);
    const origin = new Map();
    if (!sources.length) return { manifest: null, origin };
    const out = { schema: lib.SCHEMA, version: sources[sources.length - 1][1].version, packages: {}, assets: [], bindings: {} };
    const byId = new Map();
    for (const [tag, m] of sources) {
      Object.assign(out.packages, m.packages);
      for (const a of m.assets) {
        const cur = byId.get(a.id);
        if (!cur || lib.cmpVersion(a.version, cur.version) >= 0) { byId.set(a.id, a); origin.set(a.id, tag); }
      }
      const bd = m.bindings || {};
      out.bindings.weapons = { ...(out.bindings.weapons || {}), ...(bd.weapons || {}) };
      out.bindings.characters = { ...(out.bindings.characters || {}), ...(bd.characters || {}) };
      out.bindings.textures = { ...(out.bindings.textures || {}), ...(bd.textures || {}) };
    }
    out.assets = [...byId.values()];
    return { manifest: out, origin };
  }

  // Manifest chỉ gồm asset có file thật trên đĩa (gói chưa cài không xuất hiện); bindings tới asset thiếu bị bỏ.
  available() {
    const { manifest, origin } = this.merged();
    if (!manifest) return null;
    const present = manifest.assets.filter((a) => fs.existsSync(path.join(this.rootOf(origin, a.id), a.path)));
    const ids = new Set(present.map((a) => a.id));
    const b = manifest.bindings || {};
    const weapons = Object.fromEntries(Object.entries(b.weapons || {}).filter(([, id]) => ids.has(id)));
    const characters = Object.fromEntries(Object.entries(b.characters || {}).filter(([, l]) => l.length && l.every((id) => ids.has(id))));
    const textures = Object.fromEntries(Object.entries(b.textures || {}).filter(([, t]) => ids.has(t.color) && (!t.normal || ids.has(t.normal)) && (!t.roughness || ids.has(t.roughness))));
    return { ...manifest, assets: present, bindings: { weapons, characters, textures } };
  }

  rootOf(origin, id) { return origin.get(id) || this.bundledRoot; }

  // Dùng cho giao thức hasset://pack/<path>: tìm file hợp lệ trong thư mục đã cài rồi thư mục đi kèm.
  resolveFile(rel) {
    if (!lib.isSafeRelPath(rel)) return null;
    for (const root of [this.installedRoot, ...[...this.extraRoots].reverse(), this.bundledRoot]) {
      const abs = path.resolve(root, rel);
      if (within(root, abs) && fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    }
    return null;
  }

  // ------------------------------------------------------------ xác minh
  sha256File(abs) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      fs.createReadStream(abs).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
    });
  }

  async verifyFile(abs, asset) {
    let st;
    try { st = fs.statSync(abs); } catch { return { ok: false, reason: 'thiếu file' }; }
    if (st.size !== asset.size) return { ok: false, reason: `sai kích thước (${st.size} ≠ ${asset.size})` };
    const h = await this.sha256File(abs);
    return h === asset.sha256 ? { ok: true } : { ok: false, reason: 'sai SHA-256' };
  }

  // pkgId bỏ trống = kiểm tra tất cả. Trả về { checked, bad: [{id, reason}] }.
  async verify(pkgId) {
    const { manifest, origin } = this.merged();
    if (!manifest) return { checked: 0, bad: [], error: this.lastError || 'chưa có manifest' };
    const bad = [];
    let checked = 0;
    for (const a of manifest.assets) {
      if (pkgId && a.package !== pkgId) continue;
      const abs = path.join(this.rootOf(origin, a.id), a.path);
      if (!fs.existsSync(abs) && !manifest.packages[a.package].bundled) continue; // gói tuỳ chọn chưa cài: không phải lỗi
      checked++;
      const r = await this.verifyFile(abs, a);
      if (!r.ok) bad.push({ id: a.id, reason: r.reason });
    }
    return { checked, bad };
  }

  async status() {
    const { manifest, origin } = this.merged();
    if (!manifest) return { packages: [], error: this.lastError };
    const out = [];
    for (const [id, p] of Object.entries(manifest.packages)) {
      const assets = lib.assetsOf(manifest, id);
      let present = 0;
      let bytes = 0;
      for (const a of assets) {
        bytes += a.size;
        if (fs.existsSync(path.join(this.rootOf(origin, a.id), a.path))) present++;
      }
      out.push({ id, name: p.name, version: p.version, bundled: !!p.bundled, assets: assets.length, present, complete: present === assets.length, bytes, origin: assets.length ? (origin.get(assets[0].id) === this.installedRoot ? 'installed' : origin.get(assets[0].id) === this.bundledRoot ? 'bundled' : 'shared') : null });
    }
    let free = null;
    try { const s = await fs.promises.statfs(this.installedRoot.length && fs.existsSync(this.installedRoot) ? this.installedRoot : path.dirname(this.installedRoot)); free = Number(s.bavail) * Number(s.bsize); } catch { /* không bắt buộc */ }
    return { packages: out, freeBytes: free };
  }

  // ------------------------------------------------------------ cài đặt nguyên tử + hoàn tác
  async _apply(entries, meta) {
    const root = this.installedRoot;
    fs.mkdirSync(root, { recursive: true });
    const stamp = Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const backup = path.join(root, '.backup-' + stamp);
    const moved = [];
    const manifestPath = path.join(root, 'manifest.json');
    const oldManifestText = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
    try {
      for (const e of entries) {
        const dest = path.join(root, e.asset.path);
        if (!within(root, path.resolve(dest))) throw new Error('đường dẫn ra ngoài thư mục cài: ' + e.asset.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        let bk = null;
        if (fs.existsSync(dest)) {
          bk = path.join(backup, e.asset.path);
          fs.mkdirSync(path.dirname(bk), { recursive: true });
          fs.renameSync(dest, bk);
        }
        moved.push({ dest, bk });
        fs.renameSync(e.staged, dest);
      }
      // manifest mới = manifest cũ + các asset/package vừa cài
      const old = oldManifestText ? JSON.parse(oldManifestText) : { schema: lib.SCHEMA, version: meta.version, packages: {}, assets: [], bindings: {} };
      const byId = new Map(old.assets.map((a) => [a.id, a]));
      for (const e of entries) byId.set(e.asset.id, e.asset);
      const next = {
        schema: lib.SCHEMA, version: meta.version,
        packages: { ...old.packages, ...meta.packages },
        assets: [...byId.values()],
        bindings: { weapons: { ...(old.bindings && old.bindings.weapons), ...(meta.bindings && meta.bindings.weapons) }, characters: { ...(old.bindings && old.bindings.characters), ...(meta.bindings && meta.bindings.characters) } },
      };
      const v = lib.validateManifest(next, { allowLocal: this.allowLocal });
      if (!v.ok) throw new Error('manifest sau cài không hợp lệ: ' + v.errors[0]);
      const tmp = manifestPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(next, null, 1));
      fs.renameSync(tmp, manifestPath);
    } catch (e) {
      for (const m of moved.reverse()) { // hoàn tác theo thứ tự ngược
        try { if (fs.existsSync(m.dest)) fs.rmSync(m.dest, { force: true }); if (m.bk) fs.renameSync(m.bk, m.dest); } catch { /* cố gắng hết sức */ }
      }
      if (oldManifestText !== null) fs.writeFileSync(manifestPath, oldManifestText);
      else fs.rmSync(manifestPath, { force: true });
      throw e;
    } finally {
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }

  // Cài từ thư mục có manifest.json + file (ví dụ gói do artist giao). Mọi file phải khớp size + SHA-256.
  async installFromDir(srcDir, wanted = null) {
    const src = path.resolve(srcDir);
    const f = path.join(src, 'manifest.json');
    if (!fs.existsSync(f)) return { ok: false, error: 'thiếu manifest.json' };
    let m;
    try { m = readJson(f); } catch (e) { return { ok: false, error: 'manifest hỏng: ' + e.message }; }
    const v = lib.validateManifest(m, { allowLocal: this.allowLocal });
    if (!v.ok) return { ok: false, error: v.errors[0], errors: v.errors };
    const pkgs = lib.resolvePackages(m, wanted || Object.keys(m.packages));
    const todo = m.assets.filter((a) => pkgs.includes(a.package));
    const staging = path.join(this.installedRoot, '.staging-' + crypto.randomBytes(4).toString('hex'));
    try {
      fs.mkdirSync(staging, { recursive: true });
      const entries = [];
      for (const a of todo) {
        const abs = path.resolve(src, a.path);
        if (!within(src, abs)) return { ok: false, error: 'đường dẫn ra ngoài gói: ' + a.path };
        const r = await this.verifyFile(abs, a);
        if (!r.ok) return { ok: false, error: `${a.id}: ${r.reason}` };
        const staged = path.join(staging, crypto.randomBytes(6).toString('hex'));
        fs.copyFileSync(abs, staged);
        entries.push({ asset: a, staged });
      }
      const meta = { version: m.version, packages: Object.fromEntries(pkgs.map((p) => [p, { ...m.packages[p], bundled: false }])), bindings: m.bindings };
      await this._apply(entries, meta);
      return { ok: true, installed: entries.length, packages: pkgs };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }

  // ------------------------------------------------------------ tải từ xa (có chữ ký)
  verifySignature(bytes, sigB64) {
    if (!this.publicKeyPem) return false;
    try {
      return crypto.verify(null, bytes, crypto.createPublicKey(this.publicKeyPem), Buffer.from(String(sigB64).trim(), 'base64'));
    } catch { return false; }
  }

  async _fetchBytes(url, limit) {
    const res = await this.fetch(url, { redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > limit) throw new Error('phản hồi quá lớn');
    return buf;
  }

  // url: thư mục chứa manifest.json và manifest.json.sig. Trả về manifest đã xác minh hoặc { ok:false }.
  async checkRemote(url) {
    if (!lib.isSafeBaseUrl(url, this.allowLocal)) return { ok: false, error: 'địa chỉ cập nhật không an toàn (cần https)' };
    if (!this.publicKeyPem) return { ok: false, error: 'chưa cấu hình khoá công khai: tắt cập nhật từ xa' };
    try {
      const body = await this._fetchBytes(url + '/manifest.json', MAX_MANIFEST_BYTES);
      const sig = (await this._fetchBytes(url + '/manifest.json.sig', 4096)).toString('utf8');
      if (!this.verifySignature(body, sig)) return { ok: false, error: 'chữ ký manifest không hợp lệ' };
      const manifest = JSON.parse(body.toString('utf8'));
      const v = lib.validateManifest(manifest, { allowLocal: this.allowLocal });
      if (!v.ok) return { ok: false, error: v.errors[0] };
      if (!manifest.baseUrl) return { ok: false, error: 'manifest từ xa thiếu baseUrl' };
      return { ok: true, manifest };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async _downloadFile(url, part, asset, onBytes) {
    let start = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (start > asset.size) { fs.rmSync(part, { force: true }); start = 0; }
    const res = await this.fetch(url, { redirect: 'error', headers: start > 0 ? { Range: `bytes=${start}-` } : {} });
    if (res.status === 200 && start > 0) { fs.rmSync(part, { force: true }); start = 0; } // server không hỗ trợ Range: tải lại từ đầu
    else if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`);
    const out = fs.createWriteStream(part, { flags: start > 0 ? 'a' : 'w' });
    let got = start;
    try {
      for await (const chunk of res.body) {
        got += chunk.length;
        if (got > asset.size) throw new Error('file lớn hơn khai báo');
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        onBytes(chunk.length);
      }
    } finally {
      await new Promise((r) => out.end(r));
    }
  }

  // Tải một gói (kèm phụ thuộc) theo manifest đã xác minh. onProgress({done,total,asset}).
  async downloadPackage(remote, pkgId, onProgress = () => {}) {
    try {
      const pkgs = lib.resolvePackages(remote, [pkgId]);
      const { manifest: cur, origin } = this.merged();
      const have = cur ? lib.indexAssets(cur) : new Map();
      const todo = remote.assets.filter((a) => pkgs.includes(a.package)).filter((a) => {
        const h = have.get(a.id);
        return !h || lib.cmpVersion(a.version, h.version) > 0 || h.sha256 !== a.sha256 || !fs.existsSync(path.join(this.rootOf(origin, a.id), a.path));
      });
      const total = todo.reduce((s, a) => s + a.size, 0);
      fs.mkdirSync(this.installedRoot, { recursive: true });
      try {
        const s = await fs.promises.statfs(this.installedRoot);
        if (Number(s.bavail) * Number(s.bsize) < total * 1.2 + 16 * 1024 * 1024) return { ok: false, error: 'không đủ dung lượng ổ đĩa' };
      } catch { /* bỏ qua nếu không đọc được */ }
      const staging = path.join(this.installedRoot, '.download');
      fs.mkdirSync(staging, { recursive: true });
      let done = 0;
      const entries = [];
      for (const a of todo) {
        const part = path.join(staging, a.sha256 + '.part');
        const url = remote.baseUrl + '/' + a.path;
        await this._downloadFile(url, part, a, (n) => { done += n; onProgress({ done, total, asset: a.id }); });
        const r = await this.verifyFile(part, a);
        if (!r.ok) { fs.rmSync(part, { force: true }); return { ok: false, error: `${a.id}: ${r.reason} sau khi tải` }; }
        entries.push({ asset: a, staged: part });
      }
      const meta = { version: remote.version, packages: Object.fromEntries(pkgs.map((p) => [p, { ...remote.packages[p], bundled: false }])), bindings: remote.bindings };
      await this._apply(entries, meta);
      fs.rmSync(staging, { recursive: true, force: true });
      return { ok: true, downloaded: entries.length };
    } catch (e) {
      return { ok: false, error: e.message }; // file .part giữ lại để lần sau tiếp tục
    }
  }

  async remove(pkgId) {
    const man = this._load(this.installedRoot);
    if (!man || !man.packages[pkgId]) return { ok: false, error: 'gói chưa được cài thêm' };
    for (const a of man.assets.filter((x) => x.package === pkgId)) fs.rmSync(path.join(this.installedRoot, a.path), { force: true });
    man.assets = man.assets.filter((x) => x.package !== pkgId);
    delete man.packages[pkgId];
    fs.writeFileSync(path.join(this.installedRoot, 'manifest.json'), JSON.stringify(man, null, 1));
    return { ok: true };
  }
}

module.exports = { AssetStore };

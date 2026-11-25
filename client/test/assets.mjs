// Kiểm thử thư viện tài nguyên: manifest, an toàn đường dẫn, phụ thuộc, logic hoạt cảnh, cài đặt/hoàn tác/tải có resume/chữ ký.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pickLocomotion, findClipName, locomotionTimeScale } from '../src/gfx/animLogic.js';
const require = createRequire(import.meta.url);
const lib = require('../shared/assetManifest.cjs');
const { AssetStore } = require('../electron/assetstore.js');
const { buildManifest } = require('../tools/pack-assets.js');
const { buildBoxGlb } = require('../tools/make-sample-glb.js');
const gen = require('../tools/gen-textures.js');

let fails = 0;
const check = (name, cond, extra = '') => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hachihi-assets-'));

// ---- 1. Đường dẫn an toàn
{
  const ok = ['characters/team-a/soldier_01_lod0.glb', 'textures/concrete/concrete_01.ktx2', 'a/b.png'];
  const bad = ['../x.glb', '/abs/x.glb', 'c:/x.glb', 'a\\b.glb', 'a/b.exe', 'a/b.js', 'a/b.dll', 'a/b.bat', 'a//b.glb', 'a/.hidden.glb', 'a/b c.glb', 'a/b.glb\0'];
  check('Đường dẫn hợp lệ được chấp nhận', ok.every(lib.isSafeRelPath));
  check('Đường dẫn nguy hiểm/thực thi bị từ chối', bad.every((p) => !lib.isSafeRelPath(p)), bad.filter(lib.isSafeRelPath).join(','));
  check('URL tải: https ok, http ngoài localhost bị từ chối', lib.isSafeBaseUrl('https://cdn.example.com/hachihi') && !lib.isSafeBaseUrl('http://evil.com/x') && !lib.isSafeBaseUrl('file:///etc') && !lib.isSafeBaseUrl('http://127.0.0.1:1') && lib.isSafeBaseUrl('http://127.0.0.1:1', true));
}

// ---- 2. Manifest hợp lệ / hỏng
const goodAsset = (o = {}) => ({ id: 'weapons/rifle/assault_rifle', version: '1.0.0', path: 'weapons/rifle/assault_rifle.glb', size: 10, sha256: 'a'.repeat(64), package: 'weapons', compression: 'meshopt', license: { name: 'CC0-1.0', author: 'X' }, ...o });
const goodManifest = (o = {}) => ({ schema: 1, version: '1.0.0', packages: { core: { name: 'Core', version: '1.0.0', bundled: true, deps: [] }, weapons: { name: 'W', version: '1.0.0', deps: ['core'] } }, assets: [goodAsset()], bindings: { weapons: { rifle: 'weapons/rifle/assault_rifle' } }, ...o });
{
  check('Manifest hợp lệ', lib.validateManifest(goodManifest()).ok);
  const cases = [
    ['thiếu SHA-256', goodManifest({ assets: [goodAsset({ sha256: 'zz' })] })],
    ['path thoát thư mục', goodManifest({ assets: [goodAsset({ path: '../evil.glb' })] })],
    ['file .js', goodManifest({ assets: [goodAsset({ path: 'weapons/x.js' })] })],
    ['thiếu giấy phép', goodManifest({ assets: [goodAsset({ license: undefined })] })],
    ['package không tồn tại', goodManifest({ assets: [goodAsset({ package: 'nope' })] })],
    ['id trùng', goodManifest({ assets: [goodAsset(), goodAsset({ path: 'weapons/b.glb' })] })],
    ['nén lạ', goodManifest({ assets: [goodAsset({ compression: 'rar' })] })],
    ['baseUrl http', goodManifest({ baseUrl: 'http://evil.com' })],
    ['binding trỏ asset không có', goodManifest({ bindings: { weapons: { rifle: 'nope' } } })],
  ];
  for (const [n, m] of cases) check('Manifest bị từ chối: ' + n, !lib.validateManifest(m).ok);
}

// ---- 3. Phụ thuộc package
{
  const m = goodManifest();
  check('Phụ thuộc: core cài trước weapons', JSON.stringify(lib.resolvePackages(m, ['weapons'])) === '["core","weapons"]');
  m.packages.core.deps = ['weapons'];
  let threw = false; try { lib.resolvePackages(m, ['weapons']); } catch { threw = true; }
  check('Phát hiện vòng phụ thuộc', threw);
}

// ---- 4. Logic hoạt cảnh
{
  check('Chọn trạng thái: đứng/đi/chạy/nhảy/ngồi/chết', pickLocomotion({ speed: 0 }) === 'idle' && pickLocomotion({ speed: 2 }) === 'walk' && pickLocomotion({ speed: 5.5 }) === 'run' && pickLocomotion({ airborne: true, speed: 5 }) === 'jump' && pickLocomotion({ crouch: true }) === 'crouch' && pickLocomotion({ crouch: true, speed: 1.5 }) === 'crouch_walk' && pickLocomotion({ dead: true, airborne: true }) === 'death');
  const names = ['Armature|Idle', 'Armature|Walk', 'Armature|Run', 'Crouch_Idle', 'Crouch_Walk', 'Jump', 'Reload', 'Death'];
  check('Khớp tên clip trong GLB', findClipName(names, 'idle') === 'Armature|Idle' && findClipName(names, 'crouch') === 'Crouch_Idle' && findClipName(names, 'crouch_walk') === 'Crouch_Walk' && findClipName(names, 'run') === 'Armature|Run' && findClipName(names, 'fire') === null);
  check('Tốc độ phát clip theo tốc độ chạy trong khoảng 0,6–1,6', locomotionTimeScale('run', 5.6) === 1 && locomotionTimeScale('run', 100) === 1.6 && locomotionTimeScale('walk', 0.1) === 0.6 && locomotionTimeScale('idle', 3) === 1);
}

// ---- 5. Đóng gói bằng tools/pack-assets.js
function makePack(dir, { license = true } = {}) {
  fs.mkdirSync(path.join(dir, 'core'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'weapons/rifle'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'core/readme.json'), JSON.stringify({ hello: 'core' }));
  fs.writeFileSync(path.join(dir, 'weapons/rifle/assault_rifle.glb'), buildBoxGlb());
  fs.writeFileSync(path.join(dir, 'weapons/rifle/assault_rifle_lod1.glb'), buildBoxGlb({ w: 0.12 }));
  fs.writeFileSync(path.join(dir, 'packs.json'), JSON.stringify({ version: '1.0.0', packages: { core: { name: 'Core', version: '1.0.0', bundled: true, dirs: ['core/'] }, weapons: { name: 'Weapons', version: '1.0.0', deps: ['core'], dirs: ['weapons/'] } } }));
  fs.writeFileSync(path.join(dir, 'licenses.json'), JSON.stringify(license ? { 'core/': { name: 'CC0-1.0', author: 'HACHIHI' }, 'weapons/': { name: 'CC0-1.0', author: 'HACHIHI', source: 'tự tạo' } } : {}));
  fs.writeFileSync(path.join(dir, 'bindings.json'), JSON.stringify({ weapons: { rifle: 'weapons/rifle/assault_rifle' } }));
}
{
  const d = tmp();
  makePack(d);
  const m = buildManifest(d);
  const rifle = m.assets.find((a) => a.id === 'weapons/rifle/assault_rifle');
  check('Đóng gói: manifest có SHA-256, kích thước, giấy phép, binding', m.assets.length === 3 && /^[0-9a-f]{64}$/.test(rifle.sha256) && rifle.size === buildBoxGlb().length && rifle.license.name === 'CC0-1.0' && m.bindings.weapons.rifle === rifle.id);
  const d2 = tmp();
  makePack(d2, { license: false });
  let threw = false; try { buildManifest(d2); } catch (e) { threw = /thiếu giấy phép/.test(e.message); }
  check('Đóng gói từ chối asset không có giấy phép', threw);
  fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(m));
  fs.writeFileSync(path.join(d, 'packs.json'), fs.readFileSync(path.join(d, 'packs.json')));
}

// ---- 5b. Bộ tạo texture PBR: liền mạch, normal hợp lệ, PNG đúng, xác định (cùng kết quả mỗi lần chạy), gói hợp lệ
{
  const N = 128;
  const lum = (d, i) => (d[i * 3] * 0.3 + d[i * 3 + 1] * 0.59 + d[i * 3 + 2] * 0.11);
  let worst = 0; let allOk = true; let normalsOk = true; let rangeOk = true;
  for (const kind of gen.BASE) {
    const t = gen.generateKind(kind, N);
    // tuần hoàn chính xác: hàm bề mặt tại u=0 và u=1 (v=0 và v=1) phải cho cùng kết quả => ghép gạch không thấy đường nối
    const o1 = { h: 0, r: 0, g: 0, b: 0, rough: 0 }; const o2 = { ...o1 };
    for (let k = 0; k < 150; k++) {
      const t = (k * 0.6180339) % 1;
      for (const [a, b, c, d] of [[0, t, 1, t], [t, 0, t, 1]]) {
        gen.KINDS[kind](a, b, o1); gen.KINDS[kind](c, d, o2);
        for (const f of ['h', 'r', 'g', 'b', 'rough']) worst = Math.max(worst, Math.abs(o1[f] - o2[f]));
      }
    }
    for (let i = 0; i < N * N; i++) {
      const nx = t.normal[i * 3] / 255 * 2 - 1; const ny = t.normal[i * 3 + 1] / 255 * 2 - 1; const nz = t.normal[i * 3 + 2] / 255 * 2 - 1;
      if (nz <= 0 || Math.abs(Math.hypot(nx, ny, nz) - 1) > 0.03) { normalsOk = false; break; }
    }
    let mean = 0; for (let i = 0; i < N * N; i++) mean += lum(t.color, i); mean /= N * N * 255;
    const rs = new Set(t.roughness); 
    if (mean < 0.45 || mean > 0.97 || rs.size < 12) rangeOk = false;
    const b = gen.generateKind(kind, N);
    if (Buffer.compare(Buffer.from(t.color), Buffer.from(b.color)) !== 0) allOk = false;
  }
  check('Texture liền mạch: bề mặt tuần hoàn chính xác (u=0 ≡ u=1, v=0 ≡ v=1)', worst < 1e-6, `lệch lớn nhất=${worst.toExponential(1)}`);
  check('Normal map hợp lệ (đơn vị, hướng ra ngoài)', normalsOk);
  check('Albedo sáng vừa để nhân màu khối; roughness có biến thiên', rangeOk);
  check('Kết quả xác định (cùng đầu vào, cùng texture)', allOk);
  const t = gen.generateKind('brick', 64);
  const png = gen.encodePng(64, 64, 3, t.color);
  const back = gen.decodePng(png);
  check('PNG ghi ra giải mã lại đúng từng byte', png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && back.w === 64 && Buffer.compare(Buffer.from(back.data), Buffer.from(t.color)) === 0);
  const out = tmp();
  const m = gen.writePack(out, { size: 64, kinds: ['brick', 'metal'] });
  check('Gói texture tạo tại máy: manifest hợp lệ, có giấy phép CC0, có binding', lib.validateManifest(m).ok && m.assets.length === 6 && m.assets.every((a) => a.license.name === 'CC0-1.0') && m.bindings.textures.brick.tile === 2.4);
  const store = new AssetStore({ bundledRoot: tmp(), installedRoot: tmp(), extraRoots: [out] });
  const av = store.available();
  check('Game nhận texture từ thư mục dùng chung (binding đầy đủ)', av && av.bindings.textures.metal && av.bindings.textures.metal.roughness === 'textures/metal/roughness');
  check('Xác minh SHA-256 gói texture', (await store.verify()).bad.length === 0);
}

(async () => {
  // ---- 6. AssetStore: cài từ thư mục, xác minh, hoàn tác
  const src = tmp(); makePack(src);
  const manifest = buildManifest(src);
  fs.writeFileSync(path.join(src, 'manifest.json'), JSON.stringify(manifest));
  const bundled = tmp(); const installed = tmp();
  const store = new AssetStore({ bundledRoot: bundled, installedRoot: installed });
  {
    const r = await store.installFromDir(src);
    check('Cài từ thư mục thành công', r.ok && r.installed === 3, r.error || '');
    const v = await store.verify();
    check('Xác minh sau khi cài: 0 file hỏng', v.checked === 3 && v.bad.length === 0);
    const st = await store.status();
    check('Trạng thái: gói đã cài đầy đủ', st.packages.find((p) => p.id === 'weapons').complete);
    check('Giao thức hasset: chỉ phục vụ file hợp lệ trong thư mục gói', !!store.resolveFile('weapons/rifle/assault_rifle.glb') && !store.resolveFile('../manifest.json') && !store.resolveFile('weapons/nope.glb') && !store.resolveFile('manifest.json.js'));
    // làm hỏng một file đã cài
    fs.appendFileSync(path.join(installed, 'weapons/rifle/assault_rifle.glb'), 'x');
    const v2 = await store.verify('weapons');
    check('Phát hiện file đã cài bị sửa', v2.bad.length === 1 && /kích thước|SHA/.test(v2.bad[0].reason));
  }
  {
    // gói hỏng: sửa file nguồn sau khi tính hash => từ chối, không đụng tới bản đã cài
    const bad = tmp(); makePack(bad);
    const m2 = buildManifest(bad);
    m2.version = '1.1.0'; for (const a of m2.assets) { a.version = '1.1.0'; }
    m2.packages.weapons.version = '1.1.0';
    fs.writeFileSync(path.join(bad, 'manifest.json'), JSON.stringify(m2));
    fs.appendFileSync(path.join(bad, 'weapons/rifle/assault_rifle_lod1.glb'), 'tamper');
    const before = fs.readFileSync(path.join(installed, 'manifest.json'), 'utf8');
    const r = await store.installFromDir(bad);
    check('Gói bị sửa nội dung bị từ chối', !r.ok && /kích thước|SHA/.test(r.error), r.error);
    check('Bản đã cài không bị thay đổi khi cài thất bại', fs.readFileSync(path.join(installed, 'manifest.json'), 'utf8') === before);
    const leftovers = fs.readdirSync(installed).filter((n) => n.startsWith('.staging') || n.startsWith('.backup'));
    check('Không để lại thư mục tạm', leftovers.length === 0, leftovers.join(','));
  }
  {
    // hoàn tác giữa chừng: ép lỗi khi áp dụng (đường dẫn đích là file) -> khôi phục
    const s2 = new AssetStore({ bundledRoot: tmp(), installedRoot: tmp() });
    await s2.installFromDir(src);
    const orig = fs.readFileSync(path.join(s2.installedRoot, 'weapons/rifle/assault_rifle.glb'));
    const upd = tmp(); makePack(upd);
    fs.writeFileSync(path.join(upd, 'weapons/rifle/assault_rifle.glb'), buildBoxGlb({ w: 0.3 }));
    const mU = buildManifest(upd); mU.assets.forEach((a) => { a.version = '2.0.0'; }); mU.packages.weapons.version = '2.0.0';
    fs.writeFileSync(path.join(upd, 'manifest.json'), JSON.stringify(mU));
    const realRename = fs.renameSync; let n = 0;
    fs.renameSync = (a, b) => { if (String(b).endsWith('manifest.json') && ++n >= 1) throw new Error('ổ đĩa đầy (giả lập)'); return realRename(a, b); };
    const r = await s2.installFromDir(upd);
    fs.renameSync = realRename;
    check('Cập nhật lỗi giữa chừng: báo lỗi và hoàn tác', !r.ok && /ổ đĩa đầy/.test(r.error));
    check('Sau hoàn tác file cũ còn nguyên', fs.readFileSync(path.join(s2.installedRoot, 'weapons/rifle/assault_rifle.glb')).equals(orig));
  }

  // ---- 7. Gói đi kèm + gói cài thêm: phiên bản mới hơn thắng
  {
    const s3 = new AssetStore({ bundledRoot: src, installedRoot: tmp() });
    const merged = s3.merged();
    check('Gói đi kèm được đọc và hợp lệ', merged.manifest && merged.manifest.assets.length === 3);
    check('Core Pack đi kèm xác minh được', (await s3.verify('core')).bad.length === 0);
    // gói tuỳ chọn chưa cài: không tính là hỏng, và không xuất hiện trong manifest dành cho game
    const half = tmp(); makePack(half);
    const mh = buildManifest(half); fs.writeFileSync(path.join(half, 'manifest.json'), JSON.stringify(mh));
    fs.rmSync(path.join(half, 'weapons'), { recursive: true });
    const s4 = new AssetStore({ bundledRoot: half, installedRoot: tmp() });
    const av = s4.available();
    check('Gói tuỳ chọn chưa cài: không báo hỏng, bỏ khỏi manifest cho game, bỏ binding thiếu', (await s4.verify()).bad.length === 0 && av.assets.length === 1 && !av.bindings.weapons.rifle);
  }

  // ---- 7b. Thư mục dùng chung cho cả máy (tiệm net): gói ở extraRoots được dùng, không cần cài vào hồ sơ người dùng
  {
    const shared = tmp(); makePack(shared);
    const ms = buildManifest(shared); fs.writeFileSync(path.join(shared, 'manifest.json'), JSON.stringify(ms));
    const s5 = new AssetStore({ bundledRoot: tmp(), installedRoot: tmp(), extraRoots: [shared] });
    const av2 = s5.available();
    check('Gói ở thư mục dùng chung của máy được nhận (không cần cài riêng cho từng người dùng)', av2 && av2.assets.length === 3 && av2.bindings.weapons.rifle === 'weapons/rifle/assault_rifle');
    check('Phục vụ file từ thư mục dùng chung và vẫn chặn đường dẫn nguy hiểm', !!s5.resolveFile('weapons/rifle/assault_rifle.glb') && !s5.resolveFile('../x.glb'));
    check('Xác minh gói dùng chung', (await s5.verify()).bad.length === 0);
    const st5 = await s5.status();
    check('Trạng thái ghi nguồn "shared"', st5.packages.find((p) => p.id === 'weapons').origin === 'shared');
  }

  // ---- 8. Tải từ xa có chữ ký, resume, hash
  {
    const keys = crypto.generateKeyPairSync('ed25519');
    const pub = keys.publicKey.export({ type: 'spki', format: 'pem' });
    const remoteDir = tmp(); makePack(remoteDir);
    const mR = buildManifest(remoteDir);
    let port = 0;
    const requests = [];
    let truncateOnce = true;
    let tamper = false;
    const srv = http.createServer((req, res) => {
      requests.push(req.url + (req.headers.range ? ' ' + req.headers.range : ''));
      const rel = decodeURIComponent(req.url.slice(1));
      if (rel === 'manifest.json') { const body = Buffer.from(JSON.stringify({ ...mR, baseUrl: `http://127.0.0.1:${port}` })); res.end(body); return; }
      if (rel === 'manifest.json.sig') {
        const body = Buffer.from(JSON.stringify({ ...mR, baseUrl: `http://127.0.0.1:${port}` }));
        const sig = crypto.sign(null, body, tamper ? crypto.generateKeyPairSync('ed25519').privateKey : keys.privateKey).toString('base64');
        res.end(sig); return;
      }
      const f = path.join(remoteDir, rel);
      if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      const data = fs.readFileSync(f);
      const m = /bytes=(\d+)-/.exec(req.headers.range || '');
      const start = m ? Number(m[1]) : 0;
      const slice = data.subarray(start);
      if (truncateOnce && rel.endsWith('assault_rifle.glb') && !m) { // lần đầu: cắt ngang giữa chừng (mất kết nối)
        truncateOnce = false;
        res.writeHead(200, { 'Content-Length': slice.length });
        res.write(slice.subarray(0, 500));
        setTimeout(() => res.destroy(), 20);
        return;
      }
      res.writeHead(m ? 206 : 200, { 'Content-Length': slice.length });
      res.end(slice);
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    port = srv.address().port;
    const base = `http://127.0.0.1:${port}`;
    const st = new AssetStore({ bundledRoot: tmp(), installedRoot: tmp(), publicKeyPem: pub, allowInsecureLocal: true });

    const chk = await st.checkRemote(base);
    check('Manifest từ xa có chữ ký hợp lệ được chấp nhận', chk.ok, chk.error || '');
    tamper = true;
    const bad = await st.checkRemote(base);
    check('Manifest ký bằng khoá lạ bị từ chối', !bad.ok && /chữ ký/.test(bad.error), bad.error);
    tamper = false;
    const noKey = new AssetStore({ bundledRoot: tmp(), installedRoot: tmp(), allowInsecureLocal: true });
    check('Không có khoá công khai thì tắt cập nhật từ xa', !(await noKey.checkRemote(base)).ok);
    const insecure = new AssetStore({ bundledRoot: tmp(), installedRoot: tmp(), publicKeyPem: pub });
    check('Địa chỉ http ngoài localhost bị từ chối', !(await insecure.checkRemote('http://example.com/x')).ok);

    const progress = [];
    const first = await st.downloadPackage(chk.manifest, 'weapons', (p) => progress.push(p.done));
    check('Mất kết nối giữa chừng: báo lỗi, giữ file .part để tiếp tục', !first.ok && fs.readdirSync(path.join(st.installedRoot, '.download')).some((n) => n.endsWith('.part')), first.error || '');
    const second = await st.downloadPackage(chk.manifest, 'weapons', (p) => progress.push(p.done));
    check('Tải lại: tiếp tục (Range) và cài thành công', second.ok && requests.some((r) => /bytes=\d+-/.test(r)), second.error || requests.join(' | '));
    const v = await st.verify();
    check('Sau tải: mọi file khớp SHA-256, gồm cả gói phụ thuộc (core)', v.checked === 3 && v.bad.length === 0, JSON.stringify(v.bad));
    const rm = await st.remove('weapons');
    check('Gỡ gói đã cài', rm.ok && !fs.existsSync(path.join(st.installedRoot, 'weapons/rifle/assault_rifle.glb')));
    srv.close();
  }
  if (fails) { console.log(`\n${fails} LỖI`); process.exit(1); }
  console.log('\nASSETS OK');
})();

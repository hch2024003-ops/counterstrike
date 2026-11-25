// Phía renderer của thư viện tài nguyên: đọc manifest đã xác minh, đổi asset id thành URL cục bộ (hasset:// trong Electron, ./assets khi thử trên trình duyệt)
// và gọi các thao tác quản lý gói (xác minh, cài từ thư mục, cập nhật, gỡ) ở tiến trình chính.
// Mọi tài nguyên hình ảnh lấy từ máy; KHÔNG có URL ngoài (CDN) nào được dùng khi vào trận.
import lib from '../../shared/assetManifest.cjs';

const host = () => (typeof window !== 'undefined' && window.hachihiHost && window.hachihiHost.assets) || null;

export class AssetManager {
  constructor() {
    this.manifest = null;
    this.index = new Map();
    this.error = null;
    this.electron = !!host();
    this.base = this.electron ? 'hasset://pack/' : './assets/';
    this.decoderBase = this.electron ? 'hasset://decoders/' : './dist/decoders/';
  }

  async init() {
    try {
      const m = this.electron ? await host().manifest() : await (await fetch('./assets/manifest.json')).json();
      if (!m) throw new Error('chưa có thư viện tài nguyên');
      const v = lib.validateManifest(m, { allowLocal: false });
      if (!v.ok) throw new Error('manifest không hợp lệ: ' + v.errors[0]);
      this.manifest = m;
      this.index = lib.indexAssets(m);
      this.error = null;
    } catch (e) {
      this.manifest = null;
      this.index = new Map();
      this.error = e.message; // thiếu thư viện: game dùng model dựng bằng code (fallback)
    }
    return !!this.manifest;
  }

  has(id) { return this.index.has(id); }
  asset(id) { return this.index.get(id) || null; }
  url(id) {
    const a = this.index.get(id);
    return a ? this.base + a.path : null;
  }
  get bindings() { return (this.manifest && this.manifest.bindings) || {}; }

  // ---- quản lý gói (chỉ có trong bản Electron)
  status() { return host() ? host().status() : Promise.resolve({ packages: [], error: 'Chỉ có trong bản Electron' }); }
  verify(pkg) { return host() ? host().verify(pkg || null) : Promise.resolve({ checked: 0, bad: [] }); }
  installFromFolder() { return host() ? host().installFromFolder() : Promise.resolve({ ok: false, error: 'Chỉ có trong bản Electron' }); }
  checkUpdates() { return host() ? host().checkUpdates() : Promise.resolve({ ok: false, error: 'Chỉ có trong bản Electron' }); }
  download(pkg, onProgress) {
    if (!host()) return Promise.resolve({ ok: false, error: 'Chỉ có trong bản Electron' });
    if (onProgress) host().onProgress(onProgress);
    return host().download(pkg);
  }
  remove(pkg) { return host() ? host().remove(pkg) : Promise.resolve({ ok: false, error: 'Chỉ có trong bản Electron' }); }
}

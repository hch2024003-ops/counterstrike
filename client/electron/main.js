'use strict';
const { app, BrowserWindow, Menu, screen, ipcMain, protocol, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------
// Thư viện tài nguyên đồ họa (model GLB, texture): phục vụ qua giao thức hasset:// từ thư mục gói đi kèm + gói người dùng cài thêm.
// Chỉ phục vụ file nằm trong các thư mục này và có đuôi trong danh sách trắng; bộ giải mã Draco/KTX2 lấy từ dist/decoders (đóng gói kèm).
// ---------------------------------------------------------------
const { Readable } = require('stream');
const { AssetStore } = require('./assetstore');
protocol.registerSchemesAsPrivileged([{ scheme: 'hasset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const ASSET_BUNDLED = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', 'assets');
const ASSET_INSTALLED = path.join(app.getPath('userData'), 'assets');
const readIf = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
// Thư mục tài nguyên dùng chung cho cả máy: biến HACHIHI_ASSETS_DIR, %ProgramData%\\HACHIHI\\assets, hoặc thư mục hachihi-assets cạnh game (tiệm net copy sẵn gói ở đây).
const ASSET_EXTRA = [process.env.HACHIHI_ASSETS_DIR, process.env.ProgramData && path.join(process.env.ProgramData, 'HACHIHI', 'assets'), app.isPackaged ? path.join(path.dirname(process.execPath), 'hachihi-assets') : path.join(__dirname, '..', 'hachihi-assets')];
const assetStore = new AssetStore({ bundledRoot: ASSET_BUNDLED, installedRoot: ASSET_INSTALLED, extraRoots: ASSET_EXTRA, publicKeyPem: readIf(path.join(ASSET_BUNDLED, 'publisher.pub.pem')) });
const MIME = { '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const DECODER_RE = /^(draco|basis)\/[A-Za-z0-9_.-]+\.(js|wasm)$/;

function assetResponse(abs) {
  const ext = path.extname(abs).toLowerCase();
  return new Response(Readable.toWeb(fs.createReadStream(abs)), {
    headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': String(fs.statSync(abs).size), 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
  });
}

function registerAssetProtocol() {
  protocol.handle('hasset', (req) => {
    try {
      const u = new URL(req.url);
      const rel = decodeURIComponent(u.pathname.replace(/^\//, ''));
      if (u.hostname === 'pack') {
        const abs = assetStore.resolveFile(rel);
        if (abs) return assetResponse(abs);
      } else if (u.hostname === 'decoders' && DECODER_RE.test(rel)) {
        const root = path.join(__dirname, '..', 'dist', 'decoders');
        const abs = path.resolve(root, rel);
        if (abs.startsWith(root + path.sep) && fs.existsSync(abs)) return assetResponse(abs);
      }
    } catch { /* rơi xuống 404 */ }
    return new Response('not found', { status: 404 });
  });
}

// ---------------------------------------------------------------
// Cài đặt hiển thị lưu ở thư mục dữ liệu người dùng, đọc TRƯỚC khi app sẵn sàng vì V-Sync là công tắc dòng lệnh.
// pending: cài đặt cũ + hạn xác nhận; nếu người dùng không xác nhận (hoặc màn hình đen) thì tự khôi phục.
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// Nhật ký lỗi + chế độ an toàn đồ họa: lỗi khởi động không còn "biến mất" (cửa sổ chớp rồi tắt) mà được ghi lại và hiện thành hộp thoại.
// Chế độ an toàn tắt các tối ưu GPU (ép card rời, ANGLE D3D11, zero-copy, gpu-rasterization): bật bằng HACHIHI_SAFE=1 hoặc tự bật sau 2 lần GPU gặp sự cố.
// ---------------------------------------------------------------
const electronDialog = require('electron').dialog;
const LOG_CANDIDATES = [process.env.HACHIHI_LOG, path.join(__dirname, '..', 'hachihi-client.log'), path.join(app.getPath('userData'), 'hachihi-client.log')].filter(Boolean);
let LOG_FILE = LOG_CANDIDATES[LOG_CANDIDATES.length - 1];
for (const f of LOG_CANDIDATES) { try { fs.appendFileSync(f, ''); LOG_FILE = f; break; } catch { /* thử nơi khác */ } }
function log(msg) { try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + msg + '\n'); } catch { /* bỏ qua */ } }
const SAFE_FLAG = path.join(app.getPath('userData'), 'safe-gfx.flag');
const SAFE_GFX = process.env.HACHIHI_SAFE === '1' || fs.existsSync(SAFE_FLAG);
log(`khởi động · Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · ${process.platform} ${process.arch}${SAFE_GFX ? ' · CHẾ ĐỘ AN TOÀN ĐỒ HỌA' : ''}`);
let gpuCrashes = 0;
process.on('uncaughtException', (e) => {
  log('uncaughtException: ' + (e && e.stack || e));
  try { electronDialog.showErrorBox('HACHIHI gặp lỗi', String(e && e.stack || e).slice(0, 1500) + '\n\nNhật ký: ' + LOG_FILE); } catch { /* chưa sẵn sàng */ }
});
app.on('render-process-gone', (_e, _wc, d) => log('tiến trình hiển thị chết: ' + JSON.stringify(d)));
app.on('child-process-gone', (_e, d) => {
  log('tiến trình con chết: ' + JSON.stringify(d));
  if (d.type === 'GPU' && ++gpuCrashes >= 2 && !SAFE_GFX) {
    try { fs.writeFileSync(SAFE_FLAG, '1'); } catch { /* bỏ qua */ }
    try { electronDialog.showErrorBox('Card đồ họa gặp sự cố', 'Game sẽ chạy ở chế độ an toàn (tắt các tối ưu GPU) ở lần mở sau. Hãy mở lại game.\nNhật ký: ' + LOG_FILE); } catch { /* bỏ qua */ }
  }
});

const FILE = path.join(app.getPath('userData'), 'display.json');
const DEFAULT = { displayMode: 'windowed', resolution: 'native', vsync: true, pending: null };
const CONFIRM_MS = 15000;

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { ...DEFAULT, ...j };
  } catch {
    return { ...DEFAULT };
  }
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cfg));
  } catch { /* không lưu được thì bỏ qua */ }
}

let cfg = load();
// Hạn xác nhận đã qua trong lúc game đóng/treo: khôi phục cài đặt trước đó ngay khi khởi động.
if (cfg.pending && Date.now() > cfg.pending.deadline) {
  cfg = { ...cfg, ...cfg.pending.prev, pending: null };
  save();
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
// Laptop có hai card đồ họa: bắt buộc dùng card rời thay vì card tích hợp (nguyên nhân giật phổ biến nhất của game WebGL).
if (!SAFE_GFX) {
  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('use-angle', 'd3d11'); // Direct3D 11: đường dẫn nhanh nhất cho card NVIDIA/AMD/Intel trên Windows
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
if (cfg.vsync === false) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

let win = null;
let revertTimer = null;

function parseRes(s) {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(String(s || ''));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function createWindow() {
  const disp = screen.getPrimaryDisplay();
  const framed = cfg.displayMode === 'windowed';
  const res = parseRes(cfg.resolution);
  const wa = disp.workArea;
  const w = framed ? Math.min(res ? res[0] : Math.min(1280, wa.width), wa.width) : disp.bounds.width;
  const h = framed ? Math.min(res ? res[1] : Math.min(720, wa.height), wa.height) : disp.bounds.height;
  win = new BrowserWindow({
    width: w,
    height: h,
    x: framed ? undefined : disp.bounds.x,
    y: framed ? undefined : disp.bounds.y,
    useContentSize: framed,
    minWidth: framed ? 960 : undefined,
    minHeight: framed ? 540 : undefined,
    frame: framed,
    fullscreen: cfg.displayMode === 'fullscreen',
    backgroundColor: '#0b0f14',
    title: 'HACHIHI Counter-Strike',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.webContents.on('console-message', (_e, level, message, line, src) => { if (level >= 2) log(`console ${level === 2 ? 'cảnh báo' : 'LỖI'}: ${message} @${String(src).split('/').pop()}:${line}`); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log(`không nạp được trang: ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (_e, d) => log('trang bị sập: ' + JSON.stringify(d)));
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  win.on('closed', () => { win = null; });
}

function displayInfo() {
  const d = screen.getPrimaryDisplay();
  return {
    width: d.size.width,
    height: d.size.height,
    scaleFactor: d.scaleFactor,
    refreshRate: d.displayFrequency || 0,
    displayMode: cfg.displayMode,
    resolution: cfg.resolution,
    vsync: cfg.vsync,
    pending: cfg.pending ? { deadline: cfg.pending.deadline } : null,
  };
}

function armRevertTimer() {
  clearTimeout(revertTimer);
  if (!cfg.pending) return;
  // Phòng khi giao diện không còn phản hồi (màn hình đen): chính tiến trình chính sẽ khôi phục.
  revertTimer = setTimeout(() => doRevert(), Math.max(0, cfg.pending.deadline - Date.now()) + 1500);
}

function doRevert() {
  if (!cfg.pending) return displayInfo();
  const prev = cfg.pending.prev;
  const vsyncChanged = prev.vsync !== cfg.vsync;
  cfg = { ...cfg, ...prev, pending: null };
  save();
  clearTimeout(revertTimer);
  if (vsyncChanged) {
    app.relaunch();
    app.exit(0);
  } else {
    recreate();
  }
  return displayInfo();
}

function recreate() {
  const old = win;
  createWindow();
  if (old) old.destroy();
}

ipcMain.handle('display:info', () => displayInfo());

ipcMain.handle('display:apply', (_e, opts) => {
  const next = {
    displayMode: ['windowed', 'borderless', 'fullscreen'].includes(opts && opts.displayMode) ? opts.displayMode : cfg.displayMode,
    resolution: opts && (opts.resolution === 'native' || parseRes(opts.resolution)) ? opts.resolution : cfg.resolution,
    vsync: opts && typeof opts.vsync === 'boolean' ? opts.vsync : cfg.vsync,
  };
  const changed = next.displayMode !== cfg.displayMode || next.resolution !== cfg.resolution || next.vsync !== cfg.vsync;
  if (!changed) return { changed: false, ...displayInfo() };
  const prev = { displayMode: cfg.displayMode, resolution: cfg.resolution, vsync: cfg.vsync };
  const vsyncChanged = next.vsync !== cfg.vsync;
  cfg = { ...cfg, ...next, pending: { prev, deadline: Date.now() + CONFIRM_MS + 1000 } };
  save();
  armRevertTimer();
  if (vsyncChanged) {
    // V-Sync là công tắc dòng lệnh: phải mở lại game.
    setTimeout(() => { app.relaunch(); app.exit(0); }, 150);
    return { changed: true, relaunch: true };
  }
  setTimeout(recreate, 50);
  return { changed: true, relaunch: false };
});

ipcMain.handle('display:confirm', () => {
  cfg = { ...cfg, pending: null };
  save();
  clearTimeout(revertTimer);
  return displayInfo();
});

ipcMain.handle('display:revert', () => doRevert());

// --- quản lý thư viện tài nguyên (URL cập nhật đọc từ assets/update.json đi kèm bộ cài, KHÔNG nhận từ renderer hay từ server game)
const updateUrl = () => { try { return JSON.parse(readIf(path.join(ASSET_BUNDLED, 'update.json')) || '{}').url || null; } catch { return null; } };
let remoteCache = null;
ipcMain.handle('assets:manifest', () => assetStore.available());
ipcMain.handle('assets:status', () => assetStore.status());
ipcMain.handle('assets:verify', (_e, pkg) => assetStore.verify(typeof pkg === 'string' ? pkg : undefined));
ipcMain.handle('assets:install-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Chọn thư mục gói tài nguyên (có manifest.json)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'đã huỷ' };
  return assetStore.installFromDir(r.filePaths[0]);
});
ipcMain.handle('assets:check-updates', async () => {
  const url = updateUrl();
  if (!url) return { ok: false, error: 'chưa cấu hình cập nhật (không có assets/update.json)' };
  const r = await assetStore.checkRemote(url);
  if (r.ok) remoteCache = r.manifest;
  return r.ok ? { ok: true, packages: Object.entries(r.manifest.packages).map(([id, p]) => ({ id, name: p.name, version: p.version, size: p.size || 0 })) } : r;
});
ipcMain.handle('assets:download', async (e, pkg) => {
  if (!remoteCache || typeof pkg !== 'string') return { ok: false, error: 'hãy kiểm tra cập nhật trước' };
  return assetStore.downloadPackage(remoteCache, pkg, (p) => { try { e.sender.send('assets:progress', p); } catch { /* cửa sổ đã đóng */ } });
});
ipcMain.handle('assets:remove', (_e, pkg) => (typeof pkg === 'string' ? assetStore.remove(pkg) : { ok: false, error: 'tham số sai' }));

ipcMain.handle('metrics', () => {
  const m = app.getAppMetrics();
  let cpu = 0;
  let gpuCpu = 0;
  let memKb = 0;
  for (const p of m) {
    cpu += p.cpu.percentCPUUsage;
    if (p.type === 'GPU') gpuCpu += p.cpu.percentCPUUsage;
    memKb += (p.memory && p.memory.workingSetSize) || 0;
  }
  return { cpuPercent: cpu, gpuProcessCpuPercent: gpuCpu, memoryMB: memKb / 1024 };
});

app.whenReady().then(() => {
  registerAssetProtocol();
  Menu.setApplicationMenu(null);
  createWindow();
  armRevertTimer();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

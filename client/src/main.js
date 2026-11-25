// Điểm vào của client: nối giao diện, mạng, điều khiển, âm thanh và vòng lặp game.
import { fatal } from './ui/fatal.js'; // PHẢI đứng đầu: bắt lỗi của mọi module nạp sau
import * as THREE from 'three';
import { DEFAULT_SERVER, SEND_HZ, CONNECT_TIMEOUT_MS, TEAM_NAMES, PHYSICS_STEP } from './config.js';
import { World, MAP_DATA } from './game/world.js';
import { Controller, EYE, makeBoxes } from './game/controller.js';
import { FixedStepper } from './game/loop.js';
import { Net } from './multiplayer/net.js';
import { AudioEngine } from './audio/audio.js';
import { WEAPONS, WEAPON_ORDER, applyServerWeapons, spreadOf, weaponForKey } from './weapons/weapons.js';
import { Shop } from './ui/shop.js';
import { Keybinds, MOVE_FLAGS } from './ui/keybinds.js';
import { KeysPanel } from './ui/keysui.js';
import { initGuide } from './ui/guide.js';
import { initAssetsUi } from './ui/assetsui.js';
import { visuals } from './gfx/visuals.js';
import { ScopeOverlay, SCOPE_FOV, BASE_FOV } from './ui/scope.js';
import { throwParams, simulateNade, NADE } from './game/nade-physics.js';
import { ViewModel } from './weapons/viewmodel.js';
import { Punch, RECOIL } from './weapons/recoil.js';
import { FrameStats } from './ui/stats.js';
import { ui } from './ui/ui.js';
import { AutoQuality } from './gfx/autoq.js';
import { EnvQuality, loadEnvSettings, saveEnvSettings, weatherSeed } from './gfx/envlogic.js';
import { EnvFxPanel } from './ui/envui.js';
import * as GS from './gfx/settings.js';
import { Bench, formatReport, summarize } from './ui/stats.js';
import { SettingsPanel } from './ui/settingsui.js';

// ---------------------------------------------------------------
// Lưu cài đặt cục bộ
// ---------------------------------------------------------------
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('hachihi.' + k);
      return v == null ? d : v;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('hachihi.' + k, v);
    } catch { /* bỏ qua */ }
  },
};

// ---------------------------------------------------------------
// Đối tượng chính
// ---------------------------------------------------------------
const world = new World(document.getElementById('game'));
const controller = new Controller(makeBoxes(MAP_DATA));
const vm = new ViewModel();
const net = new Net();
const audio = new AudioEngine();
const punch = new Punch(); // giật tâm ngắm
const stepper = new FixedStepper(PHYSICS_STEP);
const frameStats = new FrameStats(300);
world.onResize = (aspect) => vm.resize(aspect);
vm.resize(window.innerWidth / window.innerHeight);
if (world.envTex) vm.setEnv(world.envTex);
initGuide();
initAssetsUi(visuals.assets);
// Nạp thư viện tài nguyên đồ họa (GLB) trong nền; thiếu hoặc lỗi thì giữ model dựng bằng code, game vẫn chơi bình thường.
visuals.init(world.renderer)
  .then((ok) => {
    if (!ok) { console.info('[assets] dùng model dựng bằng code:', visuals.assets.error); return null; }
    return visuals.preload((p) => { if (S.screen === 'menu') ui.setMenuStatus(`Đang nạp đồ họa… ${Math.round(p * 100)}%`); })
      .then(() => visuals.loadTextures((p) => { if (S.screen === 'menu') ui.setMenuStatus(`Đang nạp texture chất lượng cao… ${Math.round(p * 100)}%`); }))
      .then((changed) => { if (changed) world.reloadMap(); }) // dựng lại bản đồ với texture mới
      .then(() => { if (S.screen === 'menu') ui.setMenuStatus(''); });
  })
  .catch((e) => console.warn('[assets]', e));
const scopeUi = new ScopeOverlay();
const shop = new Shop(document.getElementById('hud'), (o) => net.send(o));
const _mz = new THREE.Vector3();
const _ej = new THREE.Vector3();

const blankSelf = () => ({
  hp: 100,
  alive: false,
  weapon: 'rifle',
  reloading: false,
  ammo: { rifle: [30, 90], pistol: [12, 48], shotgun: [6, 24] },
  money: 0,
  armor: 0,
  owned: ['pistol'],
  nades: [0, 0],
});
// Đổi bản đồ khi chủ phòng chọn (hoặc khi vào phòng): dựng lại môi trường và va chạm của client.
function applyMap(id) {
  if (!id || S.mapId === id) return;
  const data = world.loadMap(id);
  controller.boxes = makeBoxes(data);
  S.mapId = data.id;
}
function fillMapSelect(maps) {
  const sel = ui.el.optMap;
  sel.textContent = '';
  for (const m of maps || []) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = `${m.name} (${m.size}m · ${m.tag})`;
    o.dataset.desc = m.desc || '';
    sel.appendChild(o);
  }
}
const economyOn = () => !S.settings || S.settings.economy !== false;
const blankRound = () => ({ phase: 'lobby', round: 0, scoreA: 0, scoreB: 0, endAt: 0, winner: null, matchWinner: null, toWin: 8 });

const S = {
  screen: 'menu', // menu | lobby | game
  me: { id: 0, team: null, token: '', pin: '', host: false },
  serverUrl: '',
  room: null,
  roster: new Map(),
  round: blankRound(),
  self: blankSelf(),
  locked: false,
  mouseDown: false,
  fireLatched: false,
  emptyClicked: false,
  nextFireAt: 0,
  lastSend: 0,
  reconnecting: false,
  specIdx: 0,
  camSet: false,
  menuT: 0,
  stepT: 0,
  sens: 1,
  scoped: false, // đang nhìn qua ống ngắm
  zoomT: 0, // mức thu phóng hiện tại 0..1
  zoomFov: 22, // góc nhìn dọc đích khi nhắm (22 = ống ngắm bắn tỉa, lớn hơn = nhắm qua thước ngắm)
  zoomScope: true, // true: nhìn qua ống ngắm bắn tỉa (hiện thước chia); false: nhắm thường
  nadeAim: null, // 'frag' | 'smoke' khi đang giữ phím canh ném
  spray: 0, // ước lượng số phát liên tiếp để vẽ tâm ngắm nở ra (server mới là bên quyết định tản đạn thật)
  lastShotMs: 0,
  quality: 'auto',
  alpha: 0, // hệ số nội suy hình ảnh giữa 2 bước vật lý
};
window.__hachihi = { S, net, controller, world }; // tiện gỡ lỗi trong DevTools (F12)

const r3 = (v) => Math.round(v * 1000) / 1000;
// Góc gửi lên server = góc nhìn + giật tâm ngắm, nên đạn bay đúng chỗ tâm ngắm đang chỉ.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pose = () => ({
  x: r3(controller.x), y: r3(controller.y), z: r3(controller.z), c: controller.crouching ? 1 : 0,
  yaw: r3(controller.yaw + punch.yaw), pitch: r3(clamp(controller.pitch + punch.pitch, -1.55, 1.55)),
});

// ---------------------------------------------------------------
// Khởi tạo menu
// ---------------------------------------------------------------
ui.el.nick.value = store.get('nick', '');
// Hai kiểu máy chủ, mỗi kiểu nhớ địa chỉ riêng: Render (online) hoặc 1 IP mạng nội bộ.
const MODES = {
  render: { label: 'Địa chỉ server Render', ph: 'wss://ten-server.onrender.com', def: DEFAULT_SERVER, hint: 'Chủ phòng và người chơi dùng chung địa chỉ này (chơi qua Internet).' },
  lan: { label: 'IP máy làm server', ph: '192.168.1.10', def: '', hint: 'Nhập IP của máy đang chạy server (cổng 8080 tự thêm). Mọi người phải cùng mạng Wi-Fi/LAN.' },
};
S.mode = store.get('mode', 'render') === 'lan' ? 'lan' : 'render';
function applyMode(save) {
  const m = MODES[S.mode];
  ui.el.serverMode.value = S.mode;
  ui.el.serverLabel.textContent = m.label;
  ui.el.serverUrl.placeholder = m.ph;
  ui.el.serverHint.textContent = m.hint;
  ui.el.serverUrl.value = store.get('server_' + S.mode, m.def);
  if (save) store.set('mode', S.mode);
}
applyMode(false);
ui.el.serverMode.addEventListener('change', () => {
  store.set('server_' + S.mode, ui.el.serverUrl.value.trim());
  S.mode = ui.el.serverMode.value === 'lan' ? 'lan' : 'render';
  applyMode(true);
});
ui.el.sens.value = store.get('sens', '1');
S.sens = parseFloat(ui.el.sens.value) || 1;
document.getElementById('sensVal').textContent = S.sens.toFixed(1);
// ---------------------------------------------------------------
// Cài đặt đồ họa (0.4): preset, Auto theo FPS mục tiêu, Render Scale, hiển thị
// ---------------------------------------------------------------
const host = window.hachihiHost || null; // có khi chạy trong Electron (bản cài Windows)
S.display = { width: window.screen.width, height: window.screen.height, scaleFactor: window.devicePixelRatio || 1, refreshRate: 0, hasHost: !!host };
S.refreshHz = 0;
S.capMs = 0;
S.benchText = '';
S.enterAt = 0;
S.loadMs = 0;
const gpuName = world.gpuName();
const gpuTierNow = GS.gpuTier(gpuName);
console.info('[gfx] card đồ họa:', gpuName || '(không rõ)', '· hạng', gpuTierNow);
const auto = new AutoQuality({ startRung: GS.START_RUNG_BY_TIER[gpuTierNow] });
const bench = new Bench();
const refreshDeltas = [];

// Environment FX: cài đặt riêng (localStorage 'hachihi.envfx'), tự giảm theo FPS có hysteresis (envlogic.EnvQuality).
let envSet = loadEnvSettings();
const envq = new EnvQuality();
world.weather.onThunder = (vol) => audio.thunder(vol);
world.weather.onRainLevel = (l) => audio.setRain(l);
world.weather.setSettings(envSet);
const envPanel = new EnvFxPanel({
  get: () => envSet,
  onChange: (next) => {
    envSet = next;
    saveEnvSettings(envSet);
    world.weather.setSettings(envSet);
    if (!envSet.adaptive) { envq.level = 0; world.weather.setAdaptiveLevel(0); }
    world.applyAmbient();
  },
  status: () => ({ type: world.weather.cur.type, rain: world.weather.cur.rain, level: envq.level, mapId: world.mapId }),
});
void envPanel;

// Thời tiết đồng bộ không cần giao thức mới: mọi người trong phòng cùng (pin phòng, bản đồ, số vòng) => cùng seed => cùng thời tiết.
function syncWeather(round) {
  if (!round) return;
  const key = `${S.room ? S.room.pin : ''}|${world.mapId}|${round}`;
  if (key === S.wxKey) return;
  S.wxKey = key;
  world.weather.setSeed(weatherSeed(S.room ? S.room.pin : '', world.mapId, round));
}
function clearWeather() {
  S.wxKey = '';
  world.weather.setClear(true);
}

function loadGfx() {
  try {
    const raw = localStorage.getItem('hachihi.gfx');
    if (raw) return GS.sanitize(JSON.parse(raw));
  } catch { /* dữ liệu hỏng: dùng mặc định */ }
  const old = store.get('quality', 'auto'); // chuyển từ bản cũ
  return GS.withPreset(GS.sanitize({}), ['low', 'medium', 'high'].includes(old) ? old : 'auto');
}
let gset = loadGfx();
function saveGfx() {
  try { localStorage.setItem('hachihi.gfx', JSON.stringify(gset)); } catch { /* bỏ qua */ }
}
const gfxEff = () => GS.effective(gset, auto.rung);
const PRESET_LABEL = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra', custom: 'Custom' };

function updateGfxSummary() {
  ui.el.gfxSummary.textContent = `${PRESET_LABEL[gset.preset]} · Render ${gset.renderScale}%` + (gset.fpsLimit ? ` · ${gset.fpsLimit} FPS` : '');
}

function applyGfx() {
  world.applyGfx(gfxEff());
  auto.setTarget(GS.targetFps(gset, S.refreshHz));
  S.capMs = gset.fpsLimit > 0 ? 1000 / gset.fpsLimit : 0;
  ui.setStatsVisible(gset.showFps || ui.statsVisible());
  frameStats.reset();
  auto.reset(performance.now());
  envq.reset(performance.now());
  envq.setTarget(GS.targetFps(gset, S.refreshHz));
  updateGfxSummary();
}

async function applyDisplay(next) {
  if (host) return host.applyDisplay({ displayMode: next.displayMode, resolution: next.resolution, vsync: next.vsync });
  // Trình duyệt: chỉ chuyển toàn màn hình; độ phân giải/V-Sync do trình duyệt quyết định.
  try {
    if (next.displayMode === 'windowed') {
      if (document.fullscreenElement) await document.exitFullscreen();
    } else if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch { /* người dùng từ chối */ }
  return { changed: false };
}

async function onApplyGfx(draft) {
  const displayChanged = draft.displayMode !== gset.displayMode || draft.resolution !== gset.resolution || draft.vsync !== gset.vsync;
  const prevShow = gset.showFps;
  gset = draft;
  if (prevShow && !gset.showFps) ui.setStatsVisible(false);
  saveGfx();
  applyGfx();
  if (gset.showFps) ui.setStatsVisible(true);
  if (displayChanged) await applyDisplay(draft); // Electron: cửa sổ được dựng lại, hộp xác nhận hiện sau khi nạp lại
}

const settingsPanel = new SettingsPanel({
  getSettings: () => gset,
  onApply: onApplyGfx,
  getDisplay: () => S.display,
  getAutoEff: () => GS.effective({ ...gset, preset: 'auto' }, auto.rung),
});
ui.el.btnGfx.addEventListener('click', () => settingsPanel.open('gfx'));

// Phím điều khiển (tab trong Cài đặt): đổi phím được, lưu trong localStorage.
const keybinds = new Keybinds(store);
const keysPanel = new KeysPanel(document.getElementById('keysBody'), keybinds);
const syncKeyLabels = () => { shop.keyLabel = keybinds.label('shop'); };
keybinds.onChange(syncKeyLabels);
syncKeyLabels();
settingsPanel.onTab = (tab) => {
  if (tab === 'keys') keysPanel.render();
  else keysPanel.stop();
  controller.clearKeys(); // mở/đóng cài đặt: nhả hết phím đang giữ để nhân vật không tự chạy
};
document.getElementById('btnKeys').addEventListener('click', () => settingsPanel.open('keys'));
document.getElementById('btnKeysGame').addEventListener('click', (e) => {
  e.stopPropagation(); // không kích hoạt "nhấp để vào trận"
  settingsPanel.open('keys');
});
Object.assign(window.__hachihi, { auto, bench, settingsPanel, getSettings: () => gset });

// Hộp xác nhận đổi chế độ hiển thị: tự khôi phục sau 15 giây nếu không bấm "Giữ".
let confirmTimer = 0;
function showDisplayConfirm(pending) {
  const box = document.getElementById('dispConfirm');
  const cnt = document.getElementById('dispCount');
  box.classList.remove('hidden');
  const tick = () => {
    const left = Math.max(0, Math.ceil((pending.deadline - Date.now()) / 1000 - 1));
    cnt.textContent = String(Math.min(left, 15));
    if (left <= 0) undo();
  };
  const done = () => { clearInterval(confirmTimer); box.classList.add('hidden'); };
  const undo = async () => {
    done();
    if (!host) return;
    // Ghi lại cài đặt hiển thị cũ trước, vì cửa sổ sẽ được dựng lại ngay.
    if (pending.prev) {
      gset = GS.sanitize({ ...gset, ...pending.prev });
      saveGfx();
    }
    await host.revertDisplay();
  };
  document.getElementById('dispKeep').onclick = async () => { done(); if (host) await host.confirmDisplay(); };
  document.getElementById('dispUndo').onclick = undo;
  clearInterval(confirmTimer);
  confirmTimer = setInterval(tick, 500);
  tick();
}

(async () => {
  if (host) {
    try {
      const info = await host.getDisplay();
      S.display = { width: info.width, height: info.height, scaleFactor: info.scaleFactor, refreshRate: info.refreshRate, hasHost: true };
      if (info.refreshRate) S.refreshHz = info.refreshRate;
      // Electron giữ cài đặt hiển thị thật; lấy làm chuẩn để không lệch với localStorage.
      gset = GS.sanitize({ ...gset, displayMode: info.displayMode, resolution: info.resolution, vsync: info.vsync });
      saveGfx();
      applyGfx();
      if (info.pending) showDisplayConfirm(info.pending);
    } catch { /* bỏ qua */ }
  }
})();
applyGfx();
ui.showScreen('menu');

ui.el.sens.addEventListener('input', () => {
  S.sens = parseFloat(ui.el.sens.value) || 1;
  document.getElementById('sensVal').textContent = S.sens.toFixed(1);
  store.set('sens', String(S.sens));
});

function normalizeUrl(raw) {
  let u = (raw || '').trim();
  if (S.mode === 'lan') {
    if (!u) u = 'localhost';
    u = u.replace(/^(wss?|https?):\/\//i, '').replace(/\/+$/, '');
    if (!/:\d+$/.test(u)) u += ':8080';
    return 'ws://' + u;
  }
  if (!u) return DEFAULT_SERVER;
  u = u.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
  if (!/^wss?:\/\//i.test(u)) {
    const local = /^(localhost|127\.|192\.168\.|10\.)/i.test(u);
    u = (local ? 'ws://' : 'wss://') + u;
  }
  return u.replace(/\/+$/, '');
}

async function connectThen(message) {
  const nick = ui.el.nick.value.trim();
  if (nick.length < 2) {
    ui.setMenuStatus('Nickname cần ít nhất 2 ký tự.', 'err');
    return;
  }
  if (message.t === 'join' && !/^\d{4}$/.test(ui.el.pin.value.trim())) {
    ui.setMenuStatus('Mã PIN gồm đúng 4 chữ số.', 'err');
    return;
  }
  const url = normalizeUrl(ui.el.serverUrl.value);
  ui.el.serverUrl.value = url;
  store.set('mode', S.mode);
  store.set('server_' + S.mode, url);
  store.set('nick', nick);
  store.set('server', url);
  S.serverUrl = url;
  audio.init();

  ui.setBusy(true);
  ui.setMenuStatus('Đang kết nối tới server...');
  if (!net.open) {
    try {
      await net.connect(url, {
        totalMs: CONNECT_TIMEOUT_MS,
        onTick: ({ elapsed }) => {
          if (elapsed < 4000) return;
          ui.setMenuStatus(
            `Server miễn phí có thể đang ngủ, đang đánh thức... (${Math.round(elapsed / 1000)}s, thường mất 30–60s lần đầu)`
          );
        },
      });
    } catch (e) {
      ui.setBusy(false);
      if (e && e.message === 'cancelled') ui.setMenuStatus('Đã huỷ kết nối.');
      else if (e && e.name === 'SyntaxError') ui.setMenuStatus('Địa chỉ server không hợp lệ.', 'err');
      else ui.setMenuStatus('Không kết nối được server. Kiểm tra địa chỉ và thử lại.', 'err');
      return;
    }
  }
  ui.setMenuStatus('Đã kết nối, đang vào phòng...');
  net.send({ ...message, name: nick });
}

ui.el.btnCreate.addEventListener('click', () => connectThen({ t: 'create' }));
ui.el.btnJoin.addEventListener('click', () => connectThen({ t: 'join', pin: ui.el.pin.value.trim() }));
ui.el.pin.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ui.el.btnJoin.click();
});
ui.el.pin.addEventListener('input', () => {
  ui.el.pin.value = ui.el.pin.value.replace(/\D/g, '').slice(0, 4);
});
ui.el.btnCancel.addEventListener('click', () => {
  net.cancel();
  ui.setBusy(false);
  ui.setMenuStatus('Đã huỷ kết nối.');
});

// Phòng chờ
ui.el.joinA.addEventListener('click', () => net.send({ t: 'team', team: 'A' }));
ui.el.joinB.addEventListener('click', () => net.send({ t: 'team', team: 'B' }));
ui.el.btnStart.addEventListener('click', () => net.send({ t: 'start' }));
ui.el.btnLeave.addEventListener('click', () => {
  net.send({ t: 'leave' });
  backToMenu('');
});
// Rời phòng ngay trong trận (người cuối cùng tự quyết định thoát)
document.getElementById('btnLeaveGame').addEventListener('click', (e) => {
  e.stopPropagation(); // không kích hoạt "nhấp để vào trận"
  net.send({ t: 'leave' });
  backToMenu('');
});
net.on('notice', (m) => ui.banner(m.msg || '', '', '', 4500));

// Mua đồ, thưởng tiền, lựu đạn, bom khói
net.on('bought', () => audio.buy());
net.on('buyerr', (m) => shop.toast(m.msg || 'Không mua được.', 'err'));
net.on('reward', (m) => {
  shop.toast(m.kind === 'win' ? `THẮNG VÒNG +$${m.amount}` + (m.streak > 1 ? ` (chuỗi ${m.streak})` : '') : `Tiền bù +$${m.amount}`, m.kind);
  audio.reward();
});
net.on('throw', (m) => {
  if (S.screen === 'game') audio.throwNade(m.id === S.me.id);
});
net.on('boom', (m) => {
  if (S.screen !== 'game') return;
  const cam = world.camera;
  const dx = m.p[0] - cam.position.x;
  const dz = m.p[2] - cam.position.z;
  world.gren.boom(m.p);
  world.decals.scorch(m.p);
  audio.boom(dx, dz, cam.rotation.y);
  const d = Math.hypot(dx, dz);
  S.shake = Math.max(S.shake || 0, Math.max(0, 1 - d / 22)); // rung màn hình theo khoảng cách
});
net.on('smoke', (m) => {
  if (S.screen !== 'game') return;
  const cam = world.camera;
  world.gren.smoke(m.id, m.p, m.ms);
  audio.smokePop(m.p[0] - cam.position.x, m.p[2] - cam.position.z, cam.rotation.y);
});

// Máy chơi chung: chủ phòng thêm/xoá máy, chuyển đội (nút trong danh sách đội)
document.getElementById('lobby').addEventListener('click', (e) => {
  const add = e.target.closest('.addBotBtn');
  if (add) {
    const lvl = Number(add.parentElement.querySelector('.botLevel').value);
    net.send({ t: 'addbot', team: add.dataset.team, level: lvl });
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const id = Number(b.dataset.id);
  if (b.dataset.act === 'remove') net.send({ t: 'removebot', id });
  else if (b.dataset.act === 'move') net.send({ t: 'moveto', id, team: b.dataset.team });
});

// Tuỳ chọn phòng (chủ phòng)
const sendSettings = () => net.send({ t: 'settings', economy: ui.el.optEconomy.checked, rounds: Number(ui.el.optRounds.value), map: ui.el.optMap.value });
ui.el.optEconomy.addEventListener('change', sendSettings);
ui.el.optRounds.addEventListener('change', sendSettings);
ui.el.optMap.addEventListener('change', sendSettings);

// ---------------------------------------------------------------
// Chuyển màn hình
// ---------------------------------------------------------------
function enterGame() {
  if (S.screen === 'game') return;
  S.screen = 'game';
  ui.showScreen('game');
  ui.showClickPlay(!S.locked);
  controller.clearKeys();
  S.mouseDown = false;
  world.clearRemotes();
  world.clearEffects();
  S.enterAt = performance.now();
  world.warmup(vm.scene, vm.camera); // biên dịch shader trước để không khựng lần vẽ đầu
  auto.reset(performance.now());
  envq.reset(performance.now());
  ui.setAmmo(S.self);
  ui.setHp(S.self.hp);
}

function leaveGame() {
  if (S.screen !== 'game') return;
  S.screen = 'lobby';
  if (document.pointerLockElement) document.exitPointerLock();
  S.locked = false;
  S.mouseDown = false;
  S.self = blankSelf();
  S.round = blankRound();
  controller.clearKeys();
  world.clearRemotes();
  world.clearEffects();
  clearWeather();
  ui.hideBanner();
  ui.setSpectate('');
  ui.showScreen('lobby');
  ui.renderLobby(S.room, S.me.id, net.rtt);
  ui.setLobbyMsg('');
}

function backToMenu(msg, kind) {
  S.scoped = false; S.zoomT = 0; S.nadeAim = null;
  world.setFov(BASE_FOV);
  scopeUi.setZoom(0);
  scopeUi.setNadeHint('');
  world.gren.hidePath();
  net.close();
  S.me = { id: 0, team: null, token: '', pin: '', host: false };
  S.room = null;
  S.roster = new Map();
  S.reconnecting = false;
  S.round = blankRound();
  S.self = blankSelf();
  S.camSet = false;
  if (document.pointerLockElement) document.exitPointerLock();
  S.locked = false;
  S.mouseDown = false;
  controller.clearKeys();
  world.clearRemotes();
  world.clearEffects();
  clearWeather();
  ui.hideBanner();
  ui.setSpectate('');
  S.screen = 'menu';
  ui.showScreen('menu');
  ui.setBusy(false);
  ui.setMenuStatus(msg || '', kind || '');
}

// ---------------------------------------------------------------
// Tin nhắn từ server
// ---------------------------------------------------------------
net.on('joined', (m) => {
  applyServerWeapons(m.weapons, m.gear);
  if (m.interpMs) world.interpDelay = m.interpMs;
  S.settings = m.settings || S.settings;
  if (m.maps) fillMapSelect(m.maps);
  if (S.settings) applyMap(S.settings.map);
  const wasReconnect = S.reconnecting;
  S.reconnecting = false;
  S.me.id = m.id;
  S.me.token = m.token;
  S.me.pin = m.pin;
  ui.setBusy(false);
  ui.setMenuStatus('');
  if (S.screen === 'menu') {
    S.screen = 'lobby';
    ui.showScreen('lobby');
  }
  if (wasReconnect) {
    ui.hideBanner();
    ui.setLobbyMsg('Đã kết nối lại.', 'ok');
  } else {
    ui.setLobbyMsg('');
  }
});

net.on('room', (m) => {
  S.room = m;
  if (m.settings) {
    S.settings = m.settings;
    applyMap(m.settings.map);
  }
  const roster = new Map();
  for (const p of m.players) roster.set(p.id, p);
  S.roster = roster;
  world.setRoster(roster);
  const me = roster.get(S.me.id);
  if (me) S.me.team = me.team;
  S.me.host = m.host === S.me.id;

  if (m.phase === 'lobby') {
    if (S.screen === 'game') leaveGame();
    if (S.screen === 'lobby') ui.renderLobby(m, S.me.id, net.rtt);
    return;
  }
  if (S.screen === 'lobby') enterGame();
  let a = 0;
  let b = 0;
  for (const p of m.players) if (p.alive) (p.team === 'A' ? a++ : b++);
  ui.setAlive(a, b);
  ui.setScore(m.scoreA, m.scoreB);
  if (!ui.el.scoreboard.classList.contains('hidden')) ui.renderScoreboard(m, S.me.id);
});

net.on('spawn', (m) => {
  enterGame();
  controller.setPosition(m.x, m.y, m.z, m.yaw);
  controller.pitch = 0;
  punch.reset();
  S.spray = 0;
  stepper.reset();
  S.camSet = true;
  S.specIdx = 0;
});

net.on('self', (m) => {
  const prev = S.self;
  S.self = {
    hp: m.hp, alive: !!m.alive, weapon: m.weapon, reloading: !!m.reloading, ammo: m.ammo,
    money: m.money || 0, armor: m.armor || 0, owned: m.owned || ['pistol'], nades: m.nades || [0, 0],
  };
  shop.update(S.self, economyOn());
  if (!S.self.alive) shop.setOpen(false);
  // Ra khỏi ống ngắm khi chết, thay đạn hoặc đổi sang súng không có ống ngắm; huỷ canh ném khi chết
  if (S.scoped && (!S.self.alive || S.self.reloading || !(WEAPONS[S.self.weapon].scope || WEAPONS[S.self.weapon].ads))) setScoped(false);
  if (S.nadeAim && !S.self.alive) cancelNadeAim();
  if (S.self.weapon !== vm.current) vm.setWeapon(S.self.weapon);
  if (S.self.reloading && !prev.reloading && WEAPONS[m.weapon]) audio.reload(WEAPONS[m.weapon].reloadMs, m.weapon);
  vm.setReloading(S.self.reloading);
  ui.setHp(S.self.hp);
  ui.setAmmo(S.self);
  if (prev.alive && !S.self.alive) {
    S.mouseDown = false;
    punch.reset();
    ui.banner('BẠN ĐÃ BỊ HẠ', '', '', 1800);
  }
});

net.on('round', (m) => {
  S.round = {
    phase: m.phase, round: m.round, scoreA: m.scoreA, scoreB: m.scoreB,
    endAt: performance.now() + m.msLeft, winner: m.winner, matchWinner: m.matchWinner, toWin: m.toWin,
  };
  if (m.phase === 'lobby') return;
  enterGame();
  syncWeather(m.round);
  ui.setScore(m.scoreA, m.scoreB);
  ui.setRoundLabel(`VÒNG ${m.round} · THẮNG ${m.toWin}`);
  const cls = (t) => (t === 'A' ? 'red' : t === 'B' ? 'blue' : '');
  switch (m.phase) {
    case 'freeze':
      ui.banner(`VÒNG ${m.round}`, 'Chuẩn bị...', '', Math.max(1500, m.msLeft));
      audio.beep(660, 0.1);
      break;
    case 'live':
      ui.banner('BẮT ĐẦU!', '', '', 1200);
      audio.beep(990, 0.18);
      break;
    case 'roundEnd':
      ui.banner(m.winner ? `${TEAM_NAMES[m.winner]} THẮNG VÒNG` : 'HOÀ VÒNG NÀY', '', cls(m.winner), Math.max(2000, m.msLeft));
      break;
    case 'matchEnd':
      ui.banner(`${TEAM_NAMES[m.matchWinner] || ''} THẮNG TRẬN`, 'Quay về phòng chờ sau giây lát...', cls(m.matchWinner), 0);
      break;
    default:
      break;
  }
});

net.on('snap', (m) => {
  if (S.screen === 'game') {
    world.applySnapshot(m.p, m.ts, performance.now(), S.me.id, S.me.team);
    world.gren.setNades(m.g);
  }
});

net.on('shot', (m) => {
  if (S.screen !== 'game') return;
  const cam = world.camera;
  if (m.id === S.me.id) {
    // Vệt đạn của mình: bắt đầu từ nòng súng cầm trên tay.
    const y = controller.yaw;
    const p = controller.pitch;
    const cp = Math.cos(p);
    const fx = -Math.sin(y) * cp;
    const fy = Math.sin(p);
    const fz = -Math.cos(y) * cp;
    const rx = Math.cos(y);
    const rz = -Math.sin(y);
    const from = [
      controller.x + fx * 0.7 + rx * 0.16,
      controller.y + controller.eye + fy * 0.7 - 0.14,
      controller.z + fz * 0.7 + rz * 0.16,
    ];
    world.addTracer(from, m.to, 0xffd98a, m.h);
  } else {
    world.addTracer([m.from[0], m.from[1] - 0.25, m.from[2]], m.to, 0xffd98a, m.h);
    world.muzzleFlash([m.from[0], m.from[1] - 0.2, m.from[2]], 0.5);
    audio.shotAt(m.w, m.from[0] - cam.position.x, m.from[2] - cam.position.z, cam.rotation.y);
  }
});

net.on('hit', (m) => {
  ui.hitmarker(m.kill, m.head);
  ui.damagePop(m.dmg, m.head);
  audio.hit(m.kill, m.head);
});

net.on('hurt', (m) => {
  S.self.hp = m.hp;
  ui.setHp(m.hp);
  ui.vignette();
  audio.hurt();
  // Chỉ hướng kẻ bắn: góc của kẻ bắn so với hướng đang nhìn (forward ở yaw=0 là -Z).
  if (typeof m.fx === 'number' && typeof m.fz === 'number') {
    const bearing = Math.atan2(-(m.fx - controller.x), -(m.fz - controller.z));
    ui.damageIndicator(bearing - controller.yaw);
  }
});

net.on('kill', (m) => {
  const k = S.roster.get(m.k);
  const v = S.roster.get(m.v);
  if (k && v) ui.killfeed(k, v, WEAPONS[m.w] ? WEAPONS[m.w].name : '', m.head, S.me.id);
});

net.on('correct', (m) => {
  controller.correct(m.x, m.y, m.z); // làm mượt thay vì giật camera về chỗ cũ
});

net.on('rtt', (rtt) => {
  if (S.screen === 'game') ui.setPing(rtt);
  else if (S.screen === 'lobby') ui.renderLobby(S.room, S.me.id, rtt);
});

net.on('err', (m) => {
  if (m.code === 'norejoin') {
    backToMenu(m.msg, 'err');
    return;
  }
  if (S.screen === 'menu') {
    ui.setBusy(false);
    ui.setMenuStatus(m.msg, 'err');
  } else if (S.screen === 'lobby') {
    ui.setLobbyMsg(m.msg, 'err');
  } else {
    ui.banner(m.msg, '', '', 2000);
  }
});

// Mất kết nối: tự kết nối lại và vào lại phòng bằng token (server giữ chỗ 30 giây).
async function reconnect() {
  if (S.reconnecting) return;
  S.reconnecting = true;
  ui.banner('MẤT KẾT NỐI', 'Đang kết nối lại...', '', 0);
  ui.setLobbyMsg('Mất kết nối — đang kết nối lại...', 'err');
  try {
    await net.connect(S.serverUrl, { totalMs: 30000 });
    net.send({ t: 'rejoin', pin: S.me.pin, token: S.me.token });
  } catch {
    backToMenu('Mất kết nối với server, không thể vào lại phòng.', 'err');
  }
}

net.on('disconnect', () => {
  if (S.me.token) {
    reconnect();
  } else {
    ui.setBusy(false);
    ui.setMenuStatus('Mất kết nối với server.', 'err');
  }
});

// ---------------------------------------------------------------
// Điều khiển: bàn phím, chuột
// ---------------------------------------------------------------
// Phím di chuyển/hành động lấy từ `keybinds` (ui/keybinds.js), người chơi đổi được trong Cài đặt → Phím điều khiển.

function lockPointer() {
  audio.init();
  try {
    const p = world.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* bỏ qua */ }
}

ui.el.clickplay.addEventListener('click', lockPointer);

document.addEventListener('pointerlockchange', () => {
  S.locked = document.pointerLockElement === world.canvas;
  if (S.screen === 'game') ui.showClickPlay(!S.locked);
  if (!S.locked) {
    S.mouseDown = false;
    controller.clearKeys();
  }
});

document.addEventListener('mousemove', (e) => {
  if (S.locked && S.screen === 'game' && S.self.alive) {
    controller.look(e.movementX, e.movementY, 0.0022 * S.sens * zoomScale());
    vm.look(e.movementX, e.movementY);
  }
});

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || S.screen !== 'game' || !S.locked) return;
  if (!S.self.alive) {
    S.specIdx++;
    return;
  }
  S.mouseDown = true;
});

// Chuột phải: vào/ra ống ngắm (súng bắn tỉa) hoặc huỷ canh ném lựu đạn
window.addEventListener('mousedown', (e) => {
  if (e.button !== 2 || S.screen !== 'game' || !S.locked || !S.self.alive) return;
  if (S.nadeAim) { cancelNadeAim(); return; }
  setScoped(!S.scoped);
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  S.mouseDown = false;
  S.fireLatched = false;
  S.emptyClicked = false;
});

window.addEventListener('wheel', (e) => {
  if (!S.locked || S.screen !== 'game' || !S.self.alive) return;
  const list = WEAPON_ORDER.filter((id) => (S.self.owned || []).includes(id));
  if (list.length < 2) return;
  const i = list.indexOf(S.self.weapon);
  const n = (i + (e.deltaY > 0 ? 1 : -1) + list.length) % list.length;
  selectWeapon(list[n]);
});

window.addEventListener('keydown', (e) => {
  if (S.screen !== 'game') return;
  if (settingsPanel.isOpen) return; // đang mở Cài đặt/Phím điều khiển: không điều khiển nhân vật
  const act = keybinds.actionFor(e.code);
  const flag = act && MOVE_FLAGS[act];
  if (flag) {
    controller.keys[flag] = true;
    e.preventDefault();
    return;
  }
  if (act === 'scoreboard') {
    e.preventDefault();
    ui.showScoreboard(true, S.room, S.me.id);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'F3') {
    e.preventDefault();
    ui.toggleStats();
    return;
  }
  if (e.code === 'F4') {
    e.preventDefault();
    if (bench.active) bench.active = false;
    else {
      ui.setStatsVisible(true);
      S.benchText = '';
      bench.start(performance.now(), 20000);
    }
    return;
  }
  if (shop.handleKey(e.code)) {
    e.preventDefault();
    return;
  }
  if (act === 'reload') {
    doReload();
  } else if (act === 'shop') {
    e.preventDefault();
    // Luôn có phản hồi: mở menu, hoặc báo lý do không mở được (trước đây im lặng nên tưởng phím hỏng).
    if (!economyOn()) {
      shop.setOpen(false);
      shop.toast('Phòng này đang tắt chế độ tiền nên không có menu mua đồ.', 'err');
    } else if (!S.self.alive) {
      shop.setOpen(false);
      shop.toast('Bạn đã chết, chưa mua đồ được.', 'err');
    } else {
      shop.toggle();
    }
  } else if (act === 'frag' || act === 'smoke') {
    // Giữ phím để canh hướng (có đường quỹ đạo), thả phím để ném
    startNadeAim(act);
  } else if (act === 'weapon1' || act === 'weapon2') {
    const id = weaponForKey(S.self.owned, act === 'weapon1' ? '1' : '2');
    if (id) selectWeapon(id);
  }
});

window.addEventListener('keyup', (e) => {
  const act = keybinds.actionFor(e.code);
  const flag = act && MOVE_FLAGS[act];
  if (flag) controller.keys[flag] = false;
  if (act === 'scoreboard') {
    e.preventDefault();
    ui.showScoreboard(false);
  }
  if ((act === 'frag' && S.nadeAim === 'frag') || (act === 'smoke' && S.nadeAim === 'smoke')) releaseNade();
});
window.addEventListener('blur', () => cancelNadeAim());

window.addEventListener('blur', () => {
  controller.clearKeys();
  S.mouseDown = false;
  ui.showScoreboard(false);
});

document.addEventListener('contextmenu', (e) => e.preventDefault());

function selectWeapon(id) {
  if (!S.self.alive || id === S.self.weapon || !(S.self.owned || []).includes(id)) return;
  setScoped(false);
  S.self.weapon = id;
  S.self.reloading = false;
  vm.setWeapon(id);
  vm.setReloading(false);
  S.nextFireAt = performance.now() + 250;
  net.send({ t: 'weapon', w: id });
  ui.setAmmo(S.self);
}

// ---- ống ngắm và canh ném ----
const zoomScale = () => Math.tan(((BASE_FOV + (S.zoomFov - BASE_FOV) * S.zoomT) * Math.PI) / 360) / Math.tan((BASE_FOV * Math.PI) / 360);

function setScoped(on) {
  const def = WEAPONS[S.self.weapon];
  if (on && !(def && (def.scope || def.ads))) return;
  if (S.scoped === on) return;
  if (on) { // nhớ loại nhắm và góc nhìn đích để chuyển mượt cả lúc thoát
    S.zoomScope = !!def.scope;
    S.zoomFov = def.scope ? SCOPE_FOV : def.ads;
  }
  S.scoped = on;
  net.send({ t: 'scope', on });
  audio.scope(on);
}

const nadeIdx = (k) => (k === 'frag' ? 0 : 1);
function startNadeAim(kind) {
  if (S.screen !== 'game' || !S.locked || !S.self.alive || S.round.phase !== 'live' || S.nadeAim) return;
  if (!((S.self.nades || [])[nadeIdx(kind)] > 0)) {
    shop.toast(kind === 'frag' ? 'Bạn không có lựu đạn.' : 'Bạn không có bom khói.', 'err');
    return;
  }
  setScoped(false);
  S.nadeAim = kind;
}
function cancelNadeAim() {
  if (!S.nadeAim) return;
  S.nadeAim = null;
  world.gren.hidePath();
  scopeUi.setNadeHint('');
}
function releaseNade() {
  const kind = S.nadeAim;
  if (!kind) return;
  net.send({ t: 'throw', kind, ...pose() });
  cancelNadeAim();
}
// Mỗi khung hình khi đang giữ phím: tính quỹ đạo bằng đúng vật lý của server (có cả đà chạy/nhảy) rồi vẽ.
function updateNadeAim() {
  const kind = S.nadeAim;
  if (!kind) return;
  if (!S.self.alive || S.round.phase !== 'live' || !((S.self.nades || [])[nadeIdx(kind)] > 0)) { cancelNadeAim(); return; }
  const p = pose();
  const cp = Math.cos(p.pitch);
  const dir = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  const tp = throwParams({ x: p.x, y: p.y, z: p.z }, controller.eye, dir, { vx: controller.vx, vy: controller.vy, vz: controller.vz });
  const sim = simulateNade(tp.origin, tp.vel, world.boxes, 200, kind === 'smoke' ? 1.4 : NADE.fuseMs / 1000);
  world.gren.showPath(sim.pts, kind);
  scopeUi.setNadeHint(kind === 'frag'
    ? 'LỰU ĐẠN: thả phím G để ném · nhảy/chạy để ném xa hơn · chuột phải: huỷ'
    : 'BOM KHÓI: thả phím H để ném · nhảy/chạy để ném xa hơn · chuột phải: huỷ');
}

function doReload() {
  if (!S.self.alive || S.self.reloading) return;
  const def = WEAPONS[S.self.weapon];
  const a = S.self.ammo[S.self.weapon];
  if (a[0] >= def.mag || a[1] <= 0) return;
  net.send({ t: 'reload' });
}

function tryFire(now) {
  if (S.nadeAim) return; // đang canh ném lựu đạn: không bắn
  if (!S.mouseDown || !S.locked || !S.self.alive || S.round.phase !== 'live') return;
  if (S.self.reloading || now < S.nextFireAt) return;
  const def = WEAPONS[S.self.weapon];
  if (!def.auto && S.fireLatched) return;
  const a = S.self.ammo[S.self.weapon];
  S.fireLatched = true;
  if (a[0] <= 0) {
    if (!S.emptyClicked) {
      S.emptyClicked = true;
      audio.empty();
      net.send({ t: 'reload' });
    }
    return;
  }
  // Phản hồi tức thì ở client (đạn, âm thanh, giật); server vẫn là bên quyết định trúng/trượt.
  a[0]--;
  S.nextFireAt = now + def.interval;
  net.send({ t: 'shoot', ...pose() }); // gửi TRƯỚC khi áp giật của chính phát này (giật ảnh hưởng phát sau)
  const rc = punch.kick(def.id, now / 1000);
  vm.kick(rc.gunKick);
  {
    world.camera.updateMatrixWorld(true);
    vm.update(0, controller.speed, controller.grounded);
    vm.muzzleWorld(world.camera, _mz);
    world.muzzleFlash([_mz.x, _mz.y, _mz.z], def.id === 'shotgun' ? 1.3 : 1);
    vm.ejectWorld(world.camera, _ej);
    const yw = controller.yaw;
    world.fx.casing([_ej.x, _ej.y, _ej.z], [Math.cos(yw), 0, -Math.sin(yw)], [0, 1, 0]);
  }
  audio.shot(def.id, 0.9, 0);
  ui.setAmmo(S.self);

  // Ước lượng tản đạn để tâm ngắm nở ra giống server: giảm dần khi nghỉ, tăng mỗi phát.
  const idle = S.lastShotMs ? now - S.lastShotMs : 1e9;
  S.spray = Math.max(0, S.spray - idle / (def.interval * 3));
  S.spray = Math.min(S.spray + 1, def.sprayMax);
  S.lastShotMs = now;
}

// ---------------------------------------------------------------
// Tâm ngắm nở ra theo tốc độ, nhảy và xả đạn
// ---------------------------------------------------------------
function updateCrosshair(now) {
  const def = WEAPONS[S.self.weapon];
  const idle = S.lastShotMs ? now - S.lastShotMs : 1e9;
  const spray = Math.min(Math.max(0, S.spray - idle / (def.interval * 3)), def.sprayMax);
  const move = Math.min(controller.speed / 5.6, 1.2);
  const spread = spreadOf(def.id, move, !controller.grounded, spray);
  const pxPerRad = window.innerHeight * 0.651; // với FOV dọc 75°
  ui.setCrosshair(4 + spread * pxPerRad * 0.9);
}

// ---------------------------------------------------------------
// Thống kê FPS/ping (F3) và độ phân giải tự động
// ---------------------------------------------------------------
let statsAt = 0;
function updateStats(now) {
  if (!ui.statsVisible() || now - statsAt < 400) return;
  statsAt = now;
  const info = world.renderer.info;
  const r = summarize(Array.from(frameStats.buf.subarray(0, frameStats.n)));
  const cv = world.renderer.domElement;
  const f = (x, d = 1) => (x == null ? 'n/a' : x.toFixed(d));
  let txt = '';
  if (r) {
    txt +=
      `FPS ${f(r.avgFps, 0)}  (1% thấp ${f(r.low1, 0)})  mục tiêu ${auto.targetFps.toFixed(0)}\n` +
      `Frame time: TB ${f(1000 / r.avgFps)} · P50 ${f(r.p50)} · P95 ${f(r.p95)} · P99 ${f(r.p99)} ms\n`;
  }
  txt +=
    `Draw ${info.render.calls}  Tam giác ${info.render.triangles}\n` +
    `Ping ${net.rtt} ms  Jitter ${net.jitter.toFixed(1)} ms · Snapshot mỗi ${net.snapGap.toFixed(0)} ms\n` +
    `Đồ họa ${PRESET_LABEL[gset.preset]}${gset.preset === 'auto' ? ` (bậc ${auto.rung})` : ''} · Dựng ${cv.width}×${cv.height} (${(world.scale * 100).toFixed(0)}%)`;
  if (bench.active) txt += `\nBENCHMARK đang chạy ${(bench.progress(now) * 100).toFixed(0)}%...`;
  else if (S.benchText) txt += '\n' + S.benchText;
  ui.setStats(txt);
}

// F4: benchmark 20 giây ở góc nhìn hiện tại. Kết quả hiện trong bảng thống kê, ghi vào console và clipboard (JSON).
async function finishBench(now) {
  const r = bench.result;
  const info = world.renderer.info;
  const cv = world.renderer.domElement;
  const lines = [
    `Đồ họa ${PRESET_LABEL[gset.preset]} · Dựng ${cv.width}×${cv.height} · Draw ${info.render.calls} · Tam giác ${info.render.triangles}`,
    `Thời gian vào trận (tải + biên dịch shader): ${S.loadMs ? S.loadMs.toFixed(0) + ' ms' : 'n/a'}`,
  ];
  let m = null;
  if (host) {
    try {
      m = await host.getMetrics();
      lines.push(`CPU ${m.cpuPercent.toFixed(0)}% (tiến trình GPU ${m.gpuProcessCpuPercent.toFixed(0)}%) · RAM ${m.memoryMB.toFixed(0)} MB · VRAM: không đo được`);
    } catch { /* bỏ qua */ }
  } else lines.push('CPU/GPU/RAM/VRAM: chỉ đo được trong bản cài Windows (VRAM không có API tin cậy)');
  S.benchText = formatReport(r, { label: `(${(r.frames / 20).toFixed(0)} khung/s)`, lines });
  const json = JSON.stringify({ version: '0.4', preset: gset.preset, settings: gset, render: [cv.width, cv.height], ...r, calls: info.render.calls, tris: info.render.triangles, loadMs: S.loadMs, metrics: m });
  console.log('[benchmark]', json);
  try { await navigator.clipboard.writeText(json); } catch { /* không có quyền clipboard */ }
  void now;
}

// ---------------------------------------------------------------
// Vòng lặp game
// ---------------------------------------------------------------
function spectate() {
  const list = world.aliveRemotes();
  const mine = list.filter((r) => r.team === S.me.team);
  const pool = mine.length ? mine : list;
  if (pool.length) {
    const rp = pool[S.specIdx % pool.length];
    world.hiddenId = rp.id;
    world.setCamera(rp.group.position.x, rp.group.position.y + (rp.eyeH || EYE), rp.group.position.z, rp.group.rotation.y, rp.pitch);
    ui.setSpectate(`Đang theo dõi: ${rp.name} · nhấp chuột để đổi người`);
  } else {
    world.hiddenId = 0;
    ui.setSpectate('Chờ vòng sau...');
    if (!S.camSet) {
      world.setCamera(0, 14, 30, 0, -0.55); // góc nhìn tổng quan khi chưa có ai để theo dõi
      S.camSet = true;
    }
  }
}

function gameFrame(dt, now) {
  const phase = S.round.phase;
  if (S.self.alive) {
    // Vật lý chạy theo bước cố định (không phụ thuộc FPS), hình ảnh nội suy giữa 2 bước.
    controller.canMove = S.locked && phase !== 'freeze';
    S.alpha = stepper.advance(dt, (h) => controller.update(h));
    punch.update(dt, now / 1000);
    world.hiddenId = 0;
    const rp = controller.renderPos(S.alpha);
    S.shake = (S.shake || 0) * Math.exp(-4 * dt);
    const sh = S.shake > 0.01 ? S.shake * 0.02 : 0;
    world.setCamera(rp.x, rp.y + controller.eye, rp.z, controller.yaw + punch.yaw + (Math.random() - 0.5) * sh, clamp(controller.pitch + punch.pitch + (Math.random() - 0.5) * sh, -1.55, 1.55));
    audio.setListener(rp.x, rp.y, rp.z);

    try {
      // Thu phóng khi nhìn qua ống ngắm
      const zt = S.scoped ? 1 : 0;
      S.zoomT += (zt - S.zoomT) * Math.min(1, dt * 14);
      if (Math.abs(zt - S.zoomT) < 0.002) S.zoomT = zt;
      world.setFov(BASE_FOV + (S.zoomFov - BASE_FOV) * S.zoomT);
      scopeUi.setZoom(S.zoomScope ? S.zoomT : 0);
      vm.ads = S.zoomScope ? 0 : S.zoomT;
      ui.el.crosshair.style.display = S.zoomT > 0.3 ? 'none' : '';
      updateNadeAim();
    } catch (e) {
      fatal.once('frame-zoom', 'Lỗi ngắm/ném (đã bỏ qua để game tiếp tục chạy)', e);
    }

    if (now - S.lastSend >= 1000 / SEND_HZ) {
      S.lastSend = now;
      net.send({ t: 'move', ...pose() });
    }
    tryFire(now);
    vm.update(dt, controller.speed, controller.grounded);
    updateCrosshair(now);

    if (controller.grounded && controller.speed > 3) {
      S.stepT += dt;
      if (S.stepT > 0.4) {
        S.stepT = 0;
        audio.step();
      }
    }
    ui.setSpectate('');
  } else {
    spectate();
  }

  if (phase === 'freeze' || phase === 'live' || phase === 'roundEnd') ui.setTimer(S.round.endAt - now);
  else ui.setTimer(0);
}

// Tiếng bước chân đối thủ, nghe theo hướng nhìn hiện tại của camera.
world.onStep = (x, z) => {
  if (S.screen !== 'game') return;
  const cam = world.camera;
  audio.stepAt(x - cam.position.x, z - cam.position.z, cam.rotation.y);
};

let last = performance.now();
let lastBgFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // Mất focus (đang dùng ứng dụng khác): chỉ vẽ ~15 hình/giây để không chiếm GPU/CPU của máy.
  if (S.screen === 'game' && !document.hasFocus() && now - lastBgFrame < 66) return;
  lastBgFrame = now;
  const el = now - last;
  if (S.screen !== 'game') {
    last = now;
    stepper.reset();
    // Ước lượng tần số quét màn hình từ nhịp rAF khi chưa biết (trình duyệt hoặc Electron không báo).
    if (!S.refreshHz && refreshDeltas.length < 150) {
      refreshDeltas.push(el);
      if (refreshDeltas.length >= 150) {
        S.refreshHz = GS.estimateRefresh(refreshDeltas) || 60;
        S.display.refreshRate = S.refreshHz;
        auto.setTarget(GS.targetFps(gset, S.refreshHz));
        envq.setTarget(GS.targetFps(gset, S.refreshHz));
      }
    }
    // Menu / phòng chờ: cảnh 3D xoay chậm làm nền (vẽ ~30 FPS cho nhẹ máy).
    if (now - S.menuT >= 33) {
      const md = Math.min((now - S.menuT) / 1000, 0.1);
      S.menuT = now;
      const a = now * 0.00006;
      world.hiddenId = 0;
      world.setCamera(Math.sin(a) * 30, 5.5 + Math.sin(a * 1.7) * 1.2, Math.cos(a) * 36, a, -0.12);
      world.update(md, now);
      world.render(null);
    }
    return;
  }
  // Giới hạn FPS: bỏ qua nhịp rAF còn sớm; dt dồn lại nên vật lý (bước cố định) và gameplay không đổi.
  if (S.capMs && el < S.capMs - Math.min(2, S.capMs * 0.2)) return;
  const dt = Math.min(el / 1000, 0.1);
  last = now;
  frameStats.push(el);
  if (gset.preset === 'auto') {
    auto.frame(el, now);
    if (auto.update(now)) {
      world.applyGfx(gfxEff()); // Auto đổi bậc: chỉ phần thật sự đổi mới tốn công
      envq.reset(now); // không đánh giá hiệu ứng môi trường ngay sau khi Auto vừa đổi mức
      frameStats.reset();
    }
  }
  if (envSet.enabled && envSet.adaptive) {
    envq.frame(el, now);
    const ch = envq.update(now);
    if (ch) world.weather.setAdaptiveLevel(envq.level);
  }
  if (bench.active && bench.push(el, now)) finishBench(now);
  gameFrame(dt, now);
  world.update(dt, now);
  world.render(S.self.alive && !(S.zoomScope && S.zoomT > 0.5) ? vm : null);
  if (S.enterAt) {
    S.loadMs = performance.now() - S.enterAt;
    S.enterAt = 0;
  }
  updateStats(now);
}
requestAnimationFrame(frame);

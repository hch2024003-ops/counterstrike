// Màn hình Cài đặt đồ họa (Settings → Video). Chỉnh trên bản nháp; "Áp dụng" mới có hiệu lực, "Hoàn tác" về bản đang dùng.
import * as GS from '../gfx/settings.js';

const $ = (id) => document.getElementById(id);

export class SettingsPanel {
  // getSettings(): cài đặt đang dùng. onApply(draft): Promise. getDisplay(): {width,height,scaleFactor,refreshRate,hasHost}.
  // getAutoEff(): thông số Auto đang dùng (để hiển thị).
  constructor({ getSettings, onApply, getDisplay, getAutoEff }) {
    this.getSettings = getSettings;
    this.onApply = onApply;
    this.getDisplay = getDisplay;
    this.getAutoEff = getAutoEff;
    this.e = {
      modal: $('gfxModal'), mode: $('gDisplayMode'), res: $('gResolution'), fps: $('gFps'), vsync: $('gVsync'),
      vsyncNote: $('gVsyncNote'), preset: $('gPreset'), scale: $('gScale'), scaleVal: $('gScaleVal'), scaleNote: $('gScaleNote'),
      shadow: $('gShadow'), texture: $('gTexture'), ao: $('gAo'), post: $('gPost'), fx: $('gFx'), showFps: $('gShowFps'),
      info: $('gInfo'), warn: $('gWarn'), apply: $('gApply'), revert: $('gRevert'), close: $('gClose'),
      tabGfx: $('tabGfx'), tabKeys: $('tabKeys'), tabBtnGfx: $('tabBtnGfx'), tabBtnKeys: $('tabBtnKeys'), kClose: $('kClose'),
    };
    this.onTab = null; // gọi khi đổi tab: onTab('gfx' | 'keys' | 'closed')
    this.draft = GS.sanitize(null);
    this._wire();
  }

  _wire() {
    const e = this.e;
    const direct = (key, conv) => (ev) => {
      this.draft = GS.sanitize({ ...this.draft, [key]: conv(ev.target) });
      this.render();
    };
    e.mode.addEventListener('change', direct('displayMode', (t) => t.value));
    e.res.addEventListener('change', direct('resolution', (t) => t.value));
    e.fps.addEventListener('change', direct('fpsLimit', (t) => Number(t.value)));
    e.vsync.addEventListener('change', direct('vsync', (t) => t.checked));
    e.showFps.addEventListener('change', direct('showFps', (t) => t.checked));
    e.preset.addEventListener('change', () => {
      const name = e.preset.value;
      if (name === 'auto') this.draft = GS.sanitize({ ...this.draft, preset: 'auto' });
      else if (name === 'custom') this.draft = GS.sanitize({ ...this.draft, preset: 'custom' });
      else this.draft = GS.withPreset(this.draft, name);
      this.render();
    });
    const detail = (key, ctl) => ctl.addEventListener('input', () => {
      // Chỉnh tay một mục chi tiết: Auto không ghi đè nữa (chuyển sang Custom). Nếu đang là Auto, lấy giá trị Auto hiện tại làm nền.
      let base = this.draft;
      if (base.preset === 'auto' && this.getAutoEff) {
        const a = this.getAutoEff();
        base = { ...base, shadow: a.shadow, ao: a.ao, post: a.post, effects: a.fx };
      }
      this.draft = GS.withDetail(base, key, Number(ctl.value));
      this.render();
    });
    detail('renderScale', e.scale);
    detail('shadow', e.shadow);
    detail('texture', e.texture);
    detail('ao', e.ao);
    detail('post', e.post);
    detail('effects', e.fx);
    e.apply.addEventListener('click', async () => {
      e.apply.disabled = true;
      try {
        await this.onApply(this.draft);
      } finally {
        e.apply.disabled = false;
      }
      this.draft = GS.sanitize(this.getSettings());
      this.render();
    });
    e.revert.addEventListener('click', () => {
      this.draft = GS.sanitize(this.getSettings());
      this.render();
    });
    e.close.addEventListener('click', () => this.close());
    e.kClose.addEventListener('click', () => this.close());
    e.tabBtnGfx.addEventListener('click', () => this.setTab('gfx'));
    e.tabBtnKeys.addEventListener('click', () => this.setTab('keys'));
  }

  setTab(name) {
    const e = this.e;
    const keys = name === 'keys';
    e.tabGfx.classList.toggle('hidden', keys);
    e.tabKeys.classList.toggle('hidden', !keys);
    e.tabBtnGfx.classList.toggle('active', !keys);
    e.tabBtnKeys.classList.toggle('active', keys);
    if (this.onTab) this.onTab(keys ? 'keys' : 'gfx');
  }

  open(tab = 'gfx') {
    this.draft = GS.sanitize(this.getSettings());
    this.e.modal.classList.remove('hidden');
    this.setTab(tab);
    this.render();
  }

  close() {
    this.e.modal.classList.add('hidden');
    if (this.onTab) this.onTab('closed');
  }

  get isOpen() {
    return !this.e.modal.classList.contains('hidden');
  }

  render() {
    const e = this.e;
    const d = this.draft;
    const disp = this.getDisplay();
    const isAuto = d.preset === 'auto';
    const shown = isAuto && this.getAutoEff ? { ...d, ...this._autoDetail() } : d;

    e.mode.value = d.displayMode;
    // Danh sách độ phân giải theo màn hình thật; "native" luôn có.
    const opts = GS.resolutionOptions(disp.width * 1, disp.height * 1);
    const want = d.resolution;
    e.res.innerHTML = '';
    for (const o of opts) {
      const op = document.createElement('option');
      op.value = o;
      op.textContent = o === 'native' ? `Theo màn hình (${disp.width}×${disp.height})` : o.replace('x', '×');
      e.res.appendChild(op);
    }
    e.res.value = opts.includes(want) ? want : 'native';
    const canRes = d.displayMode === 'windowed' && disp.hasHost;
    e.res.disabled = !canRes;
    e.res.title = canRes ? '' : 'Ở chế độ toàn màn hình game dùng độ phân giải gốc của màn hình; hãy giảm Render Scale để nhẹ hơn.';

    e.fps.value = String(d.fpsLimit);
    e.vsync.checked = d.vsync;
    e.vsync.disabled = !disp.hasHost;
    e.vsyncNote.textContent = disp.hasHost ? '(đổi V-Sync cần khởi động lại game)' : '(chỉ có trong bản cài đặt Windows)';
    e.preset.value = d.preset;
    e.scale.value = String(d.renderScale);
    e.scaleVal.textContent = `${d.renderScale}%`;
    const eff = GS.effective(d, 1);
    const cssW = d.displayMode === 'windowed' && GS.parseRes(d.resolution) ? GS.parseRes(d.resolution)[0] : disp.width;
    const cssH = d.displayMode === 'windowed' && GS.parseRes(d.resolution) ? GS.parseRes(d.resolution)[1] : disp.height;
    const [rw, rh] = GS.renderSize(cssW, cssH, disp.scaleFactor || 1, d.renderScale / 100);
    e.scaleNote.textContent = `→ dựng 3D ${rw}×${rh}, HUD luôn nét theo màn hình`;
    e.shadow.value = String(shown.shadow);
    e.texture.value = String(shown.texture);
    e.ao.value = String(shown.ao);
    e.post.value = String(shown.post);
    e.fx.value = String(shown.effects);
    e.showFps.checked = d.showFps;

    const refresh = disp.refreshRate ? `${disp.refreshRate} Hz` : 'không rõ';
    const tgt = GS.targetFps(d, disp.refreshRate);
    e.info.textContent =
      `Tần số quét: ${refresh} · FPS mục tiêu của Auto: ${tgt}` +
      (isAuto ? ' · Auto tự điều chỉnh bóng đổ, AO, hậu kỳ, hiệu ứng và Render Scale; chỉnh tay một mục sẽ chuyển sang Custom.' : '');
    const w = GS.warnings(d, disp);
    e.warn.textContent = w.join(' ');
    void eff;
  }

  _autoDetail() {
    const a = this.getAutoEff();
    return { shadow: a.shadow, ao: a.ao, post: a.post, effects: a.fx };
  }
}

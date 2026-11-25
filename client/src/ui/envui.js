// Bảng "Hiệu ứng môi trường" trong Cài đặt → Đồ họa. Áp dụng ngay khi chỉnh (không cần bấm Áp dụng), tự lưu localStorage.
import { sanitizeEnv, resetEnvSettings, rainLabel } from '../gfx/envlogic.js';

const $ = (id) => document.getElementById(id);
const BOOL = { eEnabled: 'enabled', eRain: 'rain', eThunder: 'thunder', eWind: 'wind', eFog: 'fog', eLeaves: 'leaves', eDust: 'dust', eSnow: 'snow', eCamera: 'cameraFx', eAdaptive: 'adaptive' };
const TYPE_LABEL = { clear: 'trời quang', rain: 'mưa', storm: 'giông bão', fog: 'sương mù', snow: 'tuyết' };
const LEVEL_LABEL = ['đầy đủ', 'giảm mật độ', 'chỉ giữ hiệu ứng chính', 'tắt hiệu ứng môi trường'];

export class EnvFxPanel {
  // get(): cài đặt đang dùng. onChange(next): áp dụng + lưu. status(): {type, rain, level, mapId} để hiển thị.
  constructor({ get, onChange, status }) {
    this.get = get;
    this.onChange = onChange;
    this.status = status;
    this.root = $('envFx');
    if (!this.root) return; // HTML cũ không có panel: bỏ qua, game vẫn chạy
    for (const [id, key] of Object.entries(BOOL)) {
      $(id).addEventListener('change', (ev) => this.set({ [key]: ev.target.checked }));
    }
    $('eQuality').addEventListener('change', (ev) => this.set({ quality: ev.target.value }));
    $('eDensity').addEventListener('input', (ev) => this.set({ density: Number(ev.target.value) }));
    $('eReset').addEventListener('click', () => {
      this.onChange(resetEnvSettings());
      this.render();
    });
    // Làm mới dòng trạng thái khi mở Cài đặt
    $('btnGfx').addEventListener('click', () => this.render());
    this.render();
  }

  set(patch) {
    this.onChange(sanitizeEnv({ ...this.get(), ...patch }));
    this.render();
  }

  render() {
    if (!this.root) return;
    const s = this.get();
    for (const [id, key] of Object.entries(BOOL)) $(id).checked = !!s[key];
    $('eQuality').value = s.quality;
    $('eDensity').value = String(s.density);
    $('eDensityVal').textContent = `${s.density}%`;
    this.root.classList.toggle('off', !s.enabled);
    const st = this.status();
    const type = TYPE_LABEL[st.type] || 'trời quang';
    $('eStatus').textContent = s.enabled
      ? `Thời tiết hiện tại: ${type}${st.rain > 0.01 ? ` (mưa ${rainLabel(st.rain)})` : ''} · mức hiệu ứng: ${LEVEL_LABEL[st.level] || LEVEL_LABEL[0]}. ` +
        'Thời tiết chỉ để trang trí: không đổi hitbox, đạn đạo hay gameplay; đồng bộ theo phòng, tắt riêng trên từng máy.'
      : 'Hiệu ứng môi trường đang tắt.';
  }
}

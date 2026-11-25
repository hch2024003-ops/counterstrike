// HUD tiền/giáp/lựu đạn, menu mua đồ (phím B) và thông báo nhỏ.
// Mua bằng phím số (con trỏ vẫn khoá, vừa chạy vừa mua được) hoặc bấm chuột khi đã nhả chuột bằng Esc.
import { WEAPONS, GEAR } from '../weapons/weapons.js';

// Thứ tự hiển thị và phím tắt (KeyboardEvent.code -> vật phẩm).
const LAYOUT = [
  { title: 'SÚNG PHỤ', items: ['deagle'] },
  { title: 'TIỂU LIÊN / SHOTGUN', items: ['smg', 'shotgun', 'autoshotgun'] },
  { title: 'SÚNG TRƯỜNG', items: ['ak', 'rifle'] },
  { title: 'HẠNG NẶNG', items: ['sniper', 'lmg'] },
  { title: 'TRANG BỊ', items: ['armor', 'frag', 'smoke'] },
];
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'KeyQ'];
const KEY_LABEL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q'];
const ORDER = LAYOUT.flatMap((g) => g.items);

const info = (id) => WEAPONS[id] || GEAR[id];

export class Shop {
  constructor(hudEl, send) {
    this.send = send;
    this.open = false;
    this.self = null;
    this.keyLabel = 'B'; // nhãn phím mở menu (main.js cập nhật khi người chơi đổi phím)

    this.box = document.createElement('div');
    this.box.id = 'moneybox';
    this.box.innerHTML = '$<b id="money">0</b><span id="armorbox"></span><span id="nadebox"></span>';
    hudEl.appendChild(this.box);
    this.moneyEl = this.box.querySelector('#money');
    this.armorEl = this.box.querySelector('#armorbox');
    this.nadeEl = this.box.querySelector('#nadebox');

    this.menu = document.createElement('div');
    this.menu.id = 'buymenu';
    this.menu.className = 'hidden';
    document.body.appendChild(this.menu);
    this.menu.addEventListener('click', (e) => {
      const it = e.target.closest('[data-item]');
      if (it) {
        e.stopPropagation();
        this.buy(it.dataset.item);
      }
    });

    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    hudEl.appendChild(this.toastEl);
    this.toastT = 0;
  }

  buy(id) {
    this.send({ t: 'buy', item: id });
  }

  // Trả về true nếu phím này đã được xử lý (mua đồ) khi menu đang mở.
  handleKey(code) {
    if (!this.open) return false;
    const i = KEYS.indexOf(code);
    if (i < 0 || !ORDER[i]) return false;
    this.buy(ORDER[i]);
    return true;
  }

  setOpen(on) {
    this.open = on;
    this.menu.classList.toggle('hidden', !on);
    if (on) this.render();
  }

  toggle() {
    this.setOpen(!this.open);
  }

  update(self, economy) {
    this.self = self;
    this.economy = economy;
    this.box.classList.toggle('hidden', !economy);
    this.moneyEl.textContent = (self.money || 0).toLocaleString('en-US');
    this.armorEl.textContent = self.armor > 0 ? ` 🛡 ${self.armor}` : '';
    const n = self.nades || [0, 0];
    this.nadeEl.textContent = (n[0] ? ' [G] Lựu đạn' : '') + (n[1] ? ' [H] Khói' : '');
    if (this.open) this.render();
  }

  render() {
    const s = this.self || {};
    const money = s.money || 0;
    const owned = s.owned || [];
    let html = `<div class="bm-head"><b>MUA ĐỒ</b><span>$${money.toLocaleString('en-US')}</span><small>Bấm phím số / Q để mua · ${this.keyLabel} để đóng</small></div><div class="bm-cols">`;
    for (const g of LAYOUT) {
      html += `<div class="bm-col"><h4>${g.title}</h4>`;
      for (const id of g.items) {
        const d = info(id);
        const k = KEY_LABEL[ORDER.indexOf(id)];
        const has = owned.includes(id) || (id === 'armor' && s.armor >= 100)
          || (id === 'frag' && (s.nades || [])[0] >= 1) || (id === 'smoke' && (s.nades || [])[1] >= 1);
        const cls = has ? 'have' : money < d.price ? 'poor' : '';
        const extra = WEAPONS[id] ? `<small>Xuyên tường ${Math.round((d.pen || 0) * 100)}%</small>` : '';
        html += `<div class="bm-item ${cls}" data-item="${id}"><span class="k">${k}</span><span class="n">${d.name}${extra}</span><span class="p">${has ? 'ĐÃ CÓ' : '$' + d.price}</span></div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    this.menu.innerHTML = html;
  }

  toast(text, kind = '') {
    this.toastEl.textContent = text;
    this.toastEl.className = 'show ' + kind;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { this.toastEl.className = ''; }, 2600);
  }
}

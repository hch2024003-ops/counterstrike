// Tab "Phím điều khiển": xem toàn bộ phím và đổi phím (bấm vào ô phím rồi nhấn phím mới; Esc huỷ; Backspace/Delete xoá).
import { ACTIONS, FIXED_KEYS, codeLabel } from './keybinds.js';

export class KeysPanel {
  constructor(root, keybinds, labelOf = (id) => id) {
    this.root = root;
    this.kb = keybinds;
    this.labelOf = labelOf;
    this.listening = null; // { action, slot }
    this._onKey = (ev) => this._capture(ev);
    root.addEventListener('click', (ev) => {
      const cell = ev.target.closest('[data-act]');
      if (cell) this._startListen(cell.dataset.act, Number(cell.dataset.slot));
      else if (ev.target.closest('[data-reset]')) {
        this._stopListen();
        this.kb.reset();
        this.msg = 'Đã khôi phục phím mặc định.';
        this.render();
      }
    });
    this.msg = '';
  }

  get isListening() {
    return !!this.listening;
  }

  _startListen(action, slot) {
    this._stopListen();
    this.listening = { action, slot };
    this.msg = 'Nhấn phím mới… (Esc: huỷ · Backspace/Delete: xoá phím này)';
    window.addEventListener('keydown', this._onKey, true); // bắt ở pha capture: game không nhận phím này
    this.render();
  }

  _stopListen() {
    if (!this.listening) return;
    window.removeEventListener('keydown', this._onKey, true);
    this.listening = null;
  }

  _capture(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const { action, slot } = this.listening;
    if (ev.code === 'Escape') {
      this.msg = 'Đã huỷ.';
    } else if (ev.code === 'Backspace' || ev.code === 'Delete') {
      this.kb.clear(action, slot);
      this.msg = 'Đã xoá phím.';
    } else {
      const r = this.kb.set(action, slot, ev.code);
      if (!r.ok) {
        this.msg = r.reason;
        this.render();
        return; // vẫn đang chờ phím khác
      }
      const lab = (id) => (ACTIONS.find((a) => a.id === id) || {}).label || id;
      this.msg = r.stolenFrom ? `Đã gán ${codeLabel(ev.code)}. Phím này đã gỡ khỏi “${lab(r.stolenFrom)}”.` : `Đã gán ${codeLabel(ev.code)}.`;
    }
    this._stopListen();
    this.render();
  }

  // Gọi khi đóng modal/đổi tab để không bỏ sót trạng thái chờ phím.
  stop() {
    this._stopListen();
    this.msg = '';
  }

  render() {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let html = '<table class="keytable"><tbody>';
    let group = '';
    for (const a of ACTIONS) {
      if (a.group !== group) {
        group = a.group;
        html += `<tr class="kgroup"><th colspan="3">${esc(group)}</th></tr>`;
      }
      html += `<tr><td class="kname">${esc(a.label)}</td>`;
      for (let s = 0; s < 2; s++) {
        const code = this.kb.codes(a.id)[s];
        const on = this.listening && this.listening.action === a.id && this.listening.slot === s;
        html += `<td><button type="button" class="keycell${on ? ' listening' : ''}${code ? '' : ' empty'}" data-act="${a.id}" data-slot="${s}">${on ? 'Nhấn phím…' : esc(codeLabel(code))}</button></td>`;
      }
      html += '</tr>';
    }
    html += '<tr class="kgroup"><th colspan="3">Phím cố định</th></tr>';
    for (const [k, d] of FIXED_KEYS) html += `<tr class="kfixed"><td class="kname"><kbd>${esc(k)}</kbd></td><td colspan="2">${esc(d)}</td></tr>`;
    html += '</tbody></table>';
    html += `<div class="row"><button type="button" data-reset="1">Khôi phục mặc định</button><span class="keymsg">${esc(this.msg)}</span></div>`;
    this.root.innerHTML = html;
  }
}

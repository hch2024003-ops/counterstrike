// Bảng báo lỗi: mọi lỗi JavaScript/promise/shader hiện ngay trên màn hình để người chơi chụp gửi lại (thay vì chỉ nằm trong console).
// Module này PHẢI là import đầu tiên của main.js để bắt được cả lỗi xảy ra khi nạp các module khác.
const seen = new Set();
let box = null;
let list = null;

function ensure() {
  if (box || typeof document === 'undefined' || !document.body) return;
  box = document.createElement('div');
  box.id = 'fatal';
  box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#5a1010;color:#fff;font:13px/1.45 Consolas,monospace;padding:8px 12px;max-height:45vh;overflow:auto;white-space:pre-wrap;display:none;';
  const bar = document.createElement('div');
  bar.textContent = 'HACHIHI gặp lỗi. Chụp màn hình này gửi lại; nhấn F12 để xem chi tiết trong Console. ';
  bar.style.cssText = 'font-weight:700;margin-bottom:6px;';
  const close = document.createElement('button');
  close.textContent = 'Đóng';
  close.style.cssText = 'margin-left:10px;';
  close.onclick = () => { box.style.display = 'none'; };
  bar.appendChild(close);
  list = document.createElement('div');
  box.appendChild(bar);
  box.appendChild(list);
  document.body.appendChild(box);
}

function fmt(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return (err.stack || err.message || String(err)).split('\n').slice(0, 6).join('\n');
}

export const fatal = {
  show(title, err) {
    try {
      ensure();
      if (!box) { console.error('[fatal]', title, err); return; }
      const line = document.createElement('div');
      line.textContent = '• ' + title + (err ? '\n' + fmt(err) : '');
      line.style.cssText = 'margin-bottom:6px;';
      list.appendChild(line);
      while (list.children.length > 5) list.removeChild(list.firstChild);
      box.style.display = 'block';
    } catch { /* không để bảng báo lỗi tự gây lỗi */ }
  },
  // Chỉ báo một lần cho mỗi khoá (tránh spam khi lỗi lặp mỗi khung hình)
  once(key, title, err) {
    if (seen.has(key)) return;
    seen.add(key);
    console.error('[HACHIHI]', title, err);
    this.show(title, err);
  },
};

if (typeof window !== 'undefined') {
  window.__fatal = fatal;
  window.addEventListener('error', (e) => fatal.once('err:' + (e.message || '') + (e.lineno || ''), 'Lỗi', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => fatal.once('rej:' + String(e.reason && e.reason.message || e.reason), 'Lỗi (promise)', e.reason));
}

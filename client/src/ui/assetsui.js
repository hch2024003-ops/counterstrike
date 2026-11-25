// Bảng "Thư viện đồ họa": xem các gói tài nguyên, xác minh toàn vẹn, cài từ thư mục, kiểm tra/tải cập nhật, gỡ gói.
// Chỉ có đầy đủ trong bản Electron (trình duyệt chỉ xem manifest).
const fmt = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

export function initAssetsUi(assets) {
  const root = document.getElementById('assetsPanel');
  const body = document.getElementById('assetsBody');
  const msg = document.getElementById('assetsMsg');
  let updates = null;

  const say = (t) => { msg.textContent = t || ''; };

  async function render() {
    const st = await assets.status();
    const rows = (st.packages || []).map((p) => {
      const upd = updates && updates.find((u) => u.id === p.id);
      const state = p.assets === 0 ? 'trống' : p.complete ? 'đã cài đủ' : `${p.present}/${p.assets} file`;
      return `<tr><td>${p.name}</td><td>${p.version}</td><td>${state}</td><td>${fmt(p.bytes || 0)}</td><td>`
        + `<button data-act="verify" data-id="${p.id}">Xác minh</button> `
        + (upd ? `<button data-act="download" data-id="${p.id}">Tải ${upd.version}</button> ` : '')
        + (!p.bundled && p.present ? `<button data-act="remove" data-id="${p.id}">Gỡ</button>` : '') + '</td></tr>';
    }).join('');
    body.innerHTML = `<table><tr><th>Gói</th><th>Phiên bản</th><th>Trạng thái</th><th>Dung lượng</th><th></th></tr>${rows || '<tr><td colspan="5">Chưa có gói tài nguyên. Game dùng model dựng bằng code.</td></tr>'}</table>`
      + (st.freeBytes ? `<p class="sub">Dung lượng trống: ${fmt(st.freeBytes)}</p>` : '')
      + (assets.error ? `<p class="sub">Ghi chú: ${assets.error}</p>` : '');
  }

  async function open() { root.classList.remove('hidden'); say(''); await render(); }
  document.getElementById('btnAssets').addEventListener('click', open);
  document.getElementById('assetsClose').addEventListener('click', () => root.classList.add('hidden'));
  document.getElementById('assetsInstall').addEventListener('click', async () => {
    say('Đang cài…');
    const r = await assets.installFromFolder();
    say(r.ok ? `Đã cài ${r.installed} file. Khởi động lại game để dùng.` : 'Lỗi: ' + r.error);
    await render();
  });
  document.getElementById('assetsCheck').addEventListener('click', async () => {
    say('Đang kiểm tra cập nhật…');
    const r = await assets.checkUpdates();
    updates = r.ok ? r.packages : null;
    say(r.ok ? `Có ${r.packages.length} gói trên máy chủ cập nhật.` : 'Không kiểm tra được: ' + r.error);
    await render();
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'verify') {
      say('Đang xác minh…');
      const r = await assets.verify(id);
      say(r.bad && r.bad.length ? `Hỏng ${r.bad.length}/${r.checked} file: ${r.bad.slice(0, 3).map((x) => x.id + ' (' + x.reason + ')').join(', ')}` : `Đã kiểm tra ${r.checked} file, tất cả đúng SHA-256.`);
    } else if (b.dataset.act === 'download') {
      say('Đang tải…');
      const r = await assets.download(id, (p) => say(`Đang tải… ${Math.round((100 * p.done) / Math.max(1, p.total))}%`));
      say(r.ok ? `Đã tải và xác minh ${r.downloaded} file. Khởi động lại game để dùng.` : 'Lỗi: ' + r.error + ' (có thể bấm lại để tiếp tục)');
      await render();
    } else if (b.dataset.act === 'remove') {
      const r = await assets.remove(id);
      say(r.ok ? 'Đã gỡ gói.' : 'Lỗi: ' + r.error);
      await render();
    }
  });
}

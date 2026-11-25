// Hướng dẫn chơi trong game. Bảng súng lấy trực tiếp từ dữ liệu server nên luôn khớp với thông số thật.
import { WEAPONS, GEAR } from '../weapons/weapons.js';

function weaponRows() {
  return Object.values(WEAPONS)
    .map((w) => `<tr><td>${w.name}</td><td>${w.cat === 'primary' ? 'Chính' : 'Phụ'}</td><td>${w.price ? '$' + w.price : 'Có sẵn'}</td>`
      + `<td>${w.damage || ''}</td><td>${Math.round((w.pen || 0) * 100)}%</td></tr>`)
    .join('');
}

export function guideHtml() {
  return `
<h2>Hướng dẫn chơi HACHIHI Counter-Strike</h2>
<h3>Mục tiêu</h3>
<p>Hai đội đấu nhiều vòng. Hạ hết đối thủ (hoặc còn nhiều người sống hơn khi hết giờ) để thắng vòng. Đội thắng đủ số vòng là thắng trận.
Nếu mọi đối thủ đã rời phòng, trận không tính điểm nữa; người cuối cùng tự bấm <b>Rời phòng</b> khi muốn thoát (phòng không tự đóng).</p>
<h3>Điều khiển</h3>
<ul>
<li><kbd>W A S D</kbd> di chuyển · <kbd>Space</kbd> nhảy · <kbd>Giữ Ctrl</kbd> hoặc <kbd>C</kbd> ngồi (đi chậm, đầu thấp hơn, chui được dưới vật thấp) · <kbd>Chuột</kbd> ngắm và bắn · <kbd>R</kbd> thay đạn</li>
<li>Mọi phím đều <b>đổi được</b>: Menu chính hoặc màn hình tạm dừng (nhấn Esc) → <b>Phím điều khiển</b>.</li>
<li><kbd>1</kbd> súng chính · <kbd>2</kbd> súng phụ · cuộn chuột đổi giữa các súng đang có</li>
<li><kbd>B</kbd> mở menu mua đồ · <kbd>Giữ G</kbd> canh lựu đạn · <kbd>Giữ H</kbd> canh bom khói (thả phím để ném) · <kbd>Tab</kbd> bảng điểm · <kbd>F3</kbd> FPS/ping · <kbd>Esc</kbd> nhả chuột</li>
</ul>
<h3>Tiền và mua đồ</h3>
<ul>
<li>Mỗi người bắt đầu với <b>$800</b> và súng lục. Mua đồ trong lúc đóng băng đầu vòng và 10 giây đầu của vòng: bấm <kbd>B</kbd>, rồi bấm phím số/Q hiện trên menu (vẫn chạy và ngắm được).</li>
<li>Thắng vòng: <b>$3250</b>, cộng thêm <b>$150</b> cho mỗi vòng thắng liên tiếp (tối đa 4 vòng). Thua vòng: <b>$1400</b>, tăng thêm <b>$500</b> cho mỗi vòng thua liên tiếp (tối đa $3400).</li>
<li>Hạ gục thưởng $100–$900 tuỳ súng (tiểu liên và shotgun thưởng nhiều nhất, bắn tỉa ít nhất).</li>
<li>Còn sống đến hết vòng thì giữ súng, giáp và lựu đạn sang vòng sau. Chết thì mất hết, về súng lục.</li>
<li>Chủ phòng có thể tắt chế độ tiền ở phòng chờ để chơi kiểu cổ điển (có sẵn súng trường, súng lục, shotgun) và chọn số vòng thắng.</li>
</ul>
<h3>Súng</h3>
<table><tr><th>Tên</th><th>Loại</th><th>Giá</th><th>Sát thương</th><th>Xuyên tường</th></tr>${weaponRows()}</table>
<p><b>Xuyên tường:</b> đạn của súng có chỉ số này có thể xuyên qua tường mỏng (hộp tôn, vách văn phòng, lan can) và trúng người phía sau, nhưng sát thương giảm. Bắn tỉa xuyên được tường dày nhất; tường rất dày (tường bao, container) thì không xuyên được.</p>
<h3>Trang bị</h3>
<ul>
<li><b>${GEAR.armor.name} ($${GEAR.armor.price}):</b> hấp thụ một nửa sát thương cho tới khi hết giáp.</li>
<li><b>${GEAR.frag.name} ($${GEAR.frag.price}):</b> nổ sau khoảng 1,8 giây, gây sát thương theo khoảng cách trong bán kính 8 m, bị tường chắn mảnh, không hại đồng đội (tự ném vào mình vẫn bị).</li>
<li><b>${GEAR.smoke.name} ($${GEAR.smoke.price}):</b> bung đám khói dày khoảng 18 giây che tầm nhìn. Đạn vẫn bay xuyên khói.</li>
</ul>
<h3>Chơi với máy</h3>
<ul>
<li>Chủ phòng thêm máy ở phòng chờ: chọn cấp độ <b>Dở, Thường, Khá, Giỏi, Xuất sắc</b> rồi bấm <b>＋ Thêm máy</b> ở đội mong muốn. Nút <b>⇄</b> chuyển người hoặc máy sang đội kia, <b>✕</b> xoá máy. Mỗi đội tối đa 5.</li>
<li>Máy bắn, mua đồ, ném lựu đạn theo cùng luật như người. Cấp càng cao phản xạ càng nhanh và ngắm càng chuẩn. Máy chỉ đi trên mặt đất, không lên sàn cao.</li>
</ul>
<h3>Bản đồ</h3>
<ul>
<li>Chủ phòng chọn bản đồ ở phòng chờ: <b>Hồ Gươm – Hà Nội</b> (nhỏ), <b>Tháp Eiffel – Paris</b>, <b>Nhà kho</b>, <b>Colosseum – Rome</b>, <b>Cầu Cổng Vàng</b> (hẹp, dài), <b>Vạn Lý Trường Thành</b> và <b>Kim tự tháp Giza</b> (rất lớn).</li>
<li>Kim tự tháp Giza trèo được lên đỉnh bằng các bậc; Trường Thành có cầu thang lên đường đi trên tường; sàn thao tác ở kho hàng lên bằng cầu thang.</li>
<li>Bản đồ có thời tiết riêng: cát bay, hoa rơi, sương mù, mưa phùn.</li>
</ul>
<h3>Ném lựu đạn và bom khói</h3>
<ul>
<li><b>Giữ</b> phím <kbd>G</kbd> (lựu đạn) hoặc <kbd>H</kbd> (bom khói): hiện đường vàng cho thấy quả sẽ bay và nảy thế nào, vòng tròn là chỗ rơi lúc nổ. Di chuột để canh hướng và độ cao.</li>
<li><b>Thả</b> phím mới ném. Bấm <kbd>chuột phải</kbd> để huỷ nếu không muốn ném nữa.</li>
<li><b>Chạy hoặc nhảy rồi ném</b> thì quả bay xa hơn (đường vàng đã tính sẵn đà này), ví dụ chạy tiến + nhảy ném xa hơn đứng ném khoảng 40%.</li>
</ul>
<h3>Nhắm súng (chuột phải)</h3>
<ul>
<li>Súng trường, AK-47, tiểu liên, đại liên, súng lục và Desert Eagle: bấm <kbd>chuột phải</kbd> để nhắm qua thước ngắm. Súng dịch vào giữa màn hình, hình phóng nhẹ, đạn tản ít hơn khoảng 25–35%. Bấm <kbd>chuột phải</kbd> lần nữa để thoát. Shotgun không nhắm được.</li>
</ul>
<h3>Ống ngắm bắn tỉa</h3>
<ul>
<li>Súng <b>Bắn tỉa</b>: bấm <kbd>chuột phải</kbd> để nhìn qua ống ngắm (phóng to, chuột chậm lại cho dễ ngắm), bấm <kbd>chuột phải</kbd> lần nữa để thoát. Tự thoát khi thay đạn, đổi súng hoặc bị hạ.</li>
<li>Ống ngắm có thước chia: mỗi vạch nhỏ 10 mrad. Người cao 1,8 m chiếm bao nhiêu mrad thì khoảng cách (m) ≈ 1800 ÷ số mrad đó (chiếm 18 mrad ≈ 100 m).</li>
<li>Bắn tỉa mà <b>không</b> nhìn qua ống ngắm thì đạn lệch rất nhiều; nhìn qua ống ngắm và đứng yên thì cực chuẩn.</li>
</ul>
<h3>Mẹo</h3>
<ul>
<li>Nghe tiếng bước chân và tiếng súng: âm thanh nhỏ dần theo khoảng cách, lệch trái/phải theo hướng, bị nghẹt khi khác phòng.</li>
<li>Sàn thao tác kim loại phát tiếng bước chân to hơn bê tông.</li>
<li>Bắn khi đang chạy rất lệch tâm; dừng lại rồi bắn từng loạt ngắn.</li>
</ul>`;
}

export function initGuide() {
  const root = document.getElementById('guide');
  const body = document.getElementById('guideBody');
  const open = () => { body.innerHTML = guideHtml(); root.classList.remove('hidden'); };
  const close = () => root.classList.add('hidden');
  for (const id of ['btnGuide', 'btnGuide2']) {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', open);
  }
  document.getElementById('guideClose').addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
}

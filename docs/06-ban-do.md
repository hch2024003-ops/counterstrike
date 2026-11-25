# 06 – Nhiều bản đồ (nhỏ → rất lớn), địa danh dễ nhận ra

**File:** `server/src/maps/*.json`, `client/assets/maps/*.json` (giống hệt nhau), `server/src/game/map.js`, `client/src/game/maps.js`, `client/src/gfx/environment.js`, `client/src/gfx/textures.js`

| Bản đồ | Kích thước | Loại | Điểm nhận dạng |
|---|---|---|---|
| Hồ Gươm – Hà Nội (`hoguom`) | 44 m | Nhỏ | Tháp Rùa giữa hồ, đền Ngọc Sơn, cầu Thê Húc đỏ, hoa phượng |
| Tháp Eiffel – Paris (`paris`) | 56 m | Vừa | Bốn chân tháp Eiffel, đài phun nước, quán cà phê, nhà mái mansard |
| Nhà kho (`warehouse`) | 60 m | Vừa | Bản đồ gốc: phòng bảo vệ, sàn thao tác 2 tầng, bệ bốc dỡ |
| Đấu trường Colosseum – Rome (`rome`) | 70 m | Lớn | Vòng cổng vòm hai tầng, khải hoàn môn hai đầu, tàn tích cột |
| Cầu Cổng Vàng – San Francisco (`bridge`) | 80 m | Hẹp & dài | Hai tháp đỏ cao 30 m, cáp treo, sương mù, mưa phùn |
| Vạn Lý Trường Thành (`greatwall`) | 80 m | Lớn | Tường thành cắt ngang, ba cổng, hai tháp canh, cầu thang lên tường |
| Kim tự tháp Giza – Ai Cập (`giza`) | 90 m | Rất lớn | Bốn kim tự tháp bậc thang (trèo lên đỉnh được), Nhân sư, obelisk, rừng cọ |

Ghi chú: không dùng model/bản quyền bên ngoài; mọi công trình dựng bằng khối hộp + hình trang trí, mang tính gợi nhớ chứ không sao chép chi tiết.

## Chọn bản đồ
Chủ phòng chọn ở phòng chờ (ô "Bản đồ", có mô tả bên dưới). Chỉ đổi được ở phòng chờ; id lạ rơi về `warehouse`. Mỗi phòng có bản đồ riêng nên nhiều phòng chơi bản đồ khác nhau cùng lúc được.

## Dữ liệu một bản đồ (JSON)
- `id, name, tag, desc, size`
- `boxes`: hộp va chạm `{p, s, c, m}` (tâm, kích thước, màu, vật liệu). Vật liệu: `wall container crate barrier pillar shed center` (kho) và mới `brick stone sand plaster tile grass metal wood water`.
- `decor`: hình trang trí không va chạm `{k, p, s, c, m, r}` với `k` = `box cyl cone sphere plane prism seg`.
- `theme`: `ground {kind,c}`, `sky {top,mid,horizon}`, `sunDir`, `sunColor`, `sunI`, `hemi`, `fog/fogNear/fogFar`, `ambient` (hiệu ứng không khí).
- `spawns`: điểm xuất phát hai đội.

## Va chạm và luật riêng từng bản đồ
- Biên bản đồ = tường bao (các hộp) nên người chơi không ra ngoài; server kiểm tra `bounds = size/2 − 0.4`.
- Độ cao tối đa hợp lệ tính theo khối cao nhất của bản đồ (`maxY`): leo kim tự tháp (4,8 m) hay tường thành (5 m) không bị server kéo lại.
- Bậc thang cao 0,4 m (nhỏ hơn ngưỡng bước 0,45 m) nên đi bộ lên được.

## Thêm bản đồ mới
1. Viết file JSON vào `server/src/maps/` và `client/assets/maps/` (nội dung giống hệt).
2. Thêm dòng `import` và tên vào `client/src/game/maps.js`.
3. Chạy `node server/test/maps.js` và `node client/test/maps.mjs`.
(Trong gói có script sinh bản đồ: `tools/maps.py`, chạy `python3 tools/maps.py` để tạo lại và kiểm tra spawn, đường đi A→B, biên.)

## Kiểm thử
- `server/test/maps.js`: nạp được mọi bản đồ, spawn không kẹt, có tường bao, chọn bản đồ theo phòng.
- `client/test/maps.mjs`: dùng bộ điều khiển thật: đi thẳng không ra ngoài, leo cầu thang Trường Thành/Giza/kho, server không kéo lại người chơi khi leo.

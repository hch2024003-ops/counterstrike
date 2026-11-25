# 12 – Canh ném bom (giữ để canh, thả để ném) và ống ngắm bắn tỉa

**File:** `client/src/game/nade-physics.js`, `client/src/ui/scope.js`, `client/src/gfx/grenadefx.js` (đường ngắm), `client/src/main.js`, `server/src/game/grenades.js`, `server/src/game/movement.js`, `server/src/combat/combat.js`, `server/src/combat/weapons.js`

## Ném lựu đạn / bom khói
- **Giữ** `G` (lựu đạn) hoặc `H` (bom khói): chưa ném. Hiện **đường quỹ đạo màu vàng** (bom khói: xanh nhạt) và **vòng tròn chỗ rơi lúc nổ**, tính bằng đúng vật lý của server (kể cả nảy khi chạm tường/sàn).
- **Thả** phím: ném đi. **Chuột phải** khi đang giữ: huỷ ném. Đang canh thì không bắn được; mất focus cũng huỷ.
- **Nhảy/chạy để ném xa hơn:** vận tốc của người ném được cộng vào vận tốc quả ném (`THROW_MOM_H = 0.8` theo chiều ngang, `THROW_MOM_V = 0.6` theo chiều lên). Ví dụ đo trên sân phẳng: đứng ném ~22 m, chạy ~29 m, chạy + nhảy ~31 m. Đường quỹ đạo vàng đã tính sẵn đà này, nên canh được trước khi ném.
- Server ước lượng vận tốc người chơi từ các gói vị trí (`vx, vy, vz` trong `Player`), nên không thể khai gian.

## Ống ngắm
- Súng **Bắn tỉa** có thuộc tính `scope: true` trong `weapons.js`. **Chuột phải** vào ống ngắm, **chuột phải lần nữa** để thoát.
- Khi ngắm: góc nhìn dọc 75° → 22° (phóng khoảng 3,5 lần, chuyển mượt), ẩn súng cầm tay, **tốc độ chuột tự giảm theo mức phóng** để ngắm xa dễ.
- **Thước chia** trong ống ngắm: vạch nhỏ mỗi 10 mrad, vạch lớn có số mỗi 20 mrad. Người cao 1,8 m chiếm n mrad thì khoảng cách ≈ 1800 ÷ n mét. Tâm có chấm đỏ nhỏ.
- **Luật:** bắn tỉa không nhìn qua ống ngắm bị tản đạn thêm `UNSCOPED_SPREAD = 0.045` rad (rất lệch); nhìn qua ống ngắm và đứng yên thì chuẩn như cũ. Máy chơi chung luôn được tính là đang ngắm.
- Tự thoát ống ngắm khi thay đạn, đổi súng hoặc bị hạ.

## Nhắm súng thường (ADS)
- Súng trường, AK-47, tiểu liên, đại liên, súng lục, Desert Eagle (thuộc tính `ads` = góc nhìn dọc khi nhắm, `adsSpread` = hệ số tản đạn) nhắm bằng **chuột phải** (bấm lần nữa để thoát). Shotgun không nhắm được.
- Khi nhắm: góc nhìn thu về 58–68° (nhẹ), súng cầm tay **dịch vào giữa màn hình** sao cho thước ngắm/chấm đỏ trùng tâm, giảm lắc, **ẩn tâm ngắm mặc định**, tản đạn giảm 25–35% (`adsSpread` 0,65–0,75). Không có thu phóng mạnh và không có thước mil như ống ngắm bắn tỉa.
- Cùng thông điệp `scope` với bắn tỉa; server áp công thức chung `computeSpread(w, moveFactor, airborne, spray, scoped)` trong `weapons.js`.
- Chưa làm: giảm tốc độ chạy khi nhắm; thước ngắm riêng cho từng loại súng (đang căn bằng bảng `ADS_Y` trong `viewmodel.js`, cần chỉnh nếu thước lệch tâm khi nhìn thật).

## Giao thức
| Hướng | Tin |
|---|---|
| client → server | `{t:'throw', kind, ...tư thế}` gửi khi **thả** phím |
| client → server | `{t:'scope', on}` vào/ra ống ngắm (chỉ có tác dụng với súng có `scope`) |

## Kiểm thử
- `node client/test/nade.mjs`: 84 lần ném trên mọi bản đồ, quỹ đạo vẽ ở client lệch server 0,0000 m.
- `node server/test/scope.js`: ném chạy/nhảy bay xa hơn, server ước lượng vận tốc, bắn tỉa không ống ngắm lệch, đổi súng thoát ống ngắm.

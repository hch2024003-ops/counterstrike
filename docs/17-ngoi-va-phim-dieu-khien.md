# 17 – Ngồi và tab Phím điều khiển (0.9.5)

## Ngồi
- Giữ **Ctrl trái** hoặc **C** (đổi được). Mắt hạ 1.6 → 1.15 m, thân cao 1.8 → 1.25 m, đi chậm 2.6 m/s.
- Nhả phím chỉ đứng dậy khi phía trên còn chỗ (không kẹt vào trần/hộp thấp).
- Server là nguồn chuẩn: client gửi cờ `c` trong gói `move/shoot/throw`; server dùng hitbox thấp hơn (`CROUCH_*` trong `server/src/config.js`), điểm bắn/ném theo mắt ngồi, `insideWall` kiểm tra chiều cao ngồi. Snapshot thêm phần tử thứ 9 (`crouch`) để người khác thấy bạn ngồi.
- Người khác hiển thị bằng cách nén thân theo trục Y (khớp hitbox). Animation ngồi thật cần model GLB có rig.
- Ngồi chưa ảnh hưởng độ tản đạn (có thể thêm sau trong `computeSpread`).

## Tab Phím điều khiển
- Menu chính → **Phím điều khiển…**, hoặc ngay trong trận: nhấn Esc → **Phím điều khiển**. (Tab nằm trong cửa sổ Cài đặt cạnh tab Đồ họa.)
- Bấm vào ô phím → nhấn phím mới. Esc huỷ, Backspace/Delete xoá. Mỗi hành động có 2 ô. Gán phím đang dùng sẽ gỡ nó khỏi hành động cũ (có báo).
- Lưu trong localStorage (`hachihi.keys`); nút **Khôi phục mặc định**.
- Phím cố định (không đổi): chuột, cuộn chuột, Esc, F3, F4, F11, phím số khi menu mua đang mở.
- Code: `client/src/ui/keybinds.js` (logic), `keysui.js` (giao diện), test `client/test/keys.mjs`.

## Phím B (mua đồ)
Logic mở menu không đổi, nhưng nay luôn có phản hồi: mở menu, hoặc báo lý do (phòng tắt chế độ tiền / đã chết). Server chỉ cho mua trong lúc đóng băng đầu vòng và `BUY_LIVE_MS` giây đầu của vòng; hết giờ sẽ báo “Đã hết thời gian mua đồ”.

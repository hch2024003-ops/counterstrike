# 07 – Hiệu ứng môi trường như ngoài đời

**File:** `client/src/gfx/ambientfx.js`, `client/src/gfx/grenadefx.js`, `client/src/gfx/sky.js`, `client/src/gfx/environment.js`

- **Thời tiết theo bản đồ** (`theme.ambient`): cát bay ngang (Rome, Giza), cánh hoa phượng rơi (Hồ Gươm), sương mù trôi (Paris, Trường Thành), mưa phùn + sương (Cầu Cổng Vàng). Hạt bám quanh camera, một draw call mỗi loại, tự tắt khi mức hiệu ứng đồ họa thấp.
- **Trời, nắng, sương** riêng từng bản đồ: màu trời, hướng/màu mặt trời, màu và độ dày sương, ánh sáng nền. Ví dụ Giza nắng vàng gắt và bụi mờ, Cầu Cổng Vàng sương dày màu hồng xám.
- **Mặt đất theo chất liệu**: gạch lát, đá, cát, cỏ, nước.
- **Đã có từ bản trước:** vết đạn theo vật liệu, tia lửa, vỏ đạn, bụi bay, đổ bóng.
- **Mới ở bản này:** nổ lựu đạn (loé sáng, cầu lửa, khói đen, tia lửa, rung màn hình), bom khói phình dần và tan dần, âm thanh nổ/vang theo môi trường (xem `05-am-thanh.md`).

Tuỳ chỉnh: sửa `KINDS` trong `ambientfx.js` (số hạt, tốc độ, màu) hoặc thêm loại mới rồi dùng tên đó trong `theme.ambient`.

**Thời tiết động (0.10.4):** mưa, sấm chớp, gió, sương, lá, bụi, tuyết có bảng cài đặt riêng và tự giảm theo FPS: xem `18-environment-fx.md`.

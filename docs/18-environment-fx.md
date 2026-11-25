# 18 – Environment FX (thời tiết & không khí)

**File chính:** `client/src/gfx/envlogic.js` (logic thuần), `client/src/gfx/weather.js` (dựng hình bằng shader), `client/src/ui/envui.js` (bảng cài đặt), `client/test/env.mjs` (kiểm thử).

## Hiệu ứng
| Hiệu ứng | Cách làm (nhẹ) |
|---|---|
| Mưa (nhỏ/vừa/lớn) | `LineSegments`, chuyển động trong vertex shader, nghiêng theo gió, mật độ chỉnh bằng `drawRange` |
| Sấm chớp | Chỉ nâng ánh sáng môi trường (hemi + environment + exposure + trời) ≤ 0.5 giây; **không tạo đèn động**; tiếng sấm trễ theo "khoảng cách" |
| Gió | Hướng/độ mạnh theo thời tiết: nghiêng mưa/tuyết, lá và bụi trôi, sương trôi |
| Sương mù | Sương xa: tăng nhẹ độ dày `scene.fog` (giảm tầm nhìn tối đa 20%); sương sát đất: tối đa 36 billboard trôi chậm, mờ dần khi sát camera |
| Lá bay | `Points` shader, xoay + đung đưa, chỉ ở bản đồ có cây (Hồ Gươm, Paris, Rome) |
| Bụi | `Points` shader nhỏ quanh camera (kho, Rome, Giza) |
| Tuyết | `Points` shader, có thể bật theo bản đồ (Trường Thành); không mô phỏng tuyết tích |
| Mặt đất ướt | Dùng lại uniform `WET` của vật liệu mặt đất khi mưa |
| Hiệu ứng camera | Vài giọt nước CSS khi mưa vừa trở lên; tắt được; chớp dịu hơn khi tắt |

Không có vật lý thật, không tạo/huỷ Mesh trong vòng lặp; mọi hạt nằm trong một hộp quanh camera và bị làm mờ ở rìa/sát camera.

## Thời tiết theo bản đồ (`WEATHER_PROFILES` trong `envlogic.js`)
Cầu Cổng Vàng: mưa/giông/sương · Paris: quang/mưa/sương + lá · Hồ Gươm: quang/mưa/giông + lá · Trường Thành: quang/sương/tuyết · Rome: quang/mưa hiếm + bụi/lá · Giza: luôn quang (gió + bụi) · Kho: quang/mưa/giông/sương + bụi. Thêm bản đồ mới: thêm một dòng vào bảng.

Khi Environment FX bật, lớp mưa phùn cũ trong `ambientfx.js` (`rain`) tự bị bỏ để không chồng hai lớp mưa; tắt Environment FX thì bản đồ Cầu dùng lại mưa phùn cũ.

## Cài đặt (Cài đặt → Đồ họa → "Hiệu ứng môi trường")
Bật/tắt toàn bộ; chất lượng Low/Balanced/High/Ultra; bật/tắt mưa, sấm chớp, gió, sương, lá, bụi, tuyết, hiệu ứng camera; mật độ 20–100%; tự giảm theo FPS; **Đặt lại mặc định**. Áp dụng ngay, lưu `localStorage` khoá `hachihi.envfx`. Mức "Hiệu ứng" của đồ họa chung (Low/Auto thấp) cũng giới hạn hiệu ứng này (fx=0 tắt hẳn; fx=1 bỏ lớp trang trí).

## Tự giảm theo FPS (`EnvQuality`)
Ngưỡng theo FPS mục tiêu (60 FPS ≈ 55/45/35): dưới 92% → bậc 1 (giảm mật độ); dưới 75% → bậc 2 (tắt bụi, lá, sương sát đất); dưới 58% → bậc 3 (chỉ hiệu ứng gameplay). Phải dưới ngưỡng liên tục 2,5 giây mới hạ; chỉ nâng từng bậc sau 12 giây ổn định, nâng thất bại thì thời gian chờ nhân đôi (tối đa ×8). Dừng đánh giá ~1,5 giây sau mỗi lần Auto đồ họa đổi mức. **Các ngưỡng là mục tiêu thiết kế ban đầu, cần đo trên máy chơi thật.**

## Multiplayer
Không đổi giao thức/server. Thời tiết = hàm của (PIN phòng, bản đồ, số vòng): mọi người trong phòng tự tính ra cùng loại thời tiết, cường độ, hướng gió và lịch sét. Không gửi dữ liệu từng hạt. Đồng hồ sét bắt đầu khi nhận tin `round` nên lệch giữa các máy tối đa bằng độ trễ mạng. Người vào giữa vòng có đồng hồ sét bắt đầu lại từ lúc vào. Hiệu ứng thuần thị giác: không đổi hitbox, đạn, va chạm; tắt riêng được từng máy.

## Giới hạn hiện tại
- Mưa/tuyết cũng rơi trong khu vực có mái (kho); chưa có kiểm tra "trong nhà".
- Chưa có chuyển động gió cho cỏ/cây bằng vertex shader (bản đồ hiện dựng bằng hộp/hình khối, chưa có mesh cây cỏ thật).
- Chưa làm: chu kỳ ngày đêm, tia nắng xuyên cây, đèn môi trường nhấp nháy (giai đoạn 3 trong đề xuất). Hiệu ứng chiến đấu (tia lửa, vỏ đạn, khói, nổ) đã có từ trước trong `fx.js`/`grenadefx.js`, không đổi.

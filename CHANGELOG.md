# Changelog

## 0.10.4 — Environment FX (thời tiết & không khí)
Gameplay, hitbox, vật lý, giao thức mạng và server giữ nguyên.

- Mới: mưa (nhỏ/vừa/lớn, nghiêng theo gió), sấm chớp (chỉ đổi ánh sáng môi trường, không đèn động, có tiếng sấm trễ), gió, sương xa + sương sát đất, lá bay, bụi lơ lửng, tuyết, mặt đất ướt khi mưa, giọt mưa trên ống kính. Toàn bộ chuyển động hạt chạy trên GPU (shader), mật độ chỉnh bằng drawRange; không tạo/huỷ Mesh trong vòng lặp.
- Thời tiết theo bản đồ, đồng bộ nhiều người chơi bằng seed (PIN phòng + bản đồ + số vòng), không đổi giao thức, không gửi dữ liệu hạt.
- Tự giảm hiệu ứng theo FPS có hysteresis (4 bậc), tách khỏi Auto đồ họa nhưng nhường nhau (không đánh giá ngay sau khi Auto đổi mức).
- Cài đặt → Đồ họa → "Hiệu ứng môi trường": Low/Balanced/High/Ultra, bật/tắt từng hiệu ứng, mật độ, hiệu ứng camera, tự giảm theo FPS, Đặt lại mặc định; lưu localStorage (`hachihi.envfx`).
- Test mới `client/test/env.mjs` (cài đặt, seed đồng bộ, lịch sét, hysteresis, kết hợp mức). Xem `docs/18-environment-fx.md`.
- Files sửa: `client/src/gfx/sky.js` (uniform uFlash/uOvercast), `client/src/game/world.js` (tạo/cập nhật/dọn Weather, bỏ mưa phùn cũ khi bật Environment FX), `client/src/audio/audio.js` (`thunder`, `setRain`), `client/src/main.js` (nối cài đặt, adaptive, đồng bộ seed theo vòng, dọn khi thoát trận), `client/index.html`, `client/style.css`, `client/package.json`, `server/package.json` (chỉ số phiên bản), `docs/07-hieu-ung-moi-truong.md`.
- Files mới: `client/src/gfx/envlogic.js`, `client/src/gfx/weather.js`, `client/src/ui/envui.js`, `client/test/env.mjs`, `docs/18-environment-fx.md`.

## 0.4 — Hiệu năng & cài đặt đồ họa
Gameplay, mạng và server giữ nguyên (không đổi tốc độ, va chạm, recoil, spread, sát thương, hit detection, nội suy).

**P0**
- Sửa shader: `smoothstep` bị đảo ngưỡng ở hậu kỳ (tối góc) và ở bầu trời (đường chân trời).
- Auto thật: bộ điều khiển theo FPS mục tiêu (`gfx/autoq.js`) hạ/nâng đồng bộ bóng đổ, AO, hậu kỳ/bloom, hiệu ứng hạt và Render Scale; đo theo cửa sổ 3 giây, hạ ngay khi vượt ngân sách, chỉ nâng sau ≥ 10 giây ổn định, có giai đoạn thử + backoff (tối đa x8) để không nhấp nháy.
- Màn hình Cài đặt đồ họa: chế độ hiển thị, độ phân giải, giới hạn FPS, V-Sync, preset Auto/Low/Medium/High/Ultra/Custom, Render Scale 50–125% (bước 5%), bóng đổ, texture, AO, hậu kỳ, hiệu ứng, hiện FPS; có Áp dụng / Hoàn tác; đổi chế độ hiển thị có hộp xác nhận 15 giây và tự khôi phục (cả ở tiến trình Electron chính, phòng khi màn hình đen).
- Mặc định dùng độ phân giải gốc của màn hình (DPR); Render Scale tách khỏi độ phân giải hiển thị, HUD là DOM nên luôn nét.
- Test hồi quy: thêm test cho cài đặt, Auto (mô phỏng), thống kê frame time, hướng bề mặt vết đạn.

**P1**
- Gộp mesh tĩnh của map theo vật liệu: 189 mesh → 30 (`gfx/merge.js`); nhân vật gộp theo bộ phận; vết đạn dùng một InstancedMesh.
- Draw call giảm 64–67% trong benchmark (Low 249→90, Medium 515→165, High 1005→329).
- Bớt vật thể nhỏ đổ bóng (ống, vành, đèn, súng của đối thủ); dùng chung vật liệu đèn.
- Không biên dịch lại shader khi đổi mức: Auto chỉ đổi cờ/kích thước; shader biên dịch trước (`warmup`) khi vào trận; lọc dị hướng chỉ nạp lại khi đổi.
- Hậu kỳ kiểu FPS cạnh tranh: bỏ film grain và chromatic aberration, bloom nhẹ, tối góc nhẹ; các pass tạo một lần và bật/tắt bằng cờ.
- Hiệu ứng theo 4 mức (tia lửa, khói, vỏ đạn, đèn loé nòng, vết đạn, bụi, chùm sáng).

**Công cụ đo**
- F3: FPS, 1% low, frame time TB/P50/P95/P99, draw call, độ phân giải dựng.
- F4: benchmark 20 giây; báo cáo FPS TB, 1% low, 0.1% low (khi ≥ 1000 khung), frame time trung vị/P95/P99, thời gian vào trận, CPU/RAM (chỉ bản Windows); kết quả copy vào clipboard dạng JSON.

**Electron**
- `preload.js` + IPC: chế độ cửa sổ / không viền / toàn màn hình, kích thước cửa sổ, V-Sync (khởi động lại game), tần số quét màn hình.

## 0.3
Đồ họa PBR hoàng hôn, hậu kỳ, nhân vật có xương, súng chi tiết, hiệu ứng bắn, menu 3D, chọn máy chủ Render/LAN.

## 0.2
Vật lý bước cố định, nội suy snapshot, bù trễ phía server, giật súng, tản đạn.

## 0.9.4
- Sương mù theo độ cao, dither chống banding, biên dịch shader trước (xem docs/16).

## 0.9.5
- Thêm tư thế ngồi (client + server + hitbox), tab Phím điều khiển (đổi phím được), phản hồi khi bấm B. Xem docs/17.

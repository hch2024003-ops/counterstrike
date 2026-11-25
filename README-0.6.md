# HACHIHI Counter-Strike 0.6 — đồ họa 0.5 + âm thanh mới

## Cách cài (1 lần)
1. Giải nén zip này **đè lên thư mục gốc dự án** (cùng cấp với `client/` và `server/`).
2. `cd client && npm run build` (hoặc `npm start`).
3. Khởi động lại server để nhận `server/src/map.json` mới (hai file map phải giống hệt nhau).

## File thay đổi
- `client/src/gfx/shapes.js` (MỚI): bộ tạo hình bo cạnh, extrude profile, lathe, chi thon, gộp theo vật liệu.
- `client/src/gfx/guns.js`: súng trường / súng ngắn / shotgun dựng chi tiết; tay + găng có ngón. Giữ nguyên `muzzle`, `eject`, `len`.
- `client/src/gfx/characters.js`: lính chiến thuật tỷ lệ thật, 2 phe khác trang phục. Giữ nguyên API `Character`, `makeCorpse`, `updateCorpse`.
- `client/src/gfx/sky.js`: trời ban ngày trung tính, mặt trời cao (bỏ hoàng hôn cam).
- `client/src/gfx/environment.js`: ánh sáng trung tính, giảm emissive/bụi/chùm sáng, thêm cửa cuốn.
- `client/src/weapons/viewmodel.js`: ánh sáng trung tính, loé nòng dịu hơn, nhịp thở + rung khi thay đạn.
- `client/src/game/world.js`: chỉ đổi exposure 1.35 → 1.12.
- `client/assets/map.json` + `server/src/map.json`: bản đồ mới 113 khối (phòng bảo vệ, sàn thao tác cao 3.2m có cầu thang, bệ bốc dỡ, container xếp tầng). Spawn A/B giữ nguyên.

## Thêm ở 0.6 (âm thanh)
- `client/src/audio/audio.js`: viết lại, giữ nguyên API cũ. Tiếng súng nhiều lớp riêng cho súng trường/súng ngắn/shotgun, vang trong nhà và ngoài trời, bị chặn khi khác phòng, nhỏ và ục dần theo khoảng cách, stereo theo hướng nhìn.
- Bước chân theo bề mặt: bê tông, kim loại (sàn thao tác, cầu thang), sỏi bụi gần tường. Có thao tác thay đạn riêng từng súng, tiếng bơm shotgun, vỏ đạn rơi, gió ngoài trời và tiếng ù trong phòng. Không cần file âm thanh.
- `client/src/main.js`: chỉ thêm 2 dòng (`audio.setListener(...)` mỗi khung hình, và truyền loại súng vào `audio.reload`).

## Không đổi
Logic bắn, sát thương, spread, hit detection, đồng bộ server, vật lý (bước 0.45m, nhảy 1.31m).

## Đã kiểm tra
- Cú pháp mọi file; âm thanh chạy thử bằng WebAudio giả lập (không lỗi, nhưng chưa nghe thật); `client` test `core.mjs` (kể cả không xuyên tường) chạy OK với map mới.
- Spawn không bị chặn; có đường đi mặt đất từ spawn A tới spawn B.
## Chưa kiểm tra (môi trường không có mạng/trình duyệt)
- Hình ảnh thực tế và FPS: bạn chạy thử rồi gửi ảnh chụp + FPS để chỉnh tiếp.

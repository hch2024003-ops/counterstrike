# Benchmark 0.3 → 0.4

**Đọc kỹ trước khi dùng số liệu:** các số dưới đây đo trong Chromium headless chạy bằng CPU (SwiftShader, không có GPU), 480×270, 15 giây, 1 lần đo, cùng map / cùng góc nhìn / 4 bot / bắn liên tục. FPS tuyệt đối ở đây **không đại diện cho máy thật**; chỉ dùng để so sánh tương đối và đếm draw call. **Chưa có benchmark trên GPU thật**: cần đo trên ít nhất một máy GPU tích hợp, một máy gaming tầm trung và một máy GPU cao cấp (xem quy trình bên dưới) trước khi kết luận 0.4 đạt 144 FPS.

| Mức | Bản | FPS TB | Frame time trung vị | Draw call | Tam giác | Render Scale |
|---|---|---:|---:|---:|---:|---:|
| Low | 0.3 | 5.12 | 183 ms | 249 | 14 280 | 0.8 |
| Low | 0.4 | 5.07 | 200 ms | **90** | 15 810 | 0.9 |
| Medium | 0.3 | 2.13 | 433 ms | 515 | 30 095 | 1.0 |
| Medium | 0.4 | 2.46 | 400 ms | **165** | 26 565 | 1.0 |
| High | 0.3 | 1.22 | 800 ms | 1005 | 59 767 | 1.0 |
| High | 0.4 | 1.60 | 717 ms | **329** | 53 143 | 1.0 |

Ghi chú: Low 0.4 dựng nhiều điểm ảnh hơn 0.3 (0.9 so với 0.8) nên FPS bằng nhau nghĩa là nhanh hơn trên mỗi điểm ảnh. High 0.4 dùng AO 8 mẫu + MSAA x2 (0.3: AO 12 mẫu + MSAA x4), nên không hoàn toàn cùng cấu hình. Draw call giảm 64–67% là số chắc chắn; mức tăng FPS trên GPU thật phụ thuộc máy (thường lợi nhất khi CPU là nút thắt).

## Quy trình đo trên máy thật (đội Dev)
1. Cài bản 0.4, vào một phòng với cùng số bot/người chơi, đứng yên cùng một vị trí và góc nhìn.
2. Chọn mức đồ họa, tắt V-Sync và đặt giới hạn FPS "Không giới hạn" (mở lại game sau khi đổi V-Sync).
3. Nhấn **F4**, chờ 20 giây. Báo cáo gồm FPS TB, 1% low, 0.1% low, frame time trung vị/P95/P99, CPU/RAM (bản Windows), thời gian vào trận; JSON được copy vào clipboard.
4. Lặp ít nhất 3 lần mỗi mức: 1920×1080 Low / Medium / High, 2560×1440 High (nếu có), Auto khi GPU tải cao, cảnh nhiều hiệu ứng + nhiều người chơi.
5. Ghi bảng trước/sau cho 0.3 và 0.4 trên cùng máy. VRAM không đo được bằng API web.

## Test tự động đã chạy (khác với benchmark)
- `server`: `npm test` (smoke + combat) qua.
- `client`: `npm test` (core: vật lý, tương thích validator server, nội suy, recoil, spread, cài đặt, Auto mô phỏng, báo cáo FPS, hướng vết đạn) qua.
- Giao diện trong trình duyệt: Cài đặt, Áp dụng/Hoàn tác, Render Scale không làm lệch canvas/camera/HUD, lưu & khôi phục, localStorage hỏng, xác nhận/khôi phục hiển thị 15 giây (host Electron giả lập) qua.
- Trong trận: Auto tự hạ bậc và áp dụng thật vào renderer, F4 cho báo cáo, không lỗi JavaScript.
- **Chưa kiểm thử:** bản đóng gói Electron thật (chế độ không viền/toàn màn hình, V-Sync, khởi động lại) vì môi trường dựng không chạy được Electron có giao diện.

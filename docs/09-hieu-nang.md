# 09 – Hiệu năng: chống giật lag

**File:** `client/src/gfx/sky.js`, `merge.js`, `environment.js`, `grenadefx.js`, `characters.js`, `client/src/game/world.js`, `server/src/rooms/room.js`

## Phân biệt hai loại "lag"
- **Giật hình (FPS thấp):** bấm **F3** xem FPS. Dưới 45 FPS là lỗi phía hình ảnh.
- **Trễ mạng (ping cao):** cũng xem ở F3. Ping cao, đạn và di chuyển bị kéo lại là lỗi phía mạng/server (server Render miễn phí chậm khi ngủ dậy).

## Đã làm (từ 0.8.1)
1. **Bầu trời vẽ sau cùng:** shader mây tốn kém chỉ còn chạy ở vùng trời thật, không chạy trên pixel đã bị tường/đất che. Giảm tải GPU toàn màn hình.
2. **Chia khối tĩnh theo ô 30 m:** trước đây toàn bộ trang trí cùng vật liệu gộp thành một mesh khổng lồ nên luôn vẽ hết cả bản đồ. Giờ mỗi ô một mesh, phần ngoài tầm nhìn và ngoài vùng bóng bị bỏ qua.
3. **Bóng đổ bám theo người chơi trên bản đồ lớn (>64 m):** vùng bóng 80 m quanh bạn thay vì phủ cả 90 m, nét hơn và nhẹ hơn; làm tròn theo texel để không nhấp nháy. Cáp và mặt nước không đổ bóng.
4. **Khói nhẹ hơn:** tối đa 3 bom khói; số cụm khói theo mức hiệu ứng (22/14/8), cụm to hơn khi ít cụm.
5. **Nhân vật dựng súng và tay khi cần:** mỗi nhân vật không còn dựng sẵn 9 bộ súng + tay.
6. **Server dựng lưới đường đi của máy ngay ở phòng chờ:** tránh khựng ~70 ms lúc trận bắt đầu.

## Đo được ở server (mô phỏng 10 máy)
Trung bình khoảng 0,1 ms mỗi tick 33 ms trên Kho, Giza, Trường Thành, Cầu Cổng Vàng. Server không phải nút thắt khi chạy máy.

## Nếu vẫn giật
- Cài đặt đồ họa → chọn **Auto** hoặc hạ **Bóng đổ**/**Hiệu ứng**, giảm **Render Scale**.
- Bản đồ nặng nhất là Giza, Trường Thành, Cầu Cổng Vàng (có mưa). Thử Hồ Gươm để so sánh.
- Gửi kèm: bản đồ, có máy hay không, số FPS/ping ở F3, cấu hình máy (card đồ họa).

## Cập nhật 0.8.2 – card đồ họa và chạy nền
- **Ép dùng card đồ họa rời** (`force_high_performance_gpu`) trong `client/electron/main.js`. Trên laptop có hai card (Intel + NVIDIA/AMD), Chromium hay chọn nhầm card tích hợp, đây là nguyên nhân giật nặng phổ biến nhất của game WebGL. Bản cài đặt Windows cũng nên đặt **Windows Settings → Display → Graphics → HACHIHI → High performance**.
- **Mất focus** (đang dùng ứng dụng khác): game chỉ vẽ ~15 hình/giây, giảm tải GPU/CPU.

## Server Node có làm lag không?
Không phải nguồn FPS thấp: server chỉ lo mạng và luật chơi, đo được khoảng 0,1 ms mỗi tick khi có 10 máy. FPS do client (WebGL trong Electron) quyết định. Server chỉ ảnh hưởng **ping** (server Render miễn phí chậm, ngủ dậy chậm).

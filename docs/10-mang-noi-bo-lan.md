# 10 – Chơi trong mạng nội bộ (LAN): ít lag nhất, tận dụng card đồ họa

## Cách chạy
1. Chọn **một máy làm chủ** chạy `run-server-lan.bat` (giữ cửa sổ mở). Tốt nhất là máy mạnh nhất hoặc một máy riêng chỉ chạy server; nếu máy chủ vừa chạy server vừa chơi thì tốn thêm CPU.
2. Các máy khác nhập địa chỉ IP của máy chủ trong game. Nếu không vào được: cho phép Node.js qua Windows Firewall (Private network).
3. Nên dùng **dây mạng**. Wi-Fi gây giật ping, đặc biệt khi nhiều máy.

## Chế độ LAN của server (đã làm sẵn trong `run-server-lan.bat`)
- `HACHIHI_LAN=1`: server chạy **60 tick/giây** (thay vì 30) và độ trễ nội suy **50 ms** (thay vì 100). Đối thủ hiện đúng vị trí mới hơn, bắn trúng phản hồi nhanh hơn.
- Client tự nhận giá trị nội suy từ server khi vào phòng (`joined.interpMs`), không cần cấu hình thêm.
- Với 10 máy chơi, server vẫn chỉ tốn khoảng 0,1 ms mỗi tick.

## Phần client/GPU (đã làm trong code)
- Ép dùng **card đồ họa rời** và đường dẫn **Direct3D 11** (`force_high_performance_gpu`, `use-angle=d3d11`), bật gpu-rasterization, zero-copy.
- Không giảm tải khi cửa sổ bị Windows coi là bị che; vẫn chỉ vẽ ~15 hình/giây khi bạn thực sự chuyển sang ứng dụng khác.
- Khử răng cưa phần cứng (MSAA) tự tắt ở màn hình trên 2560×1440 vì rất tốn GPU.

## Bạn nên đặt trên máy chơi (không cần sửa code)
1. **Windows Settings → System → Display → Graphics → HACHIHI → Options → High performance.**
2. **NVIDIA Control Panel → Manage 3D settings → Power management mode = Prefer maximum performance** (AMD: Graphics profile = Esports). Cập nhật driver mới nhất.
3. Windows **Power plan = High performance**; bật **Game Mode**; cắm sạc nếu dùng laptop.
4. Trong game: chế độ **Toàn màn hình**, **tắt V-Sync**, **giới hạn FPS bằng tần số quét màn hình** (ví dụ 144), **Render Scale 85–100%**, mức đồ họa **Auto** hoặc Medium nếu card yếu.
5. Đóng trình duyệt nặng và ứng dụng chạy nền khi chơi.

## Nếu vẫn thấp FPS
Hạ **Bóng đổ** và **Hiệu ứng**, hạ **Render Scale**, hoặc chọn bản đồ nhẹ hơn (Hồ Gươm). Gửi FPS ở **F3**, tên card đồ họa và bản đồ để chỉnh tiếp.

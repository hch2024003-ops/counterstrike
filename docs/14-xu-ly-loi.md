# 14 – Xử lý lỗi và chẩn đoán

## Bảng báo lỗi trong game (từ 0.9.4)
Mọi lỗi JavaScript, lỗi promise và lỗi shader đồ họa hiện thành **khung đỏ ở đầu màn hình** (kèm 6 dòng đầu của lỗi). Chụp khung đó gửi lại là đủ để sửa. Nhấn **F12** để mở Console xem chi tiết.

## Tự bảo vệ
- Shader "bám bẩn/vũng nước" hoặc "làm nét" bị lỗi biên dịch trên card đồ họa của máy: game báo lỗi và **tự tắt riêng hiệu ứng đó**, phần còn lại vẫn chạy (không còn cảnh đen).
- Mã ngắm/ném lựu đạn chạy mỗi khung hình được bọc `try/catch`: nếu lỗi, báo một lần và game tiếp tục.

## Sửa trong bản 0.9.4
- `run-server-lan.bat` và các file `.bat` đổi sang kết thúc dòng chuẩn Windows (CRLF). Trước đây file trộn LF/CRLF nên dòng `set HACHIHI_LAN=1` có thể dính ký tự thừa, làm chế độ LAN (60 tick/giây) không bật.
- `server/test/combat.js` cập nhật theo kiến trúc mỗi phòng một bản đồ.

## Đã kiểm tra bằng máy chủ thật
Chạy `server.js` thật qua WebSocket (bản thay thế `ws` tối giản) với bản 0.9 và 0.9.3: toàn bộ `test/smoke.js` qua ở cả hai; kịch bản tạo phòng → thêm máy → chọn bản đồ → bắt đầu → mua đồ → ngắm → di chuyển → bắn → ném lựu đạn chạy 3 giây không làm server sập. Máy chủ không phải nguyên nhân khi bản 0.9.3 không vào được phòng.

## Nếu vẫn lỗi khi vào phòng
1. Mở game, thử vào phòng; nếu có khung đỏ, chụp gửi lại.
2. Nếu không có khung đỏ: nhấn F12 → tab Console, chụp các dòng đỏ.
3. Kiểm tra cả hai máy dùng **cùng một bản** (server và client cùng 0.9.4); bản cũ và mới không nên trộn.

## Game chớp đen rồi tự tắt (từ 0.9.5 / 0.10.2)
Khi chạy `run-second-client.bat` cửa sổ cmd trước đây đóng ngay nên lỗi bị mất. Từ nay:
- Cửa sổ cmd **không tự đóng** và in 15 dòng cuối của nhật ký; đầy đủ ở `client\hachihi-client.log`. Gửi file này hoặc ảnh chụp để xác định lỗi.
- Lỗi ở tiến trình chính hiện thành hộp thoại thay vì im lặng; lỗi của trang game và lỗi tiến trình GPU được ghi vào nhật ký.
- **Chế độ an toàn đồ họa**: chạy `run-client-an-toan.bat` (tắt ép card rời, ANGLE D3D11, zero-copy, gpu-rasterization). Nếu GPU sập 2 lần liên tiếp, game tự bật chế độ này ở lần mở sau (xoá file `safe-gfx.flag` trong thư mục dữ liệu của game để tắt).
- Nếu chế độ an toàn chạy được còn chế độ thường thì tắt: nguyên nhân là một công tắc GPU không hợp với card/driver của máy đó.

## "Electron failed to install correctly" (game không mở được)
Nguyên nhân: lúc `npm install`, bước tải file chạy của Electron (khoảng 100 MB từ GitHub) bị gián đoạn hoặc bị chặn, nên thư mục `client\node_modules\electron` thiếu file `path.txt`. Đây là lỗi cài đặt, không phải lỗi mã game.
- Từ 0.9.6/0.10.3, mọi file `.bat` mở game **tự kiểm tra** và tự chạy `sua-loi-electron.bat` nếu Electron hỏng.
- `sua-loi-electron.bat` xoá Electron hỏng, cài lại; nếu GitHub bị chặn thì thử máy chủ dự phòng `npmmirror`.
- Nếu vẫn không được: tắt tạm phần mềm diệt virus, kiểm tra mạng, hoặc cài **Node.js LTS 22** (bản "Current" mới nhất đôi khi chưa tương thích tốt với công cụ cài Electron).
- Nên đặt thư mục game ở đường dẫn đơn giản như `D:\HACHIHI` (tránh tên thư mục có dấu ngoặc như `files (3)`).

## Lỗi ".log was unexpected at this time"
Do đường dẫn có dấu ngoặc `(3)`: trong file `.bat`, dấu `)` trong đường dẫn làm khối lệnh `if (...)` kết thúc sớm. Các file `.bat` đã được viết lại không dùng khối lệnh có đường dẫn, nên chạy được cả khi thư mục có ngoặc hay khoảng trắng.

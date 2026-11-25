# 15 – Tiệm net / máy mạnh: thư viện đồ họa cài sẵn, texture chất lượng cao, Auto theo card

## Ý tưởng
Máy tiệm net có ổ đĩa lớn và card đồ họa khoẻ, lại thường dùng phần mềm khôi phục và nhiều tài khoản người dùng. Vì vậy:
1. Tài nguyên đồ họa đặt **một lần, dùng chung cho cả máy**, không nằm trong hồ sơ từng người.
2. Có thể **tạo texture chất lượng cao ngay trên máy** (không cần tải gì từ internet).
3. Game **nhận ra card mạnh** và tự bắt đầu ở mức đồ họa cao hơn.

## 1. Thư mục tài nguyên dùng chung (cho cả máy)
Game đọc (chỉ đọc) các thư mục sau, ưu tiên từ cao xuống thấp: gói người dùng cài > thư mục dùng chung > gói đi kèm bộ cài.
- `%ProgramData%\HACHIHI\assets` (khuyên dùng)
- `hachihi-assets` cạnh file chạy của game
- Thư mục trong biến môi trường `HACHIHI_ASSETS_DIR` (ví dụ ổ mạng của tiệm)
Mỗi thư mục là một gói có `manifest.json` (tạo bằng `node client/tools/pack-assets.js`). Dùng `trien-khai-thu-vien-do-hoa.bat "<thư mục nguồn>"` để chép gói vào `%ProgramData%` (chạy bằng quyền quản trị). Nếu máy dùng Deep Freeze hay tương tự, đặt thư mục ở ổ/phân vùng **không bị đóng băng**, hoặc đặt biến `HACHIHI_ASSETS_DIR` trỏ tới đó.
Mở **Thư viện đồ họa** trong menu game: gói ở thư mục dùng chung hiện nguồn "shared"; nút **Xác minh** kiểm tra SHA-256 từng file.

## 2. Texture PBR chất lượng cao tạo tại máy
`tao-texture-chat-luong-cao.bat` (hoặc `node client/tools/gen-textures.js [đích] --size 2048`) tạo cho **8 loại bề mặt** (gạch, đá, cát, vữa, gạch lát, cỏ, kim loại, gỗ) bộ ba ảnh **albedo + normal + roughness** liền mạch, mặc định 2048 px (`--size 1024|2048|4096`, `--all` thêm bê tông, nhựa đường, gỉ sét).
- Chạy một lần (khoảng một phút), ghi gói đầy đủ có `manifest.json`, SHA-256 và giấy phép CC0 (tạo bằng thuật toán, không dùng nguồn ngoài).
- Game tự nạp khi khởi động và **dựng lại bản đồ** với texture mới; thiếu hoặc lỗi thì dùng texture vẽ nhanh như cũ.
- Albedo được tạo trung tính để nhân với màu của từng khối trong bản đồ, nên mọi bản đồ dùng chung một bộ texture.
- **Bộ nhớ card đồ họa:** texture chỉ lên GPU khi bản đồ dùng đến. Ước lượng chưa nén: khoảng 60–70 MB mỗi loại ở 2048 px, mỗi bản đồ dùng 3–5 loại. Card dưới 4 GB nên dùng `--size 1024` (mỗi loại khoảng 16 MB). Nén KTX2 để giảm VRAM là bước sau.
- Kiểm thử: texture tuần hoàn chính xác (ghép gạch không có đường nối), normal hợp lệ, PNG giải mã đúng, kết quả xác định, gói qua kiểm tra manifest/SHA-256 (`client/test/assets.mjs`).

## 3. Auto theo card đồ họa
Game đọc tên card (`WEBGL_debug_renderer_info`) và phân hạng: 3 = rất mạnh (RTX 2060 trở lên, RX 6700 trở lên), 2 = mạnh (GTX 10/16, RX 5xx/Vega 56...), 1 = trung bình/không rõ, 0 = tích hợp hoặc yếu. Auto bắt đầu ở bậc tương ứng:
- hạng 3: **Ultra** (bóng 4096, AO mức 2, hậu kỳ 2, hiệu ứng tối đa, render scale 100%);
- hạng 2: Cao với AO; hạng 1: Cao; hạng 0: bậc thấp.
Sau đó Auto vẫn tự tăng/giảm theo FPS thực tế, nên đoán sai hạng không gây hại. Mở console (F12) để xem dòng `[gfx] card đồ họa: ... · hạng N`.

## Chưa kiểm chứng
Hình ảnh thực tế và FPS trên card thật chưa được chạy thử (môi trường làm việc không có trình duyệt/GPU). Phần texture được kiểm tra bằng cách xem ảnh sinh ra và bằng test tự động, nhưng cách chúng hiện trên tường trong game cần bạn nhìn thử.

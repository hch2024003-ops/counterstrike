# HACHIHI Counter-Strike 0.7 – tổng quan thay đổi

Tài liệu từng tính năng nằm trong thư mục `docs/`:

| File | Nội dung |
|---|---|
| `01-luat-phong.md` | Người cuối cùng tự rời phòng; phòng không tự đóng |
| `02-tien-va-mua-do.md` | Tiền, thưởng thắng/thua theo chuỗi, menu mua đồ, tuỳ chọn phòng |
| `03-vu-khi-moi-va-xuyen-tuong.md` | 9 loại súng, giáp, bắn xuyên tường |
| `04-luu-dan-va-bom-khoi.md` | Lựu đạn, bom khói |
| `05-am-thanh.md` | Âm thanh tổng hợp bằng code |
| `06-ban-do.md` | 7 bản đồ từ nhỏ đến rất lớn, địa danh |
| `07-hieu-ung-moi-truong.md` | Thời tiết, trời, nổ, khói |
| `08-may-choi-chung.md` | Máy chơi chung 5 cấp độ, chủ phòng thêm/chia đội |
| `09-hieu-nang.md` | Chống giật lag, cách đo FPS/ping |
| `10-mang-noi-bo-lan.md` | Chạy LAN ít lag, cài đặt card đồ họa |
| `11-do-hoa-chan-that.md` | Bề mặt bẩn/ướt, vết đạn, vết cháy, vải sheen; giới hạn và hướng dùng asset thật |
| `12-nem-bom-va-ong-ngam.md` | Giữ-để-canh/thả-để-ném bom, nhảy ném xa, ống ngắm bắn tỉa |
| `13-thu-vien-do-hoa-offline.md` | Thư viện tài nguyên offline, GLB/PBR pipeline (Phase 1) |
| `14-xu-ly-loi.md` | Bảng báo lỗi, tự tắt shader lỗi, cách chẩn đoán |
| `15-tiem-net-thu-vien-san.md` | Tiệm net: thư viện dùng chung, texture 2K tạo tại máy, Auto theo card |
| `../README-0.6.md` | Đồ họa 0.5 (nhân vật, súng, ánh sáng) |

Trong game có màn **Hướng dẫn chơi** (nút ở menu và phòng chờ), nội dung lấy từ dữ liệu thật.

## Chạy kiểm thử
```
cd server && node test/economy.js && node test/maps.js && node test/bots.js     # không cần mạng
cd client && node test/core.mjs && node test/maps.mjs      # không cần trình duyệt
```
(`node test/smoke.js` và `node test/combat.js` cần `npm install` ở `server/` để có thư viện `ws`.)

## Chưa kiểm chứng bằng mắt
Hình ảnh và FPS thực tế chưa được chạy thử trên trình duyệt. Nếu có lỗi hiển thị, chụp ảnh/console gửi lại để chỉnh.

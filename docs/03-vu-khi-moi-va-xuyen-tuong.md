# 03 – Vũ khí mới và bắn xuyên tường

**File:** `server/src/combat/weapons.js` (bảng súng), `server/src/combat/hitscan.js` (`traceRayPen`), `server/src/game/map.js` (`rayBoxesAll`), `client/src/gfx/guns.js` (model), `client/src/weapons/weapons.js`

## Bảng súng (9 khẩu)
| Súng | Loại | Giá | Sát thương | Nhịp (ms) | Xuyên tường | Ghi chú |
|---|---|---|---|---|---|---|
| Súng lục | phụ | có sẵn | 24 | 180 | 25% | |
| Desert Eagle | phụ | $650 | 55 | 320 | 50% | một phát vào đầu gần hạ |
| Tiểu liên | chính | $1200 | 20 | 62 | 20% | chạy vừa bắn ít lệch |
| Shotgun | chính | $1100 | 8×11 | 850 | 10% | |
| Shotgun tự động | chính | $1800 | 8×10 | 260 | 10% | |
| AK-47 | chính | $2700 | 33 | 105 | 70% | giật mạnh |
| Súng trường | chính | $2900 | 27 | 100 | 55% | chính xác hơn AK |
| Bắn tỉa | chính | $4750 | 115 | 1400 | 100% | một phát hạ gục, xuyên tường dày nhất |
| Đại liên | chính | $5200 | 29 | 85 | 80% | 100 viên, thay đạn 5 giây |

Mỗi người giữ 1 súng chính + 1 súng phụ. Mua súng cùng loại sẽ thay súng cũ. Sửa thông số ở một nơi duy nhất (`server/src/combat/weapons.js`), client tự nhận khi vào phòng.

## Bắn xuyên tường
- Độ dày tường xuyên được tối đa = `pen × 0.85 m` (súng lục 0.21 m, AK 0.6 m, bắn tỉa 0.85 m).
- Mỗi lớp tường xuyên qua làm sát thương giảm tới 40% (tỉ lệ với độ dày).
- Tường bao dày 1 m và container (2.6 m) chặn mọi loại đạn; vách văn phòng 0.3 m, lan can, tường mỏng thì xuyên được.
- Xuyên tường chỉ trúng người đầu tiên trên đường đạn. Tin `shot` có cờ `wb:1` khi đạn đã xuyên tường.

## Model
Mỗi súng có model riêng dựng bằng code (profile, ray, ống ngắm, hộp tiếp đạn…), cả góc nhìn thứ nhất lẫn nhân vật. Vị trí nòng và cửa thoát vỏ đạn có sẵn trong từng model.

## Kiểm thử
`node server/test/economy.js` có ca xuyên tường (súng yếu bị chặn, súng trường xuyên vách 0.3 m và sát thương giảm).

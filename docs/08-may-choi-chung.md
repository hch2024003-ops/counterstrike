# 08 – Máy chơi chung (bot) với 5 cấp độ

**File:** `server/src/game/bots.js` (bộ não + đường đi), `server/src/rooms/room.js` (`addBot`, `removeBot`, `moveMember`), `server/src/network/connection.js`, `client/src/ui/ui.js`, `client/src/main.js`, `server/test/bots.js`

## Cách dùng (chủ phòng)
1. Ở phòng chờ, mỗi đội có ô chọn **cấp độ** và nút **＋ Thêm máy**.
2. Mỗi dòng trong danh sách đội có nút **⇄** (chuyển sang đội kia) cho cả người lẫn máy; máy có thêm nút **✕** để xoá.
3. Mỗi đội tối đa 5 (người + máy). Chỉ chủ phòng chỉnh được, và chỉ ở phòng chờ.
4. Khi người thật cuối cùng rời phòng, máy bị dọn và phòng đóng (máy không ở lại một mình).

## 5 cấp độ
| Cấp | Phản xạ | Sai số ngắm | Cách đánh | Ghi chú |
|---|---|---|---|---|
| 1 Dở | 1,0 s | rất lớn | lao thẳng vào, xả đạn dài | tầm nhìn hẹp, chỉ nhớ đối thủ 1,5 s, hay nhắm thân |
| 2 Thường | 0,65 s | lớn | đứng ngang bắn | nhớ 3 s |
| 3 Khá | 0,42 s | vừa | dừng lại để bắn loạt ngắn rồi di chuyển | biết ném lựu đạn, mua giáp |
| 4 Giỏi | 0,25 s | nhỏ | như Khá, quay ngắm nhanh | nhớ 6 s, nhắm đầu 50% |
| 5 Xuất sắc | 0,15 s | rất nhỏ | như Giỏi | nhắm đầu 60%, bắn xuyên tường vào chỗ đối thủ vừa biến mất nếu súng xuyên tốt |

## Luật chơi giống người
- Máy bắn bằng cùng hàm `handleShoot` như người: cùng tản đạn (đứng im bắn chuẩn hơn), sát thương, xuyên tường.
- Thấy đối thủ bằng tia nhìn có góc nhìn giới hạn; tường và bom khói che được máy.
- Có tiền và mua đồ trong thời gian đóng băng (cấp thấp mua lung tung, cấp cao mua súng trường/AK, giáp, lựu đạn); kiếm thưởng như người.
- Bị bắn thì quay về phía người bắn.

## Đường đi
Lưới 0,5 m dựng cho từng bản đồ, tìm đường A* rồi làm thẳng đường. Máy chỉ đi trên mặt đất, nên **không** lên sàn thao tác, tường thành hay đỉnh kim tự tháp (người chơi thì lên được). Khi kẹt hơn 1 giây máy chọn đích khác.

## Giao thức
| Hướng | Tin |
|---|---|
| client → server | `{t:'addbot', team:'A'|'B', level:1..5}` |
| client → server | `{t:'removebot', id}` |
| client → server | `{t:'moveto', id, team}` (người hoặc máy) |
| server → client | `room.players[]` có thêm `bot:1, lvl` |

## Kiểm thử
`node server/test/bots.js` (không cần mạng): quản lý máy, quyền chủ phòng, đội đầy, đóng phòng, đường đi trên mọi bản đồ, mô phỏng trận (cấp cao thắng cấp thấp), giao tranh trên Paris/Giza/Cầu Cổng Vàng.
Mô phỏng 6–12 vòng, 3 máy mỗi bên trên bản đồ kho: Thường thắng Dở 36:5, Giỏi thắng Thường áp đảo, Xuất sắc thắng Giỏi 35:14.

## Hạn chế
Máy chưa dùng bom khói, chưa lên tầng cao, chưa phối hợp chiến thuật theo đội. Độ khó thực tế với người chơi cần bạn thử và phản hồi để chỉnh bảng cấp độ ở `LEVELS` trong `bots.js`.

# 02 – Tiền, thưởng vòng và mua đồ

**File:** `server/src/config.js`, `server/src/game/match.js`, `server/src/combat/combat.js` (hàm `buy`), `server/src/rooms/player.js`, `client/src/ui/shop.js`

## Quy tắc
- Bắt đầu trận: mỗi người **$800**, chỉ có súng lục.
- Mua đồ được khi đóng băng đầu vòng (9 giây) và 10 giây đầu của vòng (`BUY_LIVE_MS`).
- **Thắng vòng:** $3250 + $150 × số vòng thắng liên tiếp (tối đa 4 vòng thưởng thêm).
- **Thua vòng:** $1400 + $500 × số vòng thua liên tiếp trước đó (tối đa chuỗi 4, tức $3400). Hoà: cả hai nhận $1400.
- **Hạ gục:** thưởng theo súng (`reward` trong bảng súng). Tự sát (lựu đạn của mình) không tính hạ gục.
- Tối đa $16000.
- Còn sống đến hết vòng: giữ súng, giáp, lựu đạn. Chết: mất hết, quay về súng lục.
- Chỉ còn một bên trong phòng: không phát thưởng (trận không tính điểm).

## Tuỳ chọn phòng (chủ phòng đặt ở phòng chờ)
- `economy` (mặc định bật): tắt thì chơi "cổ điển", có sẵn súng trường + súng lục + shotgun, không cần mua.
- `rounds`: số vòng thắng (3–16).

## Giao thức
| Hướng | Tin | Ý nghĩa |
|---|---|---|
| client → server | `{t:'buy', item}` | mua súng (`ak`, `smg`…) hoặc `armor`, `frag`, `smoke` |
| client → server | `{t:'settings', economy, rounds}` | chỉ chủ phòng, chỉ ở phòng chờ |
| server → client | `self` có thêm `money, armor, owned, nades` | trạng thái của bạn |
| server → client | `bought` / `buyerr {msg}` | mua được / lý do không mua được |
| server → client | `reward {amount, kind, streak}` | tiền cuối vòng |

## Giao diện
Phím **B** mở menu mua. Mua bằng phím số hiện bên cạnh từng món (`1`–`9`, `0`, `Q`) mà vẫn chạy/ngắm được; hoặc nhả chuột (Esc) rồi bấm chuột vào món.

## Kiểm thử
`node server/test/economy.js` (không cần mạng) kiểm tra mua đồ, thưởng, chuỗi thắng/thua, chế độ cổ điển.

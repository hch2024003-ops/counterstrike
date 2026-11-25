# 01 – Luật phòng: người cuối cùng tự rời phòng

**File đổi:** `server/src/rooms/room.js`, `server/src/game/match.js`

## Trước đây
Khi một đội hết người giữa trận hai đội, server tự huỷ trận và kéo mọi người về phòng chờ.

## Bây giờ
- Server **không** tự huỷ trận, không đuổi ai. Phòng chỉ biến mất khi người cuối cùng bấm **Rời phòng** (hoặc rớt mạng quá 30 giây).
- Khi còn một bên hoặc một người, server gửi tin `notice` (`code: one_side` hoặc `last_player`) cho người còn lại.
- Chế độ "một bên": không loại đối thủ để kết thúc vòng, hết giờ vòng **không tính điểm**, trận không tự kết thúc. Người chơi tập bắn, đi bản đồ, mua đồ thoải mái.
- Chủ phòng tự chuyển cho người còn lại như cũ.

## Tin nhắn mới
```json
{ "t": "notice", "code": "one_side" | "last_player", "msg": "..." }
```

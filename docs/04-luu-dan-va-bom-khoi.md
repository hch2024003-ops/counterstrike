# 04 – Lựu đạn và bom khói

**File:** `server/src/game/grenades.js`, `server/src/combat/combat.js` (`handleThrow`), `client/src/gfx/grenadefx.js`

## Cách chơi
- Mua ở menu (B): lựu đạn $300, bom khói $300, tối đa 1 mỗi loại. Phím **G** ném lựu đạn, **H** ném bom khói, theo hướng đang nhìn.
- Quả bay theo vòng cung, nảy khi chạm tường/sàn, lăn rồi dừng.

## Lựu đạn
- Nổ sau 1,8 giây. Bán kính 8 m, sát thương tối đa 140 giảm theo khoảng cách.
- Bị tường chắn mảnh (kiểm tra tia từ tâm nổ tới thân người).
- Không hại đồng đội; tự ném trúng mình chịu 60% sát thương. Hạ gục bằng lựu đạn được thưởng $300.

## Bom khói
- Nổ sau 1,4 giây, tồn tại 18 giây (3 giây cuối tan dần).
- Đám khói dày che tầm nhìn bằng hình ảnh. Đạn bay xuyên khói bình thường.
- Tối đa 4 đám khói hiển thị cùng lúc (tối ưu hiệu năng).

## Giao thức
| Hướng | Tin |
|---|---|
| client → server | `{t:'throw', kind:'frag'|'smoke', ...tư thế}` |
| server → client | `throw {id, kind}`, `boom {p}`, `smoke {id, p, ms}`; `snap.g = [[id, kind, x, y, z], ...]` vị trí quả đang bay |

## Hiệu ứng
Nổ: loé sáng, cầu lửa, khói đen, tia lửa, rung màn hình theo khoảng cách. Âm thanh nổ sâu, vang theo môi trường.

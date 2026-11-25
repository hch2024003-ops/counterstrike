# 16 – Đồ họa đợt 1 (không cần asset mới)

**File:** `client/src/gfx/heightfog.js` (mới), `client/src/gfx/post.js`, `client/src/game/world.js`

## Đã làm
1. **Sương mù theo độ cao** (`heightfog.js`): vá chunk fog của Three.js; sương dày sát đất, mỏng dần khi lên cao. Chỉnh `HEIGHT_FOG.strength` (0 = tắt) và `falloff`. Nếu bản Three.js không khớp chuỗi cần vá, tự bỏ qua và giữ sương mù cũ.
2. **Dither** trong bước grade (hậu kỳ): chống vệt bậc thang ở trời/sương mù.
3. (đã gỡ ở 0.9.5: main.js đã có world.warmup sẵn)

## Chưa làm (cần asset hoặc cần chạy thử trên GPU thật)
Model nhân vật/súng GLB, texture PBR KTX2, lightmap/probe, CSM, SSR, nước, thực vật, soft particles, decal chiếu lên mặt cong.

## Cần kiểm tra bằng mắt
Chạy từng bản đồ (đặc biệt Cầu Cổng Vàng, Giza) so sánh trước/sau; nếu sương quá nhạt/đậm chỉnh `HEIGHT_FOG`.

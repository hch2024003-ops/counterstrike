# 11 – Đồ họa chân thực hơn (bề mặt, vết đạn, vải)

**File:** `client/src/gfx/surfacefx.js` (mới), `client/src/gfx/textures.js`, `client/src/gfx/characters.js`, `client/src/game/world.js`

## Đã làm
1. **Shader bề mặt theo toạ độ thế giới** (`enhanceMaterial`), áp cho mọi vật liệu bản đồ:
   - phá lặp texture: màu biến thiên quy mô lớn trên tường/sàn, nhìn không còn như ô vuông lặp lại;
   - **bám bẩn ở chân tường** (tối và hơi nâu dần về phía sàn), chỉ trên mặt đứng nên sàn không bị tối;
   - **vệt nước chảy** nhẹ ở phần trên tường.
   Tự tắt khi mức hiệu ứng đồ họa thấp (`fx = 0`).
2. **Vết đạn bám lại** trên tường (tối đa 72, tồn tại ~28 giây rồi mờ dần) và **vết cháy** trên sàn sau khi lựu đạn nổ.
3. **Vải có lớp sheen** (ánh mờ ở rìa) cho áo quần nhân vật, bớt cảm giác nhựa.

## Giới hạn (nói thẳng)
Đây là các cải tiến bằng shader và texture sinh bằng code. **Chúng không thay được tài nguyên của một artist**: nhân vật vẫn dựng từ hình khối, công trình vẫn từ khối hộp, nên chưa thể giống CS2. Bước nhảy lớn nhất về độ chân thực là dùng asset thật:
- **Texture PBR thật** (gạch, bê tông, kim loại, gỗ; có ảnh màu + normal + roughness): CC0 tại Poly Haven, ambientCG.
- **Model nhân vật và súng có rig/UV** (GLB): Quaternius, Kenney (CC0), hoặc thuê artist; Sketchfab lọc giấy phép CC0/CC-BY.
- **HDRI bầu trời thật** cho phản chiếu: Poly Haven.
Mình không tải được asset từ internet trong môi trường làm việc này; khi bạn có file, bước tiếp theo là thêm bộ nạp GLB và texture PBR từ thư mục `client/assets/` (hiện chưa có).

## Chi phí hiệu năng
Shader bề mặt thêm vài phép nhiễu trên mỗi pixel; decal rất nhẹ (72 quad). Nếu FPS giảm rõ, hạ mức **Hiệu ứng** trong Cài đặt đồ họa để tắt cả hai.

## Cập nhật 0.9.3
- **Vũng nước đọng phản chiếu** trên sàn (độ ẩm theo bản đồ: `theme.wet`, Cầu Cổng Vàng ướt nhất, Giza khô): sàn có chỗ sẫm, bóng, phản chiếu bầu trời. Tắt cùng bẩn/vết nước khi mức hiệu ứng thấp.
- **Hậu kỳ:** làm nét nhẹ (unsharp mask, giới hạn viền sáng) và phân tông màu (bóng đổ hơi lạnh, vùng sáng hơi ấm).
- **Chi tiết kho hàng** (`decor` trong `warehouse.json`, sinh bởi `tools/maps.py`): dải vàng quanh tường, hai hàng ống kim loại có giá đỡ dọc bốn tường, vạch sơn làn đi và vạch dừng trên sàn, vạch qua đường, sọc vàng-đen dưới mép bệ bốc dỡ, viền vàng hai sàn thao tác. Bản đồ khác đã có decor riêng.

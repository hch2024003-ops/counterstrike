# 13 – Thư viện đồ họa offline (nền tảng cho model GLB/PBR) – Phase 1

**File mới:** `client/shared/assetManifest.cjs`, `client/electron/assetstore.js`, `client/src/gfx/{assetManager,assetLoader,modelCache,materialLibrary,animationManager,animLogic,lodManager,visuals,glbCharacter}.js`, `client/src/ui/assetsui.js`, `client/tools/{pack-assets,gen-keys,sign-manifest,make-sample-glb}.js`, `client/assets/*`, `client/test/assets.mjs`

## Đã làm (đã kiểm thử bằng Node)
- **Manifest** (`assetManifest.cjs`): mỗi asset có id, version, path tương đối, size, SHA-256, package, kiểu nén, phụ thuộc, LOD, giấy phép. Từ chối đường dẫn nguy hiểm (`..`, tuyệt đối, ổ đĩa, `\`), file thực thi/JS, thiếu giấy phép, id trùng, vòng phụ thuộc, URL không phải https.
- **Asset Store** (`assetstore.js`, tiến trình chính Electron): gói đi kèm (Core Pack) + gói cài thêm; xác minh SHA-256/kích thước; cài từ thư mục **nguyên tử có hoàn tác** (lỗi giữa chừng khôi phục bản cũ, không để thư mục tạm); tải từ xa **chỉ qua manifest ký Ed25519** (khoá công khai nhúng trong app, URL lấy từ `assets/update.json` đi kèm bộ cài, không nhận từ server game), **tiếp tục tải (Range)**, xác minh sau tải, kiểm tra dung lượng; gỡ gói.
- **Giao thức `hasset://`**: chỉ phục vụ file hợp lệ trong thư mục gói và bộ giải mã Draco/KTX2 trong `dist/decoders` (copy lúc build từ three). Không CDN.
- **Công cụ:** `pack-assets.js` (sinh manifest, bắt buộc giấy phép), `gen-keys.js`, `sign-manifest.js`, `make-sample-glb.js`.
- **Đóng gói:** Core Pack + manifest vào `extraResources`; `dist/decoders` vào `files`.

## Đã viết nhưng CHƯA chạy thử (cần three + GLB thật)
- `assetLoader.js` (GLTFLoader + Draco + KTX2 + Meshopt, tiến độ, timeout), `modelCache.js` (cache theo id, clone skeleton đúng cách, đếm tham chiếu, dispose an toàn), `materialLibrary.js` (preset PBR theo tên material, anisotropy theo mức đồ họa), `animationManager.js`, `lodManager.js`, `glbCharacter.js`, bảng "Thư viện đồ họa" trong menu.
- **Tích hợp có fallback:** `characters.js` dùng GLB nếu có binding cho phe A/B, `guns.js` dùng GLB súng nếu có, `environment.js` hỗ trợ decor `{ "k": "model", "model": "<asset id>" }`. **Chưa có asset nên game vẫn dùng model dựng bằng code; gameplay không đổi.**

## Chưa làm (các phase sau)
- Chính **model và texture thật** (nhân vật, súng, kho hàng): cần Blender/artist hoặc asset CC0; mình không tải được asset từ internet.
- Nạp model môi trường theo bản đồ, tự gộp instancing, culling/shadow manager riêng, KTX2 mipmap streaming, benchmark GPU thật (P95/P99), báo cáo license toàn bộ.
- Hoạt cảnh viewmodel (tay súng FPS) từ GLB.

## Cách thử với file mẫu
`node tools/make-sample-glb.js` → chép `assets/_samples/test_box.glb` vào `assets/weapons/rifle/assault_rifle.glb`, thêm giấy phép vào `licenses.json`, `"weapons": {"rifle": "weapons/rifle/assault_rifle"}` vào `bindings.json`, chạy `node tools/pack-assets.js` rồi mở game: súng trường sẽ thành một hộp kim loại (xác nhận đường ống nạp model chạy). Xoá các dòng đó để quay lại model dựng bằng code.

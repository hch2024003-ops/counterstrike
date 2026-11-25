# Thư viện tài nguyên đồ họa (offline)

```
assets/
  packs.json        khai báo gói: id, phiên bản, bundled, phụ thuộc, thư mục chứa
  licenses.json     giấy phép theo tiền tố đường dẫn (BẮT BUỘC cho mọi asset)
  bindings.json     gắn tên logic với asset: súng (rifle...) và nhân vật (A/B + các mức LOD)
  manifest.json     SINH TỰ ĐỘNG bằng `node tools/pack-assets.js`
  core/             Core Pack: đi kèm bộ cài (extraResources)
  characters/ weapons/ environment/ effects/   gói tuỳ chọn
  _samples/         file mẫu (không đóng gói)
```

## Quy ước asset
- **Định dạng:** GLB/GLTF 2.0 (Draco hoặc Meshopt tuỳ chọn), texture KTX2/PNG/JPG/WebP. Không nhận file thực thi/JavaScript.
- **Tên file ổn định, đường dẫn tương đối:** `characters/team-a/soldier_01_lod0.glb`, `weapons/rifle/assault_rifle.glb`, `environment/warehouse/crate_01.glb`.
- **Nhân vật:** rig xương chuẩn, clip `Idle, Walk, Run, Crouch_Idle, Crouch_Walk, Jump, Reload, Death`, xương `Spine`, node rỗng `WeaponSocket` (hoặc xương bàn tay phải) để gắn súng. Các mức LOD là file riêng `_lod0, _lod1, _lod2`.
- **Súng:** nòng hướng −Z, gốc ở thân súng, node rỗng `Muzzle` và `Eject`.
- **Material:** đặt tên có từ khoá `concrete, painted_concrete, steel, rust, wood, plastic, rubber, fabric, glass, asphalt, ground` để nhận thông số PBR mặc định khi thiếu map.
- **Texture:** 512 px vật nhỏ, 1K thông thường, 2K vật quan trọng, 4K chỉ hero asset; ưu tiên KTX2.

## Quy trình
1. Đặt file vào thư mục tương ứng, ghi giấy phép vào `licenses.json`, gắn vào `bindings.json`.
2. `node tools/pack-assets.js` để sinh `manifest.json` (tính SHA-256, kích thước, nén, LOD).
3. Thử nhanh: `node tools/make-sample-glb.js` tạo GLB mẫu.
4. (Phát hành cập nhật từ xa) `node tools/gen-keys.js keys/`, đưa `publisher.pub.pem` vào `assets/`, `node tools/sign-manifest.js keys/publisher.key.pem manifest.json`, đặt `update.json` = `{ "url": "https://.../hachihi-assets" }` (mẫu: `update.json.example`). KHOÁ RIÊNG không đưa vào repo.

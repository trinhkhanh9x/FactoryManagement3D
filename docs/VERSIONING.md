# Quản lý phiên bản FactoryManagement3D

Repo độc lập cho module chạy trên OpenMES 0.27.0 có capability ghi trong `compatibility.json` và `public/FactoryManagement3D.runtime.json`. Phiên bản hiện hành lấy từ `module.json`; README cũ có thể giữ tiêu đề lần phát hành trước. Cập nhật đồng thời version trong module.json, package.json, package-lock và sidecar sau build. Dùng SemVer MAJOR.MINOR.PATCH.

Ngày 23/10/2026 nhập snapshot nguồn phát triển đã tạo ZIP đang triển khai. Lịch sử Git cũ, bản quyền và patch tương thích được giữ; commit nhập dùng thời điểm thực, không dựng lại lịch sử phát triển. `release-catalog.json` ghi ZIP gốc và SHA-256. Thay đổi quản lý Git không tự tạo runtime mới.

Clone vào `OpenMES/backend/modules/FactoryManagement3D` trong checkout core tương thích. `OpenMES/packages` cần có shared runtime đúng với capability module; bản snapshot packages ở catalog chỉ hỗ trợ frontend, không thay checkout core và backend dependencies. Môi trường test phải tách database/storage production.

```sh
git switch main
git switch -c fix/ten-thay-doi
# Sửa module, build/test/audit theo README, review diff.
git diff
git add <cac-file-da-review>
git commit -m "fix: mo ta thay doi"
```

Merge thay đổi đã review rồi tạo annotated tag mới `vX.Y.Z`; không di chuyển tag cũ hoặc force-push. Repo GitHub dự kiến dùng riêng tư `trinhkhanh9x/FactoryManagement3D`; catalog phân biệt repo đã có và repo chờ tạo. Tạo repo/push/Release cần chủ workspace đồng ý. Dùng ZIP runtime cùng SHA-256 ở Release để cài; ZIP source tự sinh của GitHub không thay ZIP runtime. Git checkout không tự triển khai hoặc rollback database.

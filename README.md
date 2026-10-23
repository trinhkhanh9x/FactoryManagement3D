# Factory Management 3D Tracking

**Phiên bản:** 1.1.0 · **Cập nhật:** 21/10/2026, Asia/Saigon.

Module quản lý mặt bằng nhiều nhà xưởng và xem trạng thái máy, lệnh, lô, công đoạn
từ OpenMES. Người dùng có thể dựng tầng đúng tỉ lệ, bố trí máy, gắn mô hình GLB,
lưu nháp và công bố mặt bằng cho người quản lý theo dõi.

## Tương thích và cài đặt

- Đã xác minh trên OpenMES **0.27.0**, hỗ trợ mục tiêu **0.27.x**; runtime contract **1**.
  Bộ cài lõi chỉ đọc một điều kiện phiên bản nên manifest dùng `>=0.27.0`.
  Cần xác minh lại trước khi nâng lên dòng phiên bản lõi mới.
- ZIP phát hành chứa PHP, migration, bundle JavaScript đã biên dịch và runtime
  sidecar. Cài qua **Settings → Modules** bằng tài khoản Admin; không cần sửa
  lõi hoặc build lại frontend lõi.
- Môi trường chạy cần đáp ứng yêu cầu PHP/storage/database của OpenMES. Trình
  duyệt desktop cần WebGL 2 để xem cảnh; danh sách máy vẫn dùng được nếu 3D lỗi.
- Kiểm tra cài mới, bật/tắt và nâng cấp trên môi trường thử nghiệm trước khi
  cài vào MES đang vận hành. Sao lưu database và tài sản private trước nâng cấp.

Sau khi cài và bật module, mở **Nhà xưởng 3D** trực tiếp trong menu chính. Mục này
dùng cùng component và màu theme với các liên kết MES, không tạo nhóm màu riêng. Admin
tạo xưởng, liên kết các dây chuyền hiện có, phân công Supervisor rồi dựng mặt
bằng. Không có xưởng, tọa độ máy hoặc kích thước giả được tự tạo khi cài đặt.

Module cung cấp công cụ dựng mô hình. Chưa có bản vẽ, kích thước hoặc mô hình
máy thực tế đi kèm; người dùng cần cung cấp và xác minh các dữ liệu này.

Xem [hướng dẫn sử dụng](docs/USER-GUIDE.md) và [hợp đồng API/dữ liệu](docs/CONTRACT.md).

## Cải tiến giao diện 1.1.0

- Tổng quan tìm theo mã/tên, phân trang tối đa 6 xưởng để giới hạn các vòng đọc MES.
- Tách góc nhìn 3D khỏi bộ lọc máy; có số kết quả và thao tác xóa bộ lọc.
- Mặt bằng trống hướng dẫn dựng tầng theo quyền; phân biệt trạng thái tải, lỗi và trống.
- Giải thích điều kiện lưu/công bố, hỗ trợ bàn phím và hiển thị lỗi ngay cạnh ô cấu hình.
- Giữ icon, font và màu theme của MES; canvas điều chỉnh chiều cao trên màn hình nhỏ.
- Trang runtime dùng tên `FactoryManagement3D/Workspace`, tách khỏi trang `Index`
  có thể đã được nhúng trong frontend lõi cũ. Nâng cấp không cần build lại lõi.

## Khả năng và giới hạn

- Nhiều xưởng trong cùng MES; một dây chuyền chỉ thuộc một xưởng, máy kế thừa
  xưởng từ dây chuyền. Không tổng hợp các hệ thống MES độc lập.
- Admin quản lý xưởng và phân công trong cùng tenant. Supervisor xem các xưởng
  được phân công; quyền chỉnh mặt bằng được cấp riêng. Operator chưa có quyền
  dùng module trong v1.
- Quyền theo xưởng chỉ áp dụng tại module, bao gồm API và tải GLB. Quyền tại
  những trang nghiệp vụ khác của MES vẫn do lõi quyết định.
- Theo dõi khoảng 10 giây/lần; trạng thái máy độc lập với công đoạn đang làm.
  Máy chưa có trạng thái là **Chưa có dữ liệu**, không suy luận thành nhàn rỗi
  hoặc mất kết nối. Mọi máy thuộc xưởng đều có trong danh sách, kể cả chưa có
  MachineTag, mô hình hoặc vị trí trên mặt bằng.
- Vị trí lệnh/lô là máy/công đoạn được MES ghi nhận, không phải định vị vật lý
  liên tục. Không có RTLS, tua lại lịch sử 3D, kết nối bộ điều khiển máy mới
  hoặc thao tác bắt đầu/dừng sản xuất ngay trong module.
- UI dùng shared OpenMES layout, Geist/Geist Mono, Icon Lucide qua `@openmes/ui`
  và token `--om-*`. Light/dark và theme động áp dụng cho cảnh và bảng thông tin;
  vật liệu gốc của GLB được giữ lại, trạng thái dùng marker và nhãn riêng.

## Dữ liệu mặt bằng và GLB

Đơn vị là **mét**, Y hướng lên, X–Z là mặt sàn; vị trí Y của đối tượng tương đối
với cao độ tầng. Editor nhập góc bằng độ, dữ liệu lưu bằng radian. Một máy chỉ
có một vị trí trong mỗi mặt bằng. Người xem đọc bản công bố; bản nháp chỉ dành
cho người chỉnh. Lưu/công bố kiểm tra số phiên bản để phát hiện sửa đồng thời.

GLB v1 nhận **glTF 2.0 binary tự chứa tài nguyên** theo tập con được validator
hỗ trợ, không phải mọi GLB hợp lệ đều được chấp nhận:

| Giới hạn | Giá trị |
|---|---|
| Kích thước file | Tối đa 20 MiB |
| Hình học | Tối đa 250.000 tam giác, có tính số lần xuất hiện mesh trong node/scene |
| Bộ nhớ geometry giải mã | Tối đa 64 MiB |
| Texture | PNG/JPEG/WebP nhúng, tối đa 64 ảnh, mỗi chiều tối đa 4.096 pixel |
| Bộ nhớ texture giải mã | Tổng tối đa 128 MiB |
| Cây node | Không vòng lặp, tối đa 64 cấp và 20.000 node sau khi mở rộng scene |
| Tài nguyên | Một buffer nhúng; không URI, kể cả data URI |
| Không hỗ trợ | Sparse/viewless accessor, Draco, Meshopt, KTX2/BasisU, GPU instancing |

Chuyển CAD sang GLB trước khi tải; giảm chi tiết và gộp tài nguyên vào file.
Các giới hạn nhằm hạn chế dữ liệu giải mã, không phải cam kết tốc độ cho một
cảnh chứa nhiều mô hình lớn. Xem giới hạn đầy đủ trong `GlbValidator` và
`GlbGeometry` khi chuẩn bị dữ liệu lớn.

## Phát triển, kiểm thử và đóng gói

Thực hiện trong thư mục module của checkout đầy đủ; cần dependencies PHP của
backend và package `packages/module`. Node theo yêu cầu Vite 7:
`^20.19.0 || >=22.12.0`. Gói phát hành đã build không cần Node trên máy MES.

```sh
npm ci
npm run lint
npm test
npm run test:coverage
npm run build
npm run test:e2e
npm run package
```

Chạy PHP suite bằng cấu hình riêng của module:

```sh
php ../../vendor/bin/phpunit --configuration phpunit.xml
```

`phpunit.xml` dùng SQLite in-memory; không chạy test trên database sản xuất.
PHP coverage cần driver coverage tương thích; báo cáo JS tạo trong `coverage/`.
E2E dùng Playwright và môi trường kiểm thử riêng theo cấu hình trong mã nguồn.
Mục tiêu coverage là 80% cho mã module tự viết; các lệnh trên không phải tuyên
bố rằng kết quả kiểm thử hoặc coverage đã đạt. Đối chiếu báo cáo xác minh của
gói bàn giao.

Lệnh package tạo `FactoryManagement3D-1.1.0.zip` và SHA-256 trong thư mục artifact
phát hành `artifacts/FactoryManagement3D-1.1.0/` của workspace. ZIP không chứa
`node_modules`, tests, công cụ phát triển hay dữ liệu xưởng thực.

## Sao lưu và khôi phục

Sao lưu đồng bộ các bảng `fm3d_*` và thư mục `factory-management-3d/` trên disk
`local` của Laravel; đây là tài sản private, không phải thư mục public. Bản sao
lưu cũng phải giữ được các ID máy/dây chuyền/người dùng của MES mà module tham
chiếu. ZIP chương trình không chứa database hoặc GLB người dùng đã tải lên.

Tắt module chặn endpoint nhưng giữ dữ liệu. Hook gỡ cài đặt cũng giữ mặt bằng,
liên kết, lịch sử cấu hình và GLB để cài lại; không có chức năng purge tự động.
Không chạy rollback migration để tắt/gỡ module vì `down()` xóa các bảng module.
Khôi phục database và file cùng thời điểm trên môi trường thử nghiệm trước,
sau đó kiểm tra lại quyền xem, bản công bố và khả năng mở mô hình.

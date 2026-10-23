# Hướng dẫn Factory Management 3D Tracking

**Phiên bản:** 1.1.0 · **Cập nhật:** 21/10/2026, Asia/Saigon.

Module giúp quản lý/tổ trưởng xem nhà xưởng, máy và tiến độ ghi nhận trong MES
trên cảnh 3D. Điều kiện cài đặt, kiểm thử và sao lưu nằm trong [README](../README.md).

Ở tổng quan, tìm xưởng theo mã hoặc tên. Mỗi trang hiển thị tối đa 6 xưởng;
chuyển trang để xem thêm. Trong xưởng, nhóm **Góc nhìn 3D** điều khiển tầng và
camera, nhóm **Bộ lọc máy** tìm máy/lệnh/lô, trạng thái và dây chuyền. **Xóa bộ lọc**
khôi phục danh sách máy, không thay đổi góc nhìn.

## 1. Tạo xưởng và phân công

1. Admin mở **Nhà xưởng 3D** trong menu chính, chọn tạo nhà xưởng.
2. Nhập mã, tên và múi giờ IANA, ví dụ `Asia/Ho_Chi_Minh`.
3. Chọn các dây chuyền hiện có thuộc xưởng. Máy/trạm được lấy từ dây chuyền;
   không phải tạo lại máy trong module.
4. Trong **Quản lý được phân công**, chọn Supervisor được xem xưởng. Bật riêng
   **Chỉnh mặt bằng** nếu người đó được dựng/sửa và công bố mô hình.
5. Chọn **Lưu cấu hình** rồi mở xưởng.

Mã và tên không được để trống, giới hạn lần lượt 80 và 200 ký tự. Có thể nhấn
Enter để lưu; màn hình đưa focus tới ô sai đầu tiên và hiển thị lỗi cạnh ô đó.

Admin thấy các xưởng trong tenant của mình. Supervisor chỉ thấy xưởng được
phân công; có quyền xem không đồng nghĩa có quyền chỉnh. Operator chưa sử dụng
module trong v1. Các giới hạn này áp dụng cả đọc file mô hình, không chỉ ẩn UI.

Một dây chuyền chỉ liên kết một xưởng. Nếu cần chuyển dây chuyền, xử lý các vị
trí máy của dây chuyền ở cả bản nháp và bản công bố trước khi bỏ liên kết.
Nếu màn hình báo thông tin xưởng đã lưu nhưng phân quyền chưa lưu, đóng rồi
mở lại **Cấu hình xưởng** để kiểm tra và lưu lại phần phân công.

## 2. Dựng tầng và khu vực

Chuẩn bị bản vẽ hoặc số đo thực; chọn một gốc tọa độ thống nhất cho từng tầng.
Module không cung cấp mô hình thực tế của nhà máy hoặc tự suy ra kích thước.

Nếu chưa có mặt bằng công bố, người có quyền chỉnh chọn **Bắt đầu dựng mặt bằng**.
Màn hình hướng dẫn bốn bước: tạo tầng, bố trí máy, lưu nháp, công bố. Khi nút lưu
hoặc công bố chưa dùng được, lý do xuất hiện ngay cạnh nút.

1. Mở **Chỉnh mặt bằng → Tầng / khu vực → Tạo tầng**.
2. Nhập tên, chiều rộng, chiều sâu, cao độ và độ dày sàn bằng **mét**.
3. Chọn **Thêm tầng theo kích thước**. Tầng mới có biên hình chữ nhật từ gốc
   X=0, Z=0; đây là hình do người dùng vừa nhập, chưa được xác minh.
4. Với mặt bằng không chữ nhật, sửa danh sách đỉnh X–Z theo thứ tự đường biên.
   Dùng ít nhất 3 đỉnh, không trùng liên tiếp hoặc tự cắt; tối đa 100 đỉnh.
5. Thêm khu vực theo biên tầng, đổi tên và chỉnh lại các đỉnh theo ranh giới
   khu vực thực tế. Khu vực mới ban đầu sao chép biên tầng đang chọn.
6. Chỉ đánh dấu **Đã xác minh kích thước tầng** sau khi đối chiếu thực tế.

Y là chiều cao; cao độ tầng được cộng vào Y của máy/kết cấu khi hiển thị. Chọn
một tầng để chỉnh, hoặc **Tất cả tầng** để xem tổng thể. Xóa tầng sẽ xóa khu
vực và vị trí máy trên tầng trong bản đang chỉnh; không xóa máy khỏi MES.

## 3. Đặt máy, kết cấu và mô hình

1. Chọn tầng, mở **Máy / kết cấu → Thêm máy / kết cấu**.
2. Chọn loại **Máy/trạm**, sau đó chọn một máy chưa bố trí thuộc xưởng. Hoặc
   chọn **Tường**, **Cửa**, **Lối đi** và nhập nhãn.
3. Nhập kích thước rộng/cao/sâu thực rồi thêm đối tượng. Vị trí mới là gốc tầng
   `(0, 0, 0)`, có nhãn chưa xác minh; chưa phải vị trí máy được khảo sát.
4. Chọn đối tượng qua cảnh hoặc danh sách. Nhập tọa độ X/Y/Z, góc quay bằng độ,
   tầng, khu vực và kích thước; hoặc kéo tay nắm di chuyển trong cảnh trên mặt
   phẳng X–Z. Bước căn lưới có thể tắt, chọn **0,1 m** hoặc **1 m**.
5. Chọn **Tải mô hình GLB** rồi gắn file đã tải ở trường **Mô hình máy**.
6. Xác nhận riêng **Đã xác minh vị trí và kích thước** và **Đã xác minh hình
   dáng mô hình** khi đã đối chiếu với máy thực tế.

Mô hình được căn theo kích thước đối tượng đã nhập. Kiểm tra hướng và tỉ lệ
bằng một kích thước tham chiếu đã biết trước khi đánh dấu xác minh. Khi chưa
có GLB hoặc tải mô hình lỗi, cảnh dùng khối thay thế; máy vẫn có trong danh sách.
Màu/vật liệu GLB giữ nguyên; trạng thái máy hiển thị bằng marker và nhãn.

File cần là **GLB 2 tự chứa tài nguyên**, tối đa 20 MiB, 250.000 tam giác và
texture 4.096 pixel mỗi chiều. Không nhận CAD trực tiếp, URI ngoài/data URI,
Draco, Meshopt, KTX2/BasisU, GPU instancing hoặc accessor sparse/viewless.
Còn giới hạn giải mã 64 MiB geometry, 128 MiB texture, tối đa 64 ảnh và cây
node 64 cấp, tối đa 20.000 node sau khi mở rộng scene. Xem [bảng giới hạn](../README.md#dữ-liệu-mặt-bằng-và-glb).

Tải GLB lưu file ngay vào thư viện xưởng; **Lưu nháp** lưu cách bố trí và liên
kết mô hình. Tài sản không có URL public và không dùng chung giữa các xưởng.
Xóa đối tượng chỉ xóa vị trí khỏi mặt bằng; dữ liệu máy trong MES được giữ lại.

## 4. Lưu nháp và công bố

- Chọn **Lưu nháp** sau khi chỉnh. Bản này chỉ người có quyền chỉnh được đọc.
- Sau khi đã lưu và dữ liệu hợp lệ, chọn **Công bố** để người xem nhận bản đó.
  Thay đổi chưa lưu phải được lưu trước; mặt bằng công bố cần ít nhất một tầng.
- Chế độ **Theo dõi** luôn dùng bản công bố. Chế độ **Chỉnh mặt bằng** mở bản nháp.
- Nếu hai người cùng sửa, người lưu sau có thể gặp thông báo bản nháp đã thay
  đổi. Module không ghi đè tự động. Ghi lại thay đổi cần giữ, chọn tải lại bản
  nháp sau khi xác nhận rồi áp dụng lại thay đổi trên bản mới.
- Cảnh giữ hình học hợp lệ gần nhất khi thông số nhập lỗi; sửa lỗi trước khi
  lưu. Không coi cảnh còn hiển thị là dấu hiệu bản nhập hiện tại đã được lưu.

Đổi xưởng, rời chế độ chỉnh hoặc rời trang khi có thay đổi chưa lưu sẽ có cảnh
báo. Lưu nháp không tự công bố, và công bố không cập nhật trạng thái sản xuất.

## 5. Theo dõi máy và đơn hàng

Tại tổng quan, mở một xưởng. Dùng thanh công cụ để chọn tầng, đổi phối cảnh/
**Từ trên xuống**, lọc dây chuyền/trạng thái hoặc bật **Chưa bố trí**. Tìm theo
mã/tên máy hoặc mã lệnh/lô có trong hoạt động được ghi nhận. Chọn máy trong
danh sách để đưa góc nhìn đến vị trí của máy nếu đã bố trí.

- Dùng chuột để xoay/di chuyển/phóng to cảnh; **Đặt lại góc nhìn** trở về góc
  nhìn toàn thể. Bật/tắt **Hiện tường / cửa** khi kết cấu che khuất máy.
- Bấm máy để xem nguồn/trạng thái, thời điểm bắt đầu trạng thái, công đoạn
  đang làm, đạt/phế, lệnh liên quan và sự cố. Một máy có thể có nhiều công
  đoạn đang hoạt động; không ép thành một lệnh duy nhất.
- Mở **Xem công đoạn/Chi tiết** để xem dữ liệu lệnh thuộc xưởng. Nhãn **Phạm vi
  công đoạn giới hạn** cho biết lệnh còn phần ngoài phạm vi xưởng đang xem.
- **Mở lệnh trong MES** chuyển sang trang lõi; quyền của trang đó do MES quyết
  định. Báo sản lượng, bắt đầu/dừng việc và xử lý sự cố tại màn hình nghiệp vụ.

| Thông tin | Cách hiểu |
|---|---|
| Đang chạy / Nhàn rỗi / Dừng / Lỗi… | Trạng thái máy được MES ghi nhận, không suy từ lệnh |
| Chưa có dữ liệu | Chưa có trạng thái máy; khác với Nhàn rỗi |
| Công đoạn đang làm | Hoạt động sản xuất được ghi tại máy, độc lập với trạng thái máy |
| Chưa đặt trên mặt bằng | Có máy trong MES nhưng chưa có vị trí trong bản đang xem |
| Chưa xác minh | Vị trí/kích thước hoặc hình dáng chưa được xác nhận thực tế |
| Dữ liệu cũ | Màn hình hơn 30 giây chưa đọc thành công; không kết luận máy mất kết nối |

Tiến độ thành phẩm dùng số liệu lệnh của MES, không cộng sản lượng trung gian
qua mọi công đoạn. Quá hạn được tính theo múi giờ xưởng. Vị trí lệnh/lô chỉ là
máy/công đoạn đang ghi nhận và công đoạn hoàn tất gần nhất; không phải tọa độ
vật lý liên tục, cũng không phải phát lại lịch sử 3D.

## 6. Cập nhật và xử lý lỗi

Màn hình đọc MES khoảng **10 giây/lần**, tạm dừng khi tab bị ẩn và đọc lại khi
quay về. Có thể chọn **Cập nhật** để đọc ngay. Khi lỗi mạng, giữ dữ liệu cuối
và hiển thị cảnh báo; thời gian thử lại tăng dần, tối đa 60 giây. Khi mất quyền
hoặc phiên truy cập không còn hợp lệ, dữ liệu xưởng bị ẩn và cần đăng nhập/
kiểm tra phân công lại.

| Tình huống | Cách xử lý |
|---|---|
| Không thấy xưởng | Admin kiểm tra tenant, phân công người dùng và module đã bật |
| Không thấy nút chỉnh | Cần Admin hoặc quyền **Chỉnh mặt bằng** của xưởng |
| Không thấy máy | Kiểm tra dây chuyền được liên kết, bộ lọc; xem danh sách chưa bố trí |
| Chưa có mặt bằng công bố | Người chỉnh tạo tầng, bố trí, lưu nháp rồi công bố |
| GLB bị từ chối | Đọc lỗi; xuất lại GLB nhúng, không nén bằng decoder ngoài, giảm mesh/texture |
| GLB không mở được | Kiểm tra quyền, file private và mạng; tiếp tục dùng khối thay thế/danh sách |
| 3D không khả dụng | Dùng trình duyệt có WebGL 2; thông tin máy vẫn ở danh sách và bảng chi tiết |
| WebGL context bị mất | Tải lại trang hoặc dùng danh sách; lưu thay đổi mặt bằng trước nếu còn thao tác được |
| Lưu bị xung đột | Tải bản nháp mới sau khi ghi lại thay đổi cần giữ; không lặp lưu mù |

Giới hạn tải mô hình của web server/PHP cũng phải cho phép dung lượng tương
ứng; nếu file chưa tới module đã bị từ chối, nhờ quản trị viên kiểm tra cấu
hình tải lên của môi trường. Không cần thay cấu hình production để dùng các
chức năng khác của module.

## 7. Sao lưu và vòng đời module

Sao lưu **cả database và file private**: các bảng `fm3d_*` cùng đường dẫn
`factory-management-3d/` trên Laravel disk `local`. Cần giữ nhất quán ID tham
chiếu của MES; không chỉ chép ZIP chương trình để khôi phục một xưởng.

Tắt module giữ dữ liệu và chặn truy cập endpoint. Gỡ module cũng không tự
purge dữ liệu hoặc GLB. Không rollback migration để tạm tắt; rollback xóa bảng.
Sau cài lại/khôi phục, kiểm tra quyền, danh sách máy, bản công bố và một mô hình
GLB trước khi sử dụng. Xem thêm [hướng dẫn quản trị](../README.md#sao-lưu-và-khôi-phục).

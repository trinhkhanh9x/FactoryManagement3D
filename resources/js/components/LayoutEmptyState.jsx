import React from 'react';
import { Button, Icon } from '@openmes/ui';

export default function LayoutEmptyState({ editing, canEdit, onStart }) {
    return (
        <section className="fm3d-layout-empty fm3d-panel" aria-label="Thiết lập mặt bằng">
            <div className="fm3d-layout-empty-icon" aria-hidden="true">
                <Icon name="boxes" size={28} />
            </div>
            <div className="fm3d-stack">
                <h2>
                    {editing
                        ? 'Dựng mặt bằng theo kích thước thực'
                        : 'Chưa có mặt bằng được công bố'}
                </h2>
                <p>
                    {editing
                        ? 'Bắt đầu từ tầng và kích thước đã đo. Đối tượng chưa được kiểm chứng luôn mang nhãn Chưa xác minh.'
                        : 'Danh sách máy và tiến độ MES vẫn có thể sử dụng bên dưới khi mặt bằng 3D chưa sẵn sàng.'}
                </p>
                {editing ? (
                    <ol className="fm3d-layout-steps">
                        <li>
                            <strong>Tạo tầng</strong>
                            <span>
                                Nhập kích thước, cao độ và độ dày sàn trong công cụ Tầng / khu vực.
                            </span>
                        </li>
                        <li>
                            <strong>Bố trí máy</strong>
                            <span>
                                Chọn máy trong danh mục MES, nhập kích thước và vị trí thực.
                            </span>
                        </li>
                        <li>
                            <strong>Lưu nháp</strong>
                            <span>Kiểm tra mặt bằng và lưu thay đổi trước khi chia sẻ.</span>
                        </li>
                        <li>
                            <strong>Công bố</strong>
                            <span>Cho phép người được phân công xem mặt bằng đã duyệt.</span>
                        </li>
                    </ol>
                ) : canEdit ? (
                    <div>
                        <Button onClick={onStart} leftIcon={<Icon name="plus" size={16} />}>
                            Bắt đầu dựng mặt bằng
                        </Button>
                    </div>
                ) : (
                    <p className="fm3d-muted">
                        Liên hệ người có quyền chỉnh mặt bằng để dựng và công bố sơ đồ nhà xưởng.
                    </p>
                )}
            </div>
        </section>
    );
}

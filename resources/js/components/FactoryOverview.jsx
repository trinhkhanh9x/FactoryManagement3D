import React, { useState } from 'react';
import { Button, Icon, InlineAlert, StatusBadge, TextField } from '@openmes/ui';
import useSnapshot from '../hooks/useSnapshot';
import { errorText } from '../lib/api';
import { formatTime } from '../lib/layout';

export function Summary({ summary }) {
    const rows = [
        ['total_machines', 'Máy/trạm', 'muted'],
        ['running', 'Đang chạy', 'running'],
        ['unknown', 'Chưa có dữ liệu', 'muted'],
        ['active_orders', 'Lệnh đang làm', 'active'],
        ['overdue_orders', 'Lệnh quá hạn', 'blocked'],
        ['open_issues', 'Sự cố mở', 'blocked'],
    ];
    return (
        <dl className="fm3d-summary">
            {rows.map(([key, label, tone]) => (
                <div key={key} data-tone={summary?.[key] > 0 ? tone : undefined}>
                    <dt>{label}</dt>
                    <dd>{summary?.[key] ?? '—'}</dd>
                </div>
            ))}
        </dl>
    );
}

function FactoryCard({ factory, api, onSelect }) {
    const snapshot = useSnapshot(api, factory.id);
    return (
        <article className="fm3d-panel fm3d-stack" aria-busy={!snapshot.data && !snapshot.error}>
            <div className="fm3d-card-heading">
                <Icon name="factory" size={20} />
                <h2>{factory.name}</h2>
            </div>
            <div className="fm3d-mono fm3d-muted">
                {factory.code} · {factory.timezone}
            </div>
            <div className="fm3d-card-meta">
                <StatusBadge
                    label={factory.is_active ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                    tone={factory.is_active ? 'success' : 'neutral'}
                    size="sm"
                />
                <span className="fm3d-muted">
                    {factory.workstation_count} máy/trạm được phân công
                </span>
            </div>
            <Summary summary={snapshot.data?.summary} />
            {snapshot.error && (
                <InlineAlert severity="error" title="Không cập nhật được">
                    {errorText(snapshot.error)}
                </InlineAlert>
            )}
            <p className="fm3d-muted">
                Cập nhật: {formatTime(snapshot.data?.fetched_at, factory.timezone)}
                {snapshot.stale ? ' · Dữ liệu cũ' : ''}
            </p>
            <Button
                variant="secondary"
                aria-label={`Mở nhà xưởng ${factory.name}`}
                onClick={() => onSelect(factory.id)}
            >
                Mở nhà xưởng
            </Button>
        </article>
    );
}

export default function FactoryOverview({ catalog, api, onSelect, onCreate }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const query = search.trim().toLocaleLowerCase();
    const filtered = catalog.factories.filter((factory) =>
        `${factory.code} ${factory.name}`.toLocaleLowerCase().includes(query),
    );
    // Each visible card polls MES. Bound concurrent cards instead of starting
    // one request loop for every factory in a large installation.
    const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
    const currentPage = Math.min(page, pageCount - 1);
    const visible = filtered.slice(currentPage * 6, currentPage * 6 + 6);
    const changeSearch = (value) => {
        setSearch(value);
        setPage(0);
    };
    return (
        <div className="fm3d-stack">
            <div className="fm3d-row">
                <p className="fm3d-muted">
                    Chọn nhà xưởng để theo dõi máy, đơn hàng và mặt bằng 3D.
                </p>
                {catalog.is_admin && (
                    <Button leftIcon={<Icon name="plus" size={16} />} onClick={onCreate}>
                        Tạo nhà xưởng
                    </Button>
                )}
            </div>
            {catalog.factories.length > 0 && (
                <div className="fm3d-overview-tools">
                    <TextField
                        label="Tìm nhà xưởng"
                        placeholder="Nhập mã hoặc tên xưởng"
                        value={search}
                        onChange={changeSearch}
                    />
                    <span className="fm3d-muted" role="status">
                        Kết quả: {filtered.length}/{catalog.factories.length} nhà xưởng
                    </span>
                    {search && (
                        <Button variant="ghost" onClick={() => changeSearch('')}>
                            Xóa tìm kiếm
                        </Button>
                    )}
                </div>
            )}
            {!catalog.factories.length ? (
                <InlineAlert severity="info" title="Chưa có nhà xưởng được phân công">
                    {catalog.is_admin
                        ? 'Tạo nhà xưởng và liên kết dây chuyền hiện có để bắt đầu. Máy và mặt bằng không được tự gán.'
                        : 'Liên hệ Admin để được phân công nhà xưởng.'}
                </InlineAlert>
            ) : !filtered.length ? (
                <InlineAlert severity="info" title="Không tìm thấy nhà xưởng">
                    Thử mã hoặc tên khác, hoặc xóa tìm kiếm để xem tất cả nhà xưởng được phân công.
                </InlineAlert>
            ) : (
                <div className="fm3d-factory-grid">
                    {visible.map((factory) => (
                        <FactoryCard
                            key={factory.id}
                            factory={factory}
                            api={api}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
            {pageCount > 1 && (
                <nav className="fm3d-row" aria-label="Phân trang nhà xưởng">
                    <Button
                        variant="ghost"
                        aria-label="Trang trước"
                        disabled={currentPage === 0}
                        onClick={() => setPage(currentPage - 1)}
                    >
                        Trước
                    </Button>
                    <span className="fm3d-muted">
                        Trang {currentPage + 1} / {pageCount} · Tối đa 6 xưởng mỗi trang
                    </span>
                    <Button
                        variant="ghost"
                        aria-label="Trang tiếp"
                        disabled={currentPage === pageCount - 1}
                        onClick={() => setPage(currentPage + 1)}
                    >
                        Tiếp
                    </Button>
                </nav>
            )}
        </div>
    );
}

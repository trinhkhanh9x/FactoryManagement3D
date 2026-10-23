import React from 'react';
import { Button, Icon, TextField } from '@openmes/ui';
import { CheckField, SelectField } from './Fields';

const states = [
    ['RUNNING', 'Đang chạy'],
    ['IDLE', 'Nhàn rỗi'],
    ['STOPPED', 'Đã dừng'],
    ['FAULT', 'Lỗi'],
    ['SETUP', 'Gá đặt'],
    ['WAITING', 'Chờ'],
    ['CLEANING', 'Vệ sinh'],
    ['MAINTENANCE', 'Bảo trì'],
    ['UNKNOWN', 'Chưa có dữ liệu'],
];

export default function WorkspaceToolbar({
    floors,
    lines,
    editing,
    busy,
    floorId,
    onFloorChange,
    viewMode,
    onViewModeChange,
    showStructure,
    onShowStructureChange,
    snap,
    onSnapChange,
    onResetCamera,
    search,
    onSearchChange,
    stateFilter,
    onStateFilterChange,
    lineFilter,
    onLineFilterChange,
    onlyUnplaced,
    onOnlyUnplacedChange,
    onClearFilters,
    resultCount,
    totalCount,
    hasData,
}) {
    const hasFilters = Boolean(search || stateFilter || lineFilter || onlyUnplaced);
    return (
        <div className="fm3d-toolbar">
            <div className="fm3d-toolbar-group" role="group" aria-label="Góc nhìn 3D">
                <div className="fm3d-toolbar-heading">
                    <Icon name="scan" size={15} />
                    <span>Góc nhìn 3D</span>
                </div>
                <div className="fm3d-toolbar-controls">
                    <SelectField
                        label="Tầng"
                        value={floorId || ''}
                        onChange={(value) => onFloorChange(value || null)}
                    >
                        <option value="">Tất cả tầng</option>
                        {floors.map((floor) => (
                            <option key={floor.id} value={floor.id}>
                                {floor.name}
                            </option>
                        ))}
                    </SelectField>
                    <SelectField label="Góc nhìn" value={viewMode} onChange={onViewModeChange}>
                        <option value="perspective">Phối cảnh</option>
                        <option value="top">Từ trên xuống</option>
                    </SelectField>
                    {editing && (
                        <SelectField
                            label="Bước căn lưới"
                            value={snap}
                            onChange={(value) => onSnapChange(Number(value))}
                        >
                            <option value={0}>Tắt căn lưới</option>
                            <option value={0.1}>0,1 m</option>
                            <option value={1}>1 m</option>
                        </SelectField>
                    )}
                    <CheckField
                        label="Hiện tường / cửa"
                        checked={showStructure}
                        onChange={onShowStructureChange}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        leftIcon={<Icon name="rotate-ccw" size={14} />}
                        onClick={onResetCamera}
                    >
                        Đặt lại góc nhìn
                    </Button>
                </div>
            </div>
            <div className="fm3d-toolbar-group" role="group" aria-label="Bộ lọc máy">
                <div className="fm3d-toolbar-heading">
                    <Icon name="list-filter" size={15} />
                    <span>Bộ lọc máy</span>
                </div>
                <div className="fm3d-toolbar-controls">
                    <TextField
                        className="fm3d-toolbar-search"
                        label="Tìm máy / lệnh / lô"
                        value={search}
                        onChange={onSearchChange}
                    />
                    <SelectField
                        label="Trạng thái máy"
                        value={stateFilter}
                        onChange={onStateFilterChange}
                    >
                        <option value="">Tất cả trạng thái</option>
                        {states.map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </SelectField>
                    <SelectField
                        label="Dây chuyền"
                        value={lineFilter}
                        onChange={onLineFilterChange}
                    >
                        <option value="">Tất cả dây chuyền</option>
                        {lines.map((line) => (
                            <option key={line.id} value={line.id}>
                                {line.code} · {line.name}
                            </option>
                        ))}
                    </SelectField>
                    <CheckField
                        label="Chưa bố trí"
                        checked={onlyUnplaced}
                        onChange={onOnlyUnplacedChange}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={!hasFilters}
                        onClick={onClearFilters}
                    >
                        Xóa bộ lọc
                    </Button>
                </div>
                <p
                    className="fm3d-muted fm3d-filter-results"
                    role="status"
                    aria-live="polite"
                    data-filter-results
                >
                    {hasData
                        ? `${resultCount} / ${totalCount} máy/trạm${hasFilters ? ' phù hợp bộ lọc' : ''}`
                        : 'Chưa có dữ liệu máy để lọc.'}
                </p>
            </div>
        </div>
    );
}

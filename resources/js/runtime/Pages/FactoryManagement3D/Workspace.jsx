import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Head } from '@inertiajs/react';
import AppLayout from '@core/layouts/AppLayout';
import PageTitle from '@core/components/PageTitle';
import { Button, Icon, InlineAlert } from '@openmes/ui';
import FactoryScene from '../../../components/FactoryScene';
import FactoryAdmin from '../../../components/FactoryAdmin';
import FactoryOverview, { Summary } from '../../../components/FactoryOverview';
import BuildingEditor from '../../../components/BuildingEditor';
import ObjectEditor, { AssetUpload } from '../../../components/ObjectEditor';
import WorkspaceToolbar from '../../../components/WorkspaceToolbar';
import LayoutEmptyState from '../../../components/LayoutEmptyState';
import StationDetails, {
    MachineState,
    OrderDetail,
    OrderStatus,
} from '../../../components/StationDetails';
import { SelectField } from '../../../components/Fields';
import useFactoryWorkspace from '../../../hooks/useFactoryWorkspace';
import useSnapshot from '../../../hooks/useSnapshot';
import useUnsavedGuard from '../../../hooks/useUnsavedGuard';
import useLayoutDraft from '../../../hooks/useLayoutDraft';
import { createApi, errorText } from '../../../lib/api';
import {
    emptyLayout,
    filterStations,
    formatTime,
    updateEntity,
    validateLayout,
} from '../../../lib/layout';

const STATES = [
    'RUNNING',
    'IDLE',
    'STOPPED',
    'FAULT',
    'SETUP',
    'WAITING',
    'CLEANING',
    'MAINTENANCE',
    'UNKNOWN',
];
export default function Index({
    basePath = '/modules/factory-management-3d',
    csrf_token = '',
    initialFactoryId = null,
}) {
    const api = useMemo(() => createApi(basePath, csrf_token), [basePath, csrf_token]);
    const [catalog, setCatalog] = useState(null),
        [catalogError, setCatalogError] = useState(null),
        [catalogKey, setCatalogKey] = useState(0);
    const [factoryId, setFactoryId] = useState(initialFactoryId ? Number(initialFactoryId) : null),
        [editing, setEditing] = useState(false),
        [adminOpen, setAdminOpen] = useState(false);
    const factory = catalog?.factories.find((item) => item.id === factoryId);
    const snapshot = useSnapshot(api, factoryId);
    const forbidden = snapshot.error && [401, 403, 404].includes(snapshot.error.status);
    const workspace = useFactoryWorkspace(
        api,
        forbidden ? null : factoryId,
        editing,
        snapshot.data?.layout_revision ?? null,
    );
    const draft = useLayoutDraft(
        api,
        forbidden ? null : factoryId,
        workspace.layoutData,
        workspace.applySaved,
    );
    const confirmDiscard = useUnsavedGuard(editing && draft.dirty);
    const [floorId, setFloorId] = useState(null),
        [viewMode, setViewMode] = useState('perspective');
    const [selectedId, setSelectedId] = useState(null),
        [selectedStationId, setSelectedStationId] = useState(null),
        [focusId, setFocusId] = useState(null);
    const [search, setSearch] = useState(''),
        [stateFilter, setStateFilter] = useState(''),
        [lineFilter, setLineFilter] = useState(''),
        [onlyUnplaced, setOnlyUnplaced] = useState(false);
    const [editorTab, setEditorTab] = useState('building'),
        [sceneError, setSceneError] = useState(null),
        [order, setOrder] = useState(null);
    const [sceneResetKey, setSceneResetKey] = useState(0),
        [showStructure, setShowStructure] = useState(true),
        [snap, setSnap] = useState(0.1);
    useEffect(() => {
        const url = factoryId ? `${basePath}/factories/${factoryId}` : basePath;
        window.history.replaceState(window.history.state, '', url);
    }, [basePath, factoryId]);
    useEffect(() => {
        const navigate = () => {
            const path = window.location.pathname;
            if (path !== basePath && !path.startsWith(`${basePath}/factories/`)) return;
            const value = path === basePath ? null : path.slice(`${basePath}/factories/`.length);
            if (value !== null && !/^\d+$/.test(value)) return;
            if (draft.busy || !confirmDiscard()) {
                window.history.replaceState(
                    window.history.state,
                    '',
                    factoryId ? `${basePath}/factories/${factoryId}` : basePath,
                );
                return;
            }
            setEditing(false);
            setFactoryId(value ? Number(value) : null);
        };
        window.addEventListener('popstate', navigate);
        return () => window.removeEventListener('popstate', navigate);
    }, [basePath, confirmDiscard, draft.busy, factoryId]);
    useEffect(() => {
        const controller = new AbortController();
        setCatalogError(null);
        api('/catalog', { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted) setCatalog(data);
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    setCatalogError(error);
                    if ([401, 403, 404].includes(error.status)) {
                        setCatalog(null);
                        setFactoryId(null);
                        setEditing(false);
                    }
                }
            });
        return () => controller.abort();
    }, [api, catalogKey]);
    useEffect(() => {
        setFloorId(null);
        setSelectedId(null);
        setSelectedStationId(null);
        setFocusId(null);
        setSceneError(null);
        setOrder(null);
        setSearch('');
        setStateFilter('');
        setLineFilter('');
        setOnlyUnplaced(false);
    }, [factoryId]);
    useEffect(() => {
        if (factoryId && catalog && !factory) {
            setFactoryId(null);
            setEditing(false);
        }
    }, [factoryId, catalog, factory]);
    const layout = editing ? draft.layout : workspace.layout;
    const lastValidLayout = useRef({ factoryId: null, layout: emptyLayout() });
    const valid = validateLayout(layout).length === 0;
    if (valid) lastValidLayout.current = { factoryId, layout };
    const stations = snapshot.data?.stations || [];
    const filtered = filterStations(stations, search, stateFilter, lineFilter).filter(
        (station) =>
            !onlyUnplaced || !layout.objects.some((item) => item.workstation_id === station.id),
    );
    const visibleIds = new Set(filtered.map((station) => station.id));
    const renderLayout =
        lastValidLayout.current.factoryId === factoryId
            ? lastValidLayout.current.layout
            : emptyLayout();
    const sceneLayout = {
        ...renderLayout,
        objects: renderLayout.objects.filter(
            (item) => item.kind !== 'machine' || visibleIds.has(item.workstation_id),
        ),
    };
    const selectedObject = layout.objects.find((item) => item.id === selectedId);
    const selectedStation = stations.find(
        (item) => item.id === (selectedObject?.workstation_id || selectedStationId),
    );
    const pickObject = (id) => {
        setSelectedId(id);
        const target = layout.objects.find((item) => item.id === id);
        setSelectedStationId(target?.workstation_id || null);
    };
    const pickStation = (station) => {
        const target = layout.objects.find((item) => item.workstation_id === station.id);
        setSelectedStationId(station.id);
        setSelectedId(target?.id || null);
        if (target) {
            setFloorId(target.floor_id);
            setFocusId(target.id);
        }
    };
    const chooseFactory = (id) => {
        if (!draft.busy && confirmDiscard()) {
            setEditing(false);
            setFactoryId(id ? Number(id) : null);
        }
    };
    const changeMode = (value) => {
        if (value === editing || draft.busy) return;
        if (confirmDiscard()) {
            setEditing(value);
            setSceneError(null);
        }
    };
    const refreshCatalog = () => setCatalogKey((key) => key + 1);
    const refreshViewer = () => {
        snapshot.refresh();
        if (!editing) workspace.reload();
    };
    const reloadDraft = () => {
        if (
            !draft.busy &&
            (!draft.dirty ||
                window.confirm('Tải bản nháp mới từ máy chủ sẽ bỏ thay đổi chưa lưu. Tiếp tục?'))
        )
            workspace.reload();
    };
    const orders = (snapshot.data?.orders || []).filter(
        (item) => !search || item.order_no?.toLowerCase().includes(search.toLowerCase()),
    );
    const clearMachineFilters = () => {
        setSearch('');
        setStateFilter('');
        setLineFilter('');
        setOnlyUnplaced(false);
    };
    const hasMachineFilters = Boolean(search || stateFilter || lineFilter || onlyUnplaced);
    const layoutEmpty =
        !workspace.loading &&
        Boolean(workspace.layoutData) &&
        !workspace.errors.layout &&
        !layout.floors.length;
    const saveReason = draft.busy
        ? 'Đang xử lý mặt bằng…'
        : !workspace.layoutData
          ? 'Chờ tải bản nháp để lưu.'
          : !valid
            ? 'Sửa thông số chưa hợp lệ trước khi lưu.'
            : !draft.dirty
              ? 'Không có thay đổi mới để lưu.'
              : null;
    const publishReason = draft.busy
        ? 'Đang xử lý mặt bằng…'
        : !workspace.layoutData
          ? 'Chờ tải bản nháp để công bố.'
          : !valid
            ? 'Sửa thông số chưa hợp lệ trước khi công bố.'
            : !layout.floors.length
              ? 'Tạo ít nhất một tầng trước khi công bố.'
              : draft.dirty
                ? 'Lưu bản nháp trước khi công bố.'
                : null;
    return (
        <div className="fm3d-root">
            <Head title="Nhà xưởng 3D" />
            <PageTitle>Nhà xưởng 3D</PageTitle>
            {catalogError && (
                <InlineAlert severity="error" title="Không tải được danh mục">
                    {errorText(catalogError)}{' '}
                    <Button size="sm" variant="ghost" onClick={refreshCatalog}>
                        Thử lại
                    </Button>
                </InlineAlert>
            )}
            {!catalog && !catalogError && <p role="status">Đang tải danh mục nhà xưởng…</p>}
            {catalog && !factory && (
                <FactoryOverview
                    catalog={catalog}
                    api={api}
                    onSelect={chooseFactory}
                    onCreate={() => setAdminOpen(true)}
                />
            )}
            {catalog && factory && forbidden && (
                <InlineAlert severity="error" title="Quyền truy cập nhà xưởng đã thay đổi">
                    {errorText(snapshot.error)}{' '}
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setEditing(false);
                            setFactoryId(null);
                            refreshCatalog();
                        }}
                    >
                        Về tổng quan
                    </Button>
                </InlineAlert>
            )}
            {catalog && factory && !forbidden && (
                <div className="fm3d-stack">
                    <header className="fm3d-row">
                        <div className="fm3d-row">
                            <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<Icon name="arrow-left" size={16} />}
                                onClick={() => chooseFactory(null)}
                            >
                                Tổng quan
                            </Button>
                            <h2>{factory.name}</h2>
                        </div>
                        <div className="fm3d-row">
                            {catalog.is_admin && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<Icon name="settings" size={16} />}
                                    onClick={() => setAdminOpen(true)}
                                >
                                    Cấu hình xưởng
                                </Button>
                            )}
                            <SelectField
                                label="Nhà xưởng"
                                value={factoryId}
                                onChange={chooseFactory}
                            >
                                {catalog.factories.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.code} · {item.name}
                                    </option>
                                ))}
                            </SelectField>
                        </div>
                    </header>
                    <Summary summary={snapshot.data?.summary} />
                    <div className="fm3d-row fm3d-freshness" role="status">
                        <span>
                            Cập nhật MES: {formatTime(snapshot.data?.fetched_at, factory.timezone)}
                            {snapshot.stale ? ' · Dữ liệu cũ' : ''}
                        </span>
                        <span>Chu kỳ khoảng 10 giây · Vị trí theo công đoạn được ghi nhận</span>
                        <Button variant="ghost" size="sm" onClick={refreshViewer}>
                            Cập nhật
                        </Button>
                    </div>
                    {snapshot.error && (
                        <InlineAlert severity="error" title="Không cập nhật được dữ liệu MES">
                            {errorText(snapshot.error)}
                            {!forbidden &&
                                ' Dữ liệu cuối được giữ lại, kiểm tra thời điểm cập nhật trước khi sử dụng.'}
                        </InlineAlert>
                    )}
                    {snapshot.stale && (
                        <InlineAlert severity="warning" title="Dữ liệu hiển thị đã cũ">
                            Hơn 30 giây chưa đọc thành công. Đây là tình trạng cập nhật màn hình,
                            không phải kết luận máy mất kết nối.
                        </InlineAlert>
                    )}
                    {Object.entries(workspace.errors)
                        .filter(([, error]) => error)
                        .map(([key, error]) => (
                            <InlineAlert
                                key={key}
                                severity="error"
                                title={
                                    key === 'layout'
                                        ? 'Không tải được mặt bằng'
                                        : 'Không tải được danh mục mô hình'
                                }
                            >
                                {errorText(error)}{' '}
                                <Button variant="ghost" size="sm" onClick={reloadDraft}>
                                    Thử lại
                                </Button>
                            </InlineAlert>
                        ))}
                    <div className="fm3d-row">
                        <div className="fm3d-row" role="group" aria-label="Chế độ mặt bằng">
                            <Button
                                size="sm"
                                variant={!editing ? 'primary' : 'ghost'}
                                aria-pressed={!editing}
                                onClick={() => changeMode(false)}
                            >
                                Theo dõi
                            </Button>
                            {factory.can_edit && (
                                <Button
                                    size="sm"
                                    variant={editing ? 'primary' : 'ghost'}
                                    aria-pressed={editing}
                                    onClick={() => changeMode(true)}
                                >
                                    Chỉnh mặt bằng
                                </Button>
                            )}
                        </div>
                        <span className="fm3d-muted">
                            {editing
                                ? `Bản nháp v${draft.version}${draft.dirty ? ' · Chưa lưu' : ''}`
                                : `Bản công bố ${workspace.layoutData?.published_version ?? 'chưa có'}`}
                        </span>
                    </div>
                    {editing && (
                        <div className="fm3d-editor-feedback">
                            {draft.error && (
                                <InlineAlert
                                    severity="error"
                                    title={
                                        draft.error.status === 409
                                            ? 'Bản nháp đã được người khác thay đổi'
                                            : 'Chưa lưu được mặt bằng'
                                    }
                                >
                                    {errorText(draft.error)}
                                    {draft.error.status === 409 && (
                                        <Button size="sm" variant="ghost" onClick={reloadDraft}>
                                            Tải lại sau khi xác nhận
                                        </Button>
                                    )}
                                </InlineAlert>
                            )}
                            {draft.notice && (
                                <InlineAlert severity="success" title={draft.notice} />
                            )}
                            <div className="fm3d-draft-actions">
                                <p className="fm3d-muted">
                                    Đơn vị mét · Y hướng lên · Màu/vật liệu GLB được giữ nguyên ·
                                    Chưa xác minh được gắn nhãn.
                                </p>
                                <div className="fm3d-draft-buttons">
                                    <div className="fm3d-action-control">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={Boolean(saveReason)}
                                            loading={draft.busy}
                                            onClick={draft.save}
                                            aria-describedby={
                                                saveReason ? 'fm3d-save-reason' : undefined
                                            }
                                        >
                                            Lưu nháp
                                        </Button>
                                        {saveReason && (
                                            <p id="fm3d-save-reason" className="fm3d-muted">
                                                {saveReason}
                                            </p>
                                        )}
                                    </div>
                                    <div className="fm3d-action-control">
                                        <Button
                                            size="sm"
                                            disabled={Boolean(publishReason)}
                                            loading={draft.busy}
                                            onClick={draft.publish}
                                            aria-describedby={
                                                publishReason ? 'fm3d-publish-reason' : undefined
                                            }
                                        >
                                            Công bố
                                        </Button>
                                        {publishReason && (
                                            <p id="fm3d-publish-reason" className="fm3d-muted">
                                                {publishReason}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {!valid && (
                                <InlineAlert severity="warning" title="Thông số chưa hợp lệ">
                                    {draft.errors.join(' ')} Cảnh giữ hình học hợp lệ gần nhất; sửa
                                    thông số trước khi lưu.
                                </InlineAlert>
                            )}
                        </div>
                    )}
                    <WorkspaceToolbar
                        floors={layout.floors}
                        lines={catalog.lines.filter((line) => factory.line_ids.includes(line.id))}
                        editing={editing}
                        busy={draft.busy}
                        floorId={floorId}
                        onFloorChange={setFloorId}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        showStructure={showStructure}
                        onShowStructureChange={setShowStructure}
                        snap={snap}
                        onSnapChange={setSnap}
                        search={search}
                        onSearchChange={setSearch}
                        stateFilter={stateFilter}
                        onStateFilterChange={setStateFilter}
                        lineFilter={lineFilter}
                        onLineFilterChange={setLineFilter}
                        onlyUnplaced={onlyUnplaced}
                        onOnlyUnplacedChange={setOnlyUnplaced}
                        onClearFilters={clearMachineFilters}
                        resultCount={filtered.length}
                        totalCount={stations.length}
                        hasData={Boolean(snapshot.data)}
                        onResetCamera={() => {
                            setSceneResetKey((value) => value + 1);
                            setFocusId(null);
                            setSelectedId(null);
                            setSelectedStationId(null);
                            setViewMode('perspective');
                            setFloorId(null);
                        }}
                    />
                    <div className={`fm3d-workspace${editing ? ' fm3d-workspace-editing' : ''}`}>
                        <section className="fm3d-viewer" aria-label="Mặt bằng nhà xưởng">
                            {workspace.loading ? (
                                <p className="fm3d-panel" role="status">
                                    Đang tải mặt bằng…
                                </p>
                            ) : workspace.errors.layout ||
                              !workspace.layoutData ? null : layoutEmpty ? (
                                <LayoutEmptyState
                                    editing={editing}
                                    canEdit={factory.can_edit}
                                    onStart={() => changeMode(true)}
                                />
                            ) : (
                                <FactoryScene
                                    layout={sceneLayout}
                                    stations={stations}
                                    assets={workspace.assets}
                                    selectedId={selectedId}
                                    onSelect={pickObject}
                                    onMove={(id, position) =>
                                        draft.setLayout((current) =>
                                            updateEntity(current, 'objects', id, { position }),
                                        )
                                    }
                                    editable={
                                        editing && !draft.busy && Boolean(workspace.layoutData)
                                    }
                                    floorId={floorId}
                                    viewMode={viewMode}
                                    focusId={focusId}
                                    resetKey={sceneResetKey}
                                    showStructure={showStructure}
                                    snap={snap}
                                    onError={setSceneError}
                                />
                            )}
                            {sceneError && (
                                <InlineAlert severity="warning" title="Cảnh 3D có giới hạn">
                                    {sceneError.message || String(sceneError)}. Có thể dùng danh
                                    sách máy bên dưới.
                                </InlineAlert>
                            )}
                            <div className="fm3d-legend" aria-label="Chú giải trạng thái máy">
                                {STATES.map((state) => (
                                    <MachineState key={state} state={state} />
                                ))}
                            </div>
                            <section className="fm3d-panel fm3d-stack" aria-label="Danh sách máy">
                                <h2>
                                    Máy/trạm ({filtered.length}/{stations.length})
                                </h2>
                                {!snapshot.data && !snapshot.error && (
                                    <p role="status">Đang đọc dữ liệu máy…</p>
                                )}
                                {snapshot.data && !filtered.length && (
                                    <div className="fm3d-filter-empty">
                                        <p>
                                            {stations.length
                                                ? 'Không có máy phù hợp với bộ lọc.'
                                                : 'Nhà xưởng chưa có máy/trạm được phân công.'}
                                        </p>
                                        {hasMachineFilters && stations.length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={clearMachineFilters}
                                            >
                                                Xem tất cả máy
                                            </Button>
                                        )}
                                    </div>
                                )}
                                <div className="fm3d-station-list">
                                    {filtered.map((station) => {
                                        const placed = layout.objects.find(
                                            (item) => item.workstation_id === station.id,
                                        );
                                        return (
                                            <button
                                                type="button"
                                                key={station.id}
                                                className={`fm3d-station ${selectedStation?.id === station.id ? 'fm3d-selected' : ''}`}
                                                aria-pressed={selectedStation?.id === station.id}
                                                onClick={() => pickStation(station)}
                                            >
                                                <strong className="fm3d-mono">
                                                    {station.code}
                                                </strong>
                                                <span>{station.name}</span>
                                                <MachineState state={station.state} />
                                                <span className="fm3d-muted">
                                                    {placed
                                                        ? 'Đã bố trí'
                                                        : 'Chưa đặt trên mặt bằng'}{' '}
                                                    · {station.active_operations.length} công đoạn
                                                    đang làm
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                            {editing && (
                                <section className="fm3d-panel">
                                    <h3>Đối tượng trên mặt bằng</h3>
                                    <div className="fm3d-object-list">
                                        {layout.objects.map((item) => (
                                            <Button
                                                key={item.id}
                                                variant={
                                                    selectedId === item.id ? 'secondary' : 'ghost'
                                                }
                                                size="sm"
                                                onClick={() => {
                                                    pickObject(item.id);
                                                    setFloorId(item.floor_id);
                                                    setFocusId(item.id);
                                                    setEditorTab('objects');
                                                }}
                                            >
                                                {item.label}
                                            </Button>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </section>
                        <aside
                            className="fm3d-panel fm3d-inspector"
                            aria-label={editing ? 'Công cụ chỉnh mặt bằng' : 'Chi tiết máy'}
                        >
                            {editing ? (
                                <fieldset
                                    disabled={draft.busy || !workspace.layoutData}
                                    className="fm3d-editor-fieldset"
                                >
                                    <div
                                        className="fm3d-row"
                                        role="group"
                                        aria-label="Công cụ chỉnh sửa"
                                    >
                                        <Button
                                            variant={
                                                editorTab === 'building' ? 'secondary' : 'ghost'
                                            }
                                            size="sm"
                                            aria-pressed={editorTab === 'building'}
                                            onClick={() => setEditorTab('building')}
                                        >
                                            Tầng / khu vực
                                        </Button>
                                        <Button
                                            variant={
                                                editorTab === 'objects' ? 'secondary' : 'ghost'
                                            }
                                            size="sm"
                                            aria-pressed={editorTab === 'objects'}
                                            onClick={() => setEditorTab('objects')}
                                        >
                                            Máy / kết cấu
                                        </Button>
                                    </div>
                                    {editorTab === 'building' ? (
                                        <BuildingEditor
                                            layout={layout}
                                            onChange={draft.setLayout}
                                            floorId={floorId}
                                            onFloorChange={setFloorId}
                                        />
                                    ) : (
                                        <div className="fm3d-stack">
                                            <ObjectEditor
                                                layout={layout}
                                                stations={stations}
                                                assets={workspace.assets}
                                                floorId={floorId}
                                                selectedId={selectedId}
                                                onSelect={pickObject}
                                                onChange={draft.setLayout}
                                            />
                                            <AssetUpload
                                                api={api}
                                                factoryId={factoryId}
                                                onUploaded={workspace.addAsset}
                                                disabled={Boolean(workspace.errors.assets)}
                                            />
                                        </div>
                                    )}
                                </fieldset>
                            ) : (
                                <StationDetails
                                    station={selectedStation}
                                    object={selectedObject}
                                    orders={snapshot.data?.orders}
                                    timezone={factory.timezone}
                                    onOrder={setOrder}
                                />
                            )}
                        </aside>
                    </div>
                    <section className="fm3d-panel fm3d-stack">
                        <h2>Lệnh sản xuất ({orders.length})</h2>
                        <p className="fm3d-muted">
                            Sản lượng thành phẩm lấy từ lệnh; vị trí là máy/công đoạn được ghi nhận,
                            không phải định vị vật lý liên tục.
                        </p>
                        <div className="fm3d-table-wrap">
                            <table className="fm3d-table">
                                <thead>
                                    <tr>
                                        <th>Lệnh</th>
                                        <th>Trạng thái lệnh</th>
                                        <th>Thành phẩm / kế hoạch</th>
                                        <th>Hạn giao</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map((item) => (
                                        <tr key={item.id}>
                                            <td className="fm3d-mono">
                                                {item.order_no}
                                                {item.partial_scope && (
                                                    <div className="fm3d-muted">
                                                        Phạm vi công đoạn giới hạn
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <OrderStatus status={item.status} />
                                            </td>
                                            <td>
                                                {item.produced_qty} / {item.planned_qty} ·{' '}
                                                {item.progress_pct ?? '—'}%
                                            </td>
                                            <td>
                                                {item.due_date || 'Chưa có hạn'}
                                                {item.is_overdue && (
                                                    <span className="fm3d-overdue"> · Quá hạn</span>
                                                )}
                                            </td>
                                            <td>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setOrder(item)}
                                                >
                                                    Chi tiết
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {snapshot.data && !orders.length && (
                            <p>Chưa có lệnh phù hợp được ghi nhận.</p>
                        )}
                    </section>
                </div>
            )}
            {adminOpen && catalog?.is_admin && (
                <FactoryAdmin
                    key={factoryId || 'new'}
                    api={api}
                    catalog={catalog}
                    factory={factory}
                    onClose={() => setAdminOpen(false)}
                    onSaved={(saved, complete) => {
                        setCatalog((current) => ({
                            ...current,
                            factories: [
                                ...current.factories.filter((item) => item.id !== saved.id),
                                saved,
                            ],
                        }));
                        refreshCatalog();
                        if (complete) chooseFactory(saved.id);
                    }}
                />
            )}
            {order && factory && !forbidden && (
                <OrderDetail
                    key={`${factory.id}-${order.id}`}
                    api={api}
                    factoryId={factory.id}
                    order={order}
                    onClose={() => setOrder(null)}
                />
            )}
        </div>
    );
}

Index.layout = (page) => <AppLayout>{page}</AppLayout>;

import React, { useEffect, useRef, useState } from 'react';
import { Button, InlineAlert, Modal, StatusBadge } from '@openmes/ui';
import { errorText, safeLocalUrl } from '../lib/api';
import { formatTime, orderLabel, orderTone } from '../lib/layout';
import { stationState } from '../lib/theme.mjs';

export function MachineState({ state }) {
    const tone = stationState(state);
    return (
        <span
            className={`fm3d-machine-state ${tone.pattern ? 'fm3d-machine-unknown' : ''}`}
            style={{ '--fm3d-state': `var(${tone.token})` }}
        >
            <span aria-hidden="true" />
            {tone.label}
        </span>
    );
}

export function OrderStatus({ status }) {
    return (
        <StatusBadge
            label={orderLabel(status)}
            tone={orderTone(status)}
            icon={
                status === 'DONE' || status === 'COMPLETED'
                    ? 'circle-check'
                    : status === 'BLOCKED'
                      ? 'circle-alert'
                      : 'circle-dot'
            }
            size="sm"
        />
    );
}

function Operation({ operation, timezone }) {
    return (
        <div className="fm3d-operation">
            <strong className="fm3d-mono">{operation.order_no || 'Chưa có mã lệnh'}</strong>
            <div>{operation.step_name}</div>
            <div className="fm3d-muted">
                Lô: {operation.batch_number || operation.lot_number || 'Chưa có mã'} ·{' '}
                {operation.status || 'Chưa có trạng thái'}
            </div>
            <div>
                Đạt: {operation.passed_qty ?? '—'} · Phế: {operation.scrap_qty ?? '—'}
            </div>
            <div className="fm3d-muted">Bắt đầu: {formatTime(operation.started_at, timezone)}</div>
            {operation.completed_at && (
                <div className="fm3d-muted">
                    Hoàn tất: {formatTime(operation.completed_at, timezone)}
                </div>
            )}
        </div>
    );
}

export function OrderDetail({ api, factoryId, order, onClose }) {
    const [result, setResult] = useState({ loading: true, data: null, error: null });
    const [moreLoading, setMoreLoading] = useState(false),
        [moreError, setMoreError] = useState(null);
    const moreRequest = useRef(null),
        generation = useRef(0);
    useEffect(() => {
        generation.current += 1;
        const controller = new AbortController();
        setResult({ loading: true, data: null, error: null });
        setMoreLoading(false);
        setMoreError(null);
        api(`/factories/${factoryId}/orders/${order.id}`, { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted) setResult({ loading: false, data, error: null });
            })
            .catch((error) => {
                if (!controller.signal.aborted) setResult({ loading: false, data: null, error });
            });
        return () => {
            generation.current += 1;
            controller.abort();
            moreRequest.current?.abort();
        };
    }, [api, factoryId, order.id]);
    const data = result.data;
    async function loadMore() {
        if (moreLoading || !data?.next_cursor) return;
        const current = generation.current,
            controller = new AbortController();
        moreRequest.current = controller;
        setMoreLoading(true);
        setMoreError(null);
        try {
            const next = await api(
                `/factories/${factoryId}/orders/${order.id}?after_step_id=${encodeURIComponent(data.next_cursor)}`,
                { signal: controller.signal },
            );
            if (current !== generation.current || controller.signal.aborted) return;
            setResult((value) => ({
                ...value,
                data: {
                    ...value.data,
                    next_cursor: next.next_cursor,
                    operations: [...(value.data.operations || []), ...(next.operations || [])],
                },
            }));
        } catch (error) {
            if (current === generation.current && !controller.signal.aborted) setMoreError(error);
        } finally {
            if (current === generation.current) setMoreLoading(false);
        }
    }
    return (
        <Modal
            open
            title={`Lệnh ${order.order_no}`}
            onClose={onClose}
            closeLabel="Đóng chi tiết lệnh"
            width={700}
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Đóng
                </Button>
            }
        >
            {result.loading && <p role="status">Đang tải công đoạn thuộc xưởng…</p>}
            {result.error && (
                <InlineAlert severity="error" title="Không đọc được lệnh">
                    {errorText(result.error)}
                </InlineAlert>
            )}
            {data && (
                <div className="fm3d-stack">
                    <OrderStatus status={data.status || order.status} />
                    <p>
                        Kế hoạch: {data.planned_qty ?? order.planned_qty} · Thành phẩm:{' '}
                        {data.produced_qty ?? order.produced_qty}
                    </p>
                    {(data.partial_scope || order.partial_scope) && (
                        <InlineAlert severity="info" title="Phạm vi được giới hạn">
                            Chỉ hiển thị công đoạn thuộc xưởng được phân quyền.
                        </InlineAlert>
                    )}
                    {(data.operations || data.active_operations || []).map((operation, index) => (
                        <Operation
                            key={operation.step_id || index}
                            operation={operation}
                            timezone={data.timezone}
                        />
                    ))}
                    {moreError && (
                        <InlineAlert severity="error" title="Không tải được công đoạn tiếp theo">
                            {errorText(moreError)}
                        </InlineAlert>
                    )}
                    {data.next_cursor && (
                        <Button variant="ghost" onClick={loadMore} loading={moreLoading}>
                            Tải thêm công đoạn
                        </Button>
                    )}
                </div>
            )}
        </Modal>
    );
}

export default function StationDetails({ station, object, orders = [], timezone, onOrder }) {
    if (!station)
        return (
            <div className="fm3d-empty">
                Chọn máy trong cảnh hoặc danh sách để xem trạng thái và công việc.
            </div>
        );
    const relevant = orders.filter(
        (order) =>
            order.active_station_ids?.includes(station.id) ||
            order.last_station_id === station.id ||
            (station.active_operations || []).some(
                (operation) => operation.work_order_id === order.id,
            ),
    );
    return (
        <div className="fm3d-stack">
            <h2>{station.name}</h2>
            <div className="fm3d-mono">
                {station.code} · {station.line_name || 'Chưa có dây chuyền'}
            </div>
            <MachineState state={station.state} />
            <dl className="fm3d-description">
                <dt>Nguồn trạng thái</dt>
                <dd>{station.state_source || 'Chưa có dữ liệu'}</dd>
                <dt>Từ lúc</dt>
                <dd>{formatTime(station.state_since, timezone)}</dd>
                <dt>Vị trí mặt bằng</dt>
                <dd>
                    {object
                        ? `${object.position.x}, ${object.position.y}, ${object.position.z} m`
                        : 'Chưa đặt trên mặt bằng'}
                </dd>
                <dt>Xác minh vị trí</dt>
                <dd>{object?.verified_position ? 'Đã xác minh' : 'Chưa xác minh'}</dd>
                <dt>Hình dáng mô hình</dt>
                <dd>
                    {object?.asset_id
                        ? object.verified_geometry
                            ? 'Đã xác minh'
                            : 'Chưa xác minh'
                        : 'Chưa có mô hình GLB'}
                </dd>
            </dl>
            <h3>Công đoạn đang thực hiện ({station.active_operations?.length || 0})</h3>
            {!station.active_operations?.length && (
                <p className="fm3d-muted">
                    Chưa có công đoạn đang thực hiện được ghi nhận. Trạng thái máy được hiển thị độc
                    lập.
                </p>
            )}
            {(station.active_operations || []).map((operation) => (
                <Operation key={operation.step_id} operation={operation} timezone={timezone} />
            ))}
            {station.last_operation && (
                <details>
                    <summary>Công đoạn gần nhất</summary>
                    <Operation operation={station.last_operation} timezone={timezone} />
                </details>
            )}
            <h3>Lệnh liên quan</h3>
            {!relevant.length && (
                <p className="fm3d-muted">Chưa có lệnh liên quan trong dữ liệu hiện tại.</p>
            )}
            {relevant.map((order) => (
                <article key={order.id} className="fm3d-operation">
                    <div className="fm3d-row">
                        <strong className="fm3d-mono">{order.order_no}</strong>
                        <OrderStatus status={order.status} />
                    </div>
                    <div>
                        {order.produced_qty} / {order.planned_qty} thành phẩm ·{' '}
                        {order.progress_pct ?? '—'}%
                    </div>
                    {order.is_overdue && (
                        <StatusBadge label="Quá hạn" tone="danger" icon="clock-alert" />
                    )}
                    {order.partial_scope && (
                        <p className="fm3d-muted">Chỉ hiển thị công đoạn được phân quyền.</p>
                    )}
                    <div className="fm3d-row">
                        <Button size="sm" variant="ghost" onClick={() => onOrder(order)}>
                            Xem công đoạn
                        </Button>
                        {safeLocalUrl(order.url) && (
                            <a className="fm3d-link" href={safeLocalUrl(order.url)}>
                                Mở lệnh trong MES
                            </a>
                        )}
                    </div>
                </article>
            ))}
            <h3>Sự cố ({station.issues?.length || 0})</h3>
            {!station.issues?.length && (
                <p className="fm3d-muted">Không có sự cố đang mở được ghi nhận.</p>
            )}
            {(station.issues || []).map((issue) => (
                <div key={issue.id}>
                    {safeLocalUrl(issue.url) ? (
                        <a className="fm3d-link" href={safeLocalUrl(issue.url)}>
                            {issue.title}
                        </a>
                    ) : (
                        issue.title
                    )}
                    <span className="fm3d-muted"> · {issue.status}</span>
                </div>
            ))}
        </div>
    );
}

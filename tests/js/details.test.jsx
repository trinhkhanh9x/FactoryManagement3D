import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StationDetails, {
    OrderDetail,
    OrderStatus,
} from '../../resources/js/components/StationDetails';
import {
    formatTime,
    orderLabel,
    orderTone,
    validateLayout,
    entityId,
} from '../../resources/js/lib/layout';
import { mount, station, machine, order, click, layout } from './uiHelpers';

const screens = [];
async function render(component) {
    const screen = await mount(component);
    screens.push(screen);
    return screen;
}
afterEach(async () => {
    for (const screen of screens.splice(0)) await screen.close();
    vi.restoreAllMocks();
});

describe('machine operational detail', () => {
    it('shows unplaced machine, last record and empty concurrent work without inventing machine state', async () => {
        const historical = {
            step_id: 4,
            order_no: null,
            batch_number: null,
            lot_number: 'LOT4',
            step_name: 'Đo kiểm',
            status: null,
            passed_qty: null,
            scrap_qty: null,
            started_at: '2026-10-19T01:00:00Z',
            completed_at: '2026-10-19T02:00:00Z',
        };
        const { host } = await render(
            <StationDetails
                station={{
                    ...station,
                    line_name: null,
                    state: 'IDLE',
                    state_source: 'Operator',
                    active_operations: [],
                    last_operation: historical,
                }}
                orders={[]}
                timezone="Asia/Ho_Chi_Minh"
            />,
        );
        expect(host.textContent).toContain('Chưa đặt trên mặt bằng');
        expect(host.textContent).toContain('Chưa có công đoạn đang thực hiện');
        expect(host.textContent).toContain('LOT4');
        expect(host.textContent).toContain('Chưa có mã lệnh');
        expect(host.textContent).toContain('Hoàn tất:');
        expect(host.textContent).toContain('Chưa có lệnh liên quan');
        expect(host.textContent).toContain('Nhàn rỗi');
    });
    it('reports verified geometry and opens related orders while refusing unsafe issue links', async () => {
        const selected = vi.fn();
        const { host } = await render(
            <StationDetails
                station={{
                    ...station,
                    issues: [
                        { id: 1, title: 'Cần bảo trì', status: 'OPEN', url: '/issues/1' },
                        { id: 2, title: 'URL bị chặn', status: 'OPEN', url: 'javascript:alert(1)' },
                    ],
                }}
                object={{
                    ...machine,
                    asset_id: 8,
                    verified_position: true,
                    verified_geometry: true,
                }}
                orders={[
                    {
                        ...order,
                        status: 'DONE',
                        is_overdue: false,
                        partial_scope: false,
                        active_station_ids: [],
                        last_station_id: 1,
                    },
                    {
                        ...order,
                        id: 2,
                        status: 'BLOCKED',
                        active_station_ids: [],
                        last_station_id: null,
                        url: null,
                        progress_pct: null,
                    },
                ]}
                onOrder={selected}
            />,
        );
        expect(host.textContent).toContain('Đã xác minh');
        expect(host.textContent).toContain('Cần bảo trì');
        expect(host.querySelector('a[href="javascript:alert(1)"]')).toBeNull();
        expect(host.querySelector('a[href="/issues/1"]')).not.toBeNull();
        await click(host, 'Xem công đoạn');
        expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });
    it('distinguishes absent versus present but unverified model', async () => {
        const screen = await render(
            <StationDetails station={station} object={{ ...machine, asset_id: 8 }} />,
        );
        expect(screen.host.textContent).toContain('Chưa xác minh');
        await screen.render(<StationDetails />);
        expect(screen.host.textContent).toContain('Chọn máy trong cảnh');
        await screen.render(<OrderStatus status="COMPLETED" />);
        expect(screen.host.textContent).toBe('Hoàn thành');
    });
});

describe('paginated order history', () => {
    it('loads additional local steps without truncating the first page and closes on request', async () => {
        const close = vi.fn(),
            api = vi
                .fn()
                .mockResolvedValueOnce({
                    ...order,
                    operations: [station.active_operations[0]],
                    next_cursor: 200,
                })
                .mockResolvedValueOnce({
                    ...order,
                    operations: [station.active_operations[1]],
                    next_cursor: null,
                });
        const { host } = await render(
            <OrderDetail api={api} factoryId={1} order={order} onClose={close} />,
        );
        expect(host.textContent).toContain('Tiện thô');
        expect(host.textContent).not.toContain('Tiện tinh');
        await click(host, 'Tải thêm công đoạn');
        expect(api.mock.calls[1][0]).toBe('/factories/1/orders/1?after_step_id=200');
        expect(host.textContent).toContain('Tiện thô');
        expect(host.textContent).toContain('Tiện tinh');
        expect(host.textContent).not.toContain('Tải thêm công đoạn');
        await click(host, 'Đóng');
        expect(close).toHaveBeenCalled();
    });
    it('retains first page on pagination failure and permits retry', async () => {
        const api = vi
            .fn()
            .mockResolvedValueOnce({
                ...order,
                status: null,
                planned_qty: null,
                produced_qty: null,
                operations: [{ step_name: 'Bước chưa đủ metadata' }],
                next_cursor: 1,
            })
            .mockRejectedValueOnce(new Error('Kết nối lỗi'))
            .mockResolvedValueOnce({ ...order, next_cursor: null });
        const { host } = await render(
            <OrderDetail api={api} factoryId={1} order={order} onClose={vi.fn()} />,
        );
        await click(host, 'Tải thêm công đoạn');
        expect(host.textContent).toContain('Kết nối lỗi');
        expect(host.textContent).toContain('Bước chưa đủ metadata');
        await click(host, 'Tải thêm công đoạn');
        expect(host.textContent).not.toContain('Kết nối lỗi');
        expect(host.textContent).toContain('Bước chưa đủ metadata');
    });
    it('discards departed page responses after switching factory and order', async () => {
        let resolve;
        const api = vi
            .fn()
            .mockResolvedValueOnce({
                ...order,
                operations: [station.active_operations[0]],
                next_cursor: 1,
            })
            .mockImplementationOnce(
                () =>
                    new Promise((done) => {
                        resolve = done;
                    }),
            )
            .mockResolvedValueOnce({ ...order, id: 2, order_no: 'OTHER', operations: [] });
        const screen = await render(
            <OrderDetail api={api} factoryId={1} order={order} onClose={vi.fn()} />,
        );
        await click(screen.host, 'Tải thêm công đoạn');
        await screen.render(
            <OrderDetail
                api={api}
                factoryId={2}
                order={{ ...order, id: 2, order_no: 'OTHER' }}
                onClose={vi.fn()}
            />,
        );
        await act(async () =>
            resolve({ ...order, operations: [{ step_name: 'Không được rò rỉ' }] }),
        );
        expect(screen.host.textContent).not.toContain('Không được rò rỉ');
        expect(api.mock.calls[1][1].signal.aborted).toBe(true);
    });
    it('shows initial fetch errors and supports legacy local operation shape', async () => {
        const fail = vi.fn().mockRejectedValue(new Error('Không có quyền'));
        const screen = await render(
            <OrderDetail api={fail} factoryId={1} order={order} onClose={vi.fn()} />,
        );
        expect(screen.host.textContent).toContain('Không có quyền');
        const api = vi.fn().mockResolvedValue({
            partial_scope: false,
            active_operations: [{ step_name: 'Bước cũ' }],
        });
        await screen.render(
            <OrderDetail
                api={api}
                factoryId={1}
                order={{ ...order, partial_scope: false }}
                onClose={vi.fn()}
            />,
        );
        expect(screen.host.textContent).toContain('Bước cũ');
    });
});

describe('layout boundary helpers', () => {
    it('keeps unexpected status and invalid timestamps explicit', () => {
        expect(orderTone('OTHER')).toBe('neutral');
        expect(orderLabel()).toBe('Chưa có dữ liệu');
        expect(orderLabel('OTHER')).toBe('OTHER');
        expect(formatTime('invalid')).toBe('Chưa có dữ liệu');
        expect(formatTime('2026-10-19T00:00:00Z', 'invalid-zone')).not.toBe('Chưa có dữ liệu');
    });
    it('rejects cross-floor zones, invalid geometry, duplicate entity ids and unusable schema', () => {
        expect(validateLayout(null)).toHaveLength(1);
        const invalid = {
            ...layout,
            zones: [{ id: 'z', name: '', floor_id: 'missing', polygon: [] }],
            objects: [{ ...machine, id: 'f1', zone_id: 'z', position: { x: NaN }, rotation: {} }],
        };
        const messages = validateLayout(invalid).join(' ');
        expect(messages).toContain('trùng');
        expect(messages).toContain('Khu vực không thuộc cùng tầng');
        expect(messages).toContain('số hữu hạn');
        expect(entityId('floor')).toMatch(/^floor-/);
    });
});

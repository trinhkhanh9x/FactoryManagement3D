import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
export async function mount(component) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
        root.render(component);
    });
    return {
        host,
        async render(next) {
            await act(async () => root.render(next));
        },
        async close() {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}
export async function click(host, text) {
    const button = [...host.querySelectorAll('button')].find(
        (item) => item.textContent.trim() === text || item.getAttribute('aria-label') === text,
    );
    if (!button) throw new Error(`Button missing: ${text}`);
    await act(async () => button.click());
    return button;
}
export function field(host, label) {
    const target = [...host.querySelectorAll('label')].find(
        (item) => item.textContent.startsWith(label) && !item.closest('details:not([open])'),
    );
    if (!target) throw new Error(`Field missing: ${label}`);
    return target.querySelector('input,select,textarea');
}
export async function fill(host, label, value) {
    const input = field(host, label);
    await act(async () => {
        const proto =
            input.tagName === 'SELECT'
                ? HTMLSelectElement.prototype
                : input.tagName === 'TEXTAREA'
                  ? HTMLTextAreaElement.prototype
                  : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, String(value));
        input.dispatchEvent(
            new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
        );
    });
}
export async function check(host, label) {
    await act(async () => field(host, label).click());
}
export const floor = {
    id: 'f1',
    name: 'Tầng một',
    elevation: 0,
    thickness: 0.2,
    polygon: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
    ],
    verified: false,
};
export const machine = {
    id: 'm1',
    kind: 'machine',
    label: 'Máy Tiện',
    floor_id: 'f1',
    zone_id: null,
    workstation_id: 1,
    asset_id: null,
    position: { x: 1, y: 0, z: 1 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: { width: 2, height: 2, depth: 2 },
    verified_position: false,
    verified_geometry: false,
};
export const layout = { schema_version: 1, floors: [floor], zones: [], objects: [machine] };
export const station = {
    id: 1,
    code: 'MC1',
    name: 'Tiện',
    line_id: 1,
    line_name: 'CNC',
    state: 'UNKNOWN',
    state_source: null,
    state_since: null,
    active_operations: [
        {
            step_id: 1,
            batch_id: 1,
            batch_number: 'B1',
            order_no: 'WO1',
            work_order_id: 1,
            step_name: 'Tiện thô',
            status: 'IN_PROGRESS',
            passed_qty: 2,
            scrap_qty: 1,
        },
        {
            step_id: 2,
            batch_id: 2,
            batch_number: 'B2',
            order_no: 'WO2',
            work_order_id: 2,
            step_name: 'Tiện tinh',
            status: 'IN_PROGRESS',
            passed_qty: 1,
            scrap_qty: 0,
        },
    ],
    last_operation: null,
    issues: [],
};
export const factory = {
    id: 1,
    code: 'F1',
    name: 'Xưởng 1',
    timezone: 'Asia/Ho_Chi_Minh',
    is_active: true,
    line_ids: [1],
    can_edit: true,
    workstation_count: 1,
};
export const catalog = {
    is_admin: true,
    factories: [factory],
    lines: [
        { id: 1, code: 'L1', name: 'CNC', factory_id: 1 },
        { id: 2, code: 'L2', name: 'Cắt', factory_id: null },
    ],
    users: [{ id: 5, name: 'Quản lý' }],
};
export const order = {
    id: 1,
    order_no: 'WO1',
    status: 'IN_PROGRESS',
    planned_qty: 10,
    produced_qty: 2,
    progress_pct: 20,
    due_date: '2026-10-01',
    is_overdue: true,
    active_station_ids: [1],
    last_station_id: 1,
    partial_scope: true,
    url: '/work-orders/1',
};
export const snapshot = {
    factory_id: 1,
    fetched_at: '2026-10-19T12:00:00Z',
    layout_revision: 1,
    stations: [station],
    orders: [order],
    summary: {
        total_machines: 1,
        running: 0,
        unknown: 1,
        active_orders: 2,
        overdue_orders: 1,
        open_issues: 0,
    },
};
export const layoutData = { factory, version: 1, published_version: 1, layout, can_edit: true };
export function mockApi(overrides = {}) {
    return vi.fn(async (path, options) => {
        if (overrides[path]) return overrides[path](options);
        if (path === '/catalog') return catalog;
        if (path.endsWith('/snapshot')) return snapshot;
        if (path.includes('/layout')) return layoutData;
        if (path.endsWith('/assets')) return { assets: [] };
        if (path.endsWith('/members')) return { members: [] };
        if (path.includes('/orders/')) return { ...order, operations: station.active_operations };
        return factory;
    });
}

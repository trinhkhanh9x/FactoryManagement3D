import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const engine = vi.hoisted(() => ({
    update: vi.fn(),
    dispose: vi.fn(),
    callbacks: null,
    fail: false,
}));
vi.mock('../../resources/js/lib/renderer.mjs', () => ({
    createFactoryRenderer: (_host, callbacks) => {
        if (engine.fail) throw new Error('WebGL 2 không khả dụng');
        engine.callbacks = callbacks;
        return engine;
    },
}));
import FactoryScene from '../../resources/js/components/FactoryScene.jsx';
let container, root;
const layout = {
    floors: [{ id: 'f' }],
    objects: [
        {
            id: 'm',
            kind: 'machine',
            floor_id: 'f',
            label: 'Máy tiện',
            workstation_id: 1,
            asset_id: null,
            verified_position: false,
            verified_geometry: false,
        },
    ],
};
beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
    engine.fail = false;
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});
test('scene labels remain accessible and show state, missing model and unverified flags', () => {
    const onSelect = vi.fn();
    act(() =>
        root.render(
            <FactoryScene
                layout={layout}
                stations={[{ id: 1, state: 'FAULT' }]}
                onSelect={onSelect}
            />,
        ),
    );
    expect(container.textContent).toContain('Lỗi máy');
    expect(container.textContent).toContain('Chưa xác minh');
    expect(container.textContent).toContain('Chưa có mô hình');
    act(() => container.querySelector('button').click());
    expect(onSelect).toHaveBeenCalledWith('m');
    act(() =>
        root.render(
            <FactoryScene
                layout={layout}
                selectedId="m"
                stations={[{ id: 1, state: 'RUNNING' }]}
                assets={[{ id: null }]}
                onSelect={onSelect}
            />,
        ),
    );
    expect(container.querySelector('button').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toContain('Chưa có mô hình');
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ selectedId: 'm' }));
});
test('callbacks use current props and model load errors remain visible', () => {
    const onMove = vi.fn(),
        onError = vi.fn(),
        onSelect = vi.fn();
    act(() =>
        root.render(
            <FactoryScene layout={layout} onMove={onMove} onError={onError} onSelect={onSelect} />,
        ),
    );
    act(() => {
        engine.callbacks.onMove('m', { x: 1, y: 0, z: 2 });
        engine.callbacks.onSelect(null);
        engine.callbacks.onError('Mô hình lỗi');
    });
    expect(onMove).toHaveBeenCalledWith('m', { x: 1, y: 0, z: 2 });
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onError).toHaveBeenCalledWith('Mô hình lỗi');
    expect(container.querySelector('[role="status"]').textContent).toBe('Mô hình lỗi');
});
test('renderer initialization failure is actionable and does not crash host', () => {
    engine.fail = true;
    const onError = vi.fn();
    act(() => root.render(<FactoryScene layout={layout} onError={onError} />));
    expect(container.textContent).toContain('WebGL 2');
    expect(container.querySelector('button')).toBeNull();
    expect(onError).toHaveBeenCalled();
});
test('empty scene and renderer update failures have clear messages', () => {
    act(() => root.render(<FactoryScene layout={{ floors: [], objects: [] }} />));
    expect(container.textContent).toContain('Chưa có mặt bằng');
    engine.update.mockImplementationOnce(() => {
        throw new Error('Dữ liệu không hợp lệ');
    });
    act(() => root.render(<FactoryScene layout={layout} />));
    expect(container.textContent).toContain('Dữ liệu không hợp lệ');
});
test('planned state text uses readable foreground and reset/snap props reach renderer', () => {
    act(() =>
        root.render(
            <FactoryScene
                layout={layout}
                stations={[{ id: 1, state: 'MAINTENANCE' }]}
                resetKey={2}
                snap={0.5}
                showStructure={false}
            />,
        ),
    );
    expect(container.querySelector('small').style.color).toBe('var(--om-ink)');
    expect(container.querySelector('small span').style.backgroundColor).toBe('var(--om-planned)');
    expect(engine.update).toHaveBeenCalledWith(
        expect.objectContaining({ resetKey: 2, snap: 0.5, showStructure: false }),
    );
});

import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useSnapshot from '../../resources/js/hooks/useSnapshot';
import useFactoryWorkspace from '../../resources/js/hooks/useFactoryWorkspace';
import useLayoutDraft from '../../resources/js/hooks/useLayoutDraft';
import useUnsavedGuard from '../../resources/js/hooks/useUnsavedGuard';
import { emptyLayout } from '../../resources/js/lib/layout';
import { mount, layoutData, snapshot, mockApi } from './uiHelpers';

const inertia = vi.hoisted(() => ({ handler: null, remove: vi.fn() }));
vi.mock('@inertiajs/react', () => ({
    router: {
        on: vi.fn((_, handler) => {
            inertia.handler = handler;
            return inertia.remove;
        }),
    },
}));
const screens = [];
async function render(component) {
    const screen = await mount(component);
    screens.push(screen);
    return screen;
}
afterEach(async () => {
    for (const screen of screens.splice(0)) await screen.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('scoped snapshot hook', () => {
    it('retains data on network failures, marks stale and resumes updates', async () => {
        vi.useFakeTimers();
        let current;
        const api = vi
            .fn()
            .mockResolvedValueOnce(snapshot)
            .mockRejectedValueOnce(new Error('Mất mạng'))
            .mockResolvedValue(snapshot);
        function Harness() {
            current = useSnapshot(api, 1);
            return null;
        }
        await render(<Harness />);
        expect(current.data).toEqual(snapshot);
        await act(async () => vi.advanceTimersByTimeAsync(10000));
        expect(current.data).toEqual(snapshot);
        expect(current.error.message).toBe('Mất mạng');
        await act(async () => vi.advanceTimersByTimeAsync(15000));
        expect(current.stale).toBe(false);
        await act(async () => vi.advanceTimersByTimeAsync(5000));
        expect(current.error).toBeNull();
        expect(current.stale).toBe(false);
        await act(async () => current.refresh());
        expect(api).toHaveBeenCalledTimes(4);
    });
    it('clears protected cache and halts polling immediately after revoked access', async () => {
        vi.useFakeTimers();
        let current;
        const api = vi
            .fn()
            .mockResolvedValueOnce(snapshot)
            .mockRejectedValue(Object.assign(new Error('Quyền bị thu hồi'), { status: 403 }));
        function Harness() {
            current = useSnapshot(api, 1);
            return null;
        }
        await render(<Harness />);
        expect(current.data).not.toBeNull();
        await act(async () => vi.advanceTimersByTimeAsync(10000));
        expect(current.data).toBeNull();
        expect(current.lastSuccess).toBeNull();
        await act(async () => vi.advanceTimersByTimeAsync(60000));
        expect(api).toHaveBeenCalledTimes(2);
    });
    it('drops late factory responses and never shows another factory cache during switching', async () => {
        let resolveA, current;
        const api = vi.fn((path) =>
            path.includes('/1/')
                ? new Promise((resolve) => {
                      resolveA = resolve;
                  })
                : Promise.resolve({ ...snapshot, factory_id: 2 }),
        );
        function Harness({ id }) {
            current = useSnapshot(api, id);
            return null;
        }
        const screen = await render(<Harness id={1} />);
        await screen.render(<Harness id={2} />);
        await act(async () => resolveA(snapshot));
        expect(current.data.factory_id).toBe(2);
        await screen.render(<Harness id={null} />);
        expect(current.data).toBeNull();
    });
});

describe('published workspace', () => {
    it('loads independent errors and refreshes published geometry when revision changes', async () => {
        let current;
        const api = mockApi();
        function Harness({ revision = 1, editing = false }) {
            current = useFactoryWorkspace(api, 1, editing, revision);
            return null;
        }
        const screen = await render(<Harness />);
        expect(current.layout).toEqual(layoutData.layout);
        expect(current.assets).toEqual([]);
        await screen.render(<Harness revision={2} />);
        expect(api.mock.calls.filter((call) => call[0] === '/factories/1/layout')).toHaveLength(2);
        await screen.render(<Harness revision={2} />);
        expect(api.mock.calls.filter((call) => call[0] === '/factories/1/layout')).toHaveLength(2);
        await screen.render(<Harness revision={2} editing />);
        expect(api.mock.calls.some((call) => call[0].endsWith('?draft=1'))).toBe(true);
        const before = api.mock.calls.length;
        await screen.render(<Harness revision={3} editing />);
        expect(api).toHaveBeenCalledTimes(before);
        await act(async () => current.addAsset({ id: 4 }));
        expect(current.assets).toEqual([{ id: 4 }]);
        await act(async () => current.applySaved({ ...layoutData, version: 3 }));
        expect(current.layoutData.version).toBe(3);
        await act(async () => current.reload());
        expect(api.mock.calls.length).toBeGreaterThan(before);
    });
    it('does not allow departed requests to leak layouts or assets into next scope', async () => {
        let resolveLayout, current;
        const api = vi.fn((path) =>
            path.includes('/1/layout')
                ? new Promise((resolve) => {
                      resolveLayout = resolve;
                  })
                : path.endsWith('/assets')
                  ? Promise.reject(new Error('Tài sản lỗi'))
                  : Promise.resolve({ ...layoutData, layout: emptyLayout() }),
        );
        function Harness({ id }) {
            current = useFactoryWorkspace(api, id, false);
            return null;
        }
        const screen = await render(<Harness id={1} />);
        await screen.render(<Harness id={2} />);
        await act(async () => resolveLayout(layoutData));
        expect(current.layout).toEqual(emptyLayout());
        expect(current.errors.assets.message).toBe('Tài sản lỗi');
        await screen.render(<Harness id={null} />);
        expect(current.layoutData).toBeNull();
        expect(current.assets).toEqual([]);
    });
});

describe('draft optimistic concurrency', () => {
    it('saves with expected revision, keeps success notice and publishes saved data only', async () => {
        let current;
        const api = vi.fn().mockResolvedValue({ ...layoutData, version: 2 }),
            saved = vi.fn();
        function Harness({ data = layoutData }) {
            current = useLayoutDraft(api, 1, data, saved);
            return null;
        }
        const screen = await render(<Harness />);
        await act(async () => current.setLayout({ ...layoutData.layout, zones: [] }));
        await act(async () => current.save());
        expect(api.mock.calls[0][1].body.expected_version).toBe(1);
        expect(saved).toHaveBeenCalled();
        expect(current.notice).toContain('Đã lưu');
        await screen.render(<Harness data={{ ...layoutData, version: 2 }} />);
        expect(current.notice).toContain('Đã lưu');
        await act(async () => current.publish());
        expect(api.mock.calls[1][0]).toContain('/publish');
        expect(current.notice).toContain('Đã công bố');
    });
    it('retains unsaved input after conflict and invalid input never reaches API', async () => {
        let current;
        const api = vi
            .fn()
            .mockRejectedValue(Object.assign(new Error('Xung đột'), { status: 409 }));
        function Harness() {
            current = useLayoutDraft(api, 1, layoutData, vi.fn());
            return null;
        }
        await render(<Harness />);
        await act(async () =>
            current.setLayout({
                ...layoutData.layout,
                floors: layoutData.layout.floors.map((floor) => ({
                    ...floor,
                    name: 'Tên chưa lưu',
                })),
            }),
        );
        await act(async () => current.save());
        expect(current.error.status).toBe(409);
        expect(current.dirty).toBe(true);
        expect(current.layout.floors[0].name).toBe('Tên chưa lưu');
        await act(async () =>
            current.setLayout({
                ...current.layout,
                floors: [{ ...current.layout.floors[0], thickness: NaN }],
            }),
        );
        await act(async () => current.save());
        expect(api).toHaveBeenCalledTimes(1);
        expect(current.error.message).toContain('không hợp lệ');
    });
    it('aborts save and discards late response after switching factory', async () => {
        let current, resolve;
        const api = vi.fn(
                () =>
                    new Promise((done) => {
                        resolve = done;
                    }),
            ),
            saved = vi.fn();
        function Harness({ id, data }) {
            current = useLayoutDraft(api, id, data, saved);
            return null;
        }
        const screen = await render(<Harness id={1} data={layoutData} />);
        await act(async () => {
            void current.save();
        });
        await screen.render(<Harness id={2} data={{ ...layoutData, layout: emptyLayout() }} />);
        await act(async () => resolve(layoutData));
        expect(saved).not.toHaveBeenCalled();
        expect(current.layout).toEqual(emptyLayout());
        expect(api.mock.calls[0][1].signal.aborted).toBe(true);
    });
});

describe('unsaved leave guard', () => {
    it('guards browser unload, Inertia navigation and optional discard transitions', async () => {
        let confirm;
        function Harness({ dirty }) {
            confirm = useUnsavedGuard(dirty);
            return null;
        }
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const screen = await render(<Harness dirty />);
        expect(confirm()).toBe(false);
        const event = { preventDefault: vi.fn() };
        inertia.handler(event);
        expect(event.preventDefault).toHaveBeenCalled();
        const unload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);
        await screen.render(<Harness dirty={false} />);
        expect(confirm()).toBe(true);
        expect(inertia.remove).toHaveBeenCalled();
    });
});

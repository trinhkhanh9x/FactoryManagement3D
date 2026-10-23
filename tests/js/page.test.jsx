import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Index from '../../resources/js/runtime/Pages/FactoryManagement3D/Workspace';
import { mount, click, fill, check, catalog, layoutData, snapshot, mockApi } from './uiHelpers';

const scene = vi.hoisted(() => ({ props: null }));
vi.mock('@inertiajs/react', () => ({ Head: () => null, router: { on: () => () => {} } }));
vi.mock('../../resources/js/components/FactoryScene', () => ({
    default: (props) => {
        scene.props = props;
        return (
            <div data-testid="scene">
                <button onClick={() => props.onSelect('m1')}>Chọn máy trong cảnh</button>
                <button onClick={() => props.onMove('m1', { x: 4, y: 0, z: 2 })}>
                    Kéo máy kiểm thử
                </button>
                <button onClick={() => props.onError(new Error('WebGL không khả dụng'))}>
                    Lỗi cảnh kiểm thử
                </button>
            </div>
        );
    },
}));
const screens = [];
async function render(component) {
    const screen = await mount(component);
    screens.push(screen);
    return screen;
}
function provideFetch(api) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url, options = {}) => {
            const path = String(url).replace('/modules/factory-management-3d', '');
            try {
                const data = await api(path, {
                    ...options,
                    body: options.body ? JSON.parse(options.body) : undefined,
                });
                return { ok: true, status: 200, json: async () => ({ success: true, data }) };
            } catch (error) {
                return {
                    ok: false,
                    status: error.status || 500,
                    json: async () => ({
                        success: false,
                        message: error.message,
                        errors: error.errors,
                    }),
                };
            }
        }),
    );
}
afterEach(async () => {
    for (const screen of screens.splice(0)) await screen.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
});

describe('factory tracking page', () => {
    it('opens initial factory and keeps native MES statuses independent from concurrent production', async () => {
        const api = mockApi();
        provideFetch(api);
        const { host } = await render(<Index initialFactoryId={1} csrf_token="token" />);
        expect(window.location.pathname).toBe('/modules/factory-management-3d/factories/1');
        expect(host.textContent).toContain('Chưa có dữ liệu');
        await click(host, 'Chọn máy trong cảnh');
        expect(host.textContent).toContain('Tiện thô');
        expect(host.textContent).toContain('Tiện tinh');
        expect(host.textContent).toContain('WO2');
        expect(host.querySelector('a[href="/work-orders/1"]')).not.toBeNull();
        await click(host, 'Xem công đoạn');
        expect(host.querySelector('[role=dialog]')).not.toBeNull();
        await click(host, 'Đóng chi tiết lệnh');
        await fill(host, 'Tìm máy / lệnh / lô', 'wo2');
        expect(host.querySelectorAll('.fm3d-station')).toHaveLength(1);
        await fill(host, 'Trạng thái máy', 'RUNNING');
        expect(host.textContent).toContain('Không có máy phù hợp');
        await fill(host, 'Trạng thái máy', 'UNKNOWN');
        await fill(host, 'Dây chuyền', 1);
        await fill(host, 'Tìm máy / lệnh / lô', '');
        await check(host, 'Chưa bố trí');
        expect(host.querySelectorAll('.fm3d-station')).toHaveLength(0);
        await check(host, 'Chưa bố trí');
        await fill(host, 'Tầng', 'f1');
        await fill(host, 'Góc nhìn', 'top');
        expect(scene.props.viewMode).toBe('top');
        await check(host, 'Hiện tường / cửa');
        expect(scene.props.showStructure).toBe(false);
        const reset = scene.props.resetKey;
        await click(host, 'Đặt lại góc nhìn');
        expect(scene.props.resetKey).toBe(reset + 1);
        expect(scene.props.viewMode).toBe('perspective');
        await click(host, 'Lỗi cảnh kiểm thử');
        expect(host.textContent).toContain('WebGL không khả dụng');
        await click(host, 'Tổng quan');
        expect(window.location.pathname).toBe('/modules/factory-management-3d');
        expect(host.textContent).toContain('Mở nhà xưởng');
    });
    it('edits immutable draft, guards unsaved transitions and saves/publishes with CAS', async () => {
        let saved = { ...layoutData };
        const api = mockApi({
            '/factories/1/layout/draft': ({ body }) => {
                saved = { ...layoutData, layout: body.layout, version: 2 };
                return saved;
            },
            '/factories/1/layout/publish': () => ({ ...saved, published_version: 2 }),
        });
        provideFetch(api);
        const { host } = await render(<Index initialFactoryId={1} />);
        await click(host, 'Chỉnh mặt bằng');
        await fill(host, 'Tầng', 'f1');
        await fill(host, 'Tên tầng', 'Tầng sửa');
        expect(host.textContent).toContain('Chưa lưu');
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        await click(host, 'Theo dõi');
        expect(host.textContent).toContain('Lưu nháp');
        await click(host, 'Máy / kết cấu');
        await click(host, 'Chọn máy trong cảnh');
        await click(host, 'Kéo máy kiểm thử');
        expect(scene.props.layout.objects[0].position.x).toBe(4);
        await fill(host, 'Bước căn lưới', 1);
        expect(scene.props.snap).toBe(1);
        await click(host, 'Lưu nháp');
        expect(host.textContent).toContain('Đã lưu bản nháp');
        expect(host.textContent).not.toContain('Chưa lưu');
        await click(host, 'Công bố');
        expect(host.textContent).toContain('Đã công bố');
        expect(
            api.mock.calls.find((call) => call[0].endsWith('/draft'))[1].body.expected_version,
        ).toBe(1);
        await click(host, 'Theo dõi');
        expect(scene.props.editable).toBe(false);
    });
    it('retains draft on 409 and requires explicit confirmation before reloading', async () => {
        const api = mockApi({
            '/factories/1/layout/draft': () => {
                throw Object.assign(new Error('Xung đột'), { status: 409 });
            },
        });
        provideFetch(api);
        const { host } = await render(<Index initialFactoryId={1} />);
        await click(host, 'Chỉnh mặt bằng');
        await fill(host, 'Tầng', 'f1');
        await fill(host, 'Tên tầng', 'Chưa lưu');
        await click(host, 'Lưu nháp');
        expect(host.textContent).toContain('người khác thay đổi');
        expect(scene.props.layout.floors[0].name).toBe('Chưa lưu');
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        await click(host, 'Tải lại sau khi xác nhận');
        expect(scene.props.layout.floors[0].name).toBe('Chưa lưu');
        window.confirm.mockReturnValue(true);
        await click(host, 'Tải lại sau khi xác nhận');
        expect(scene.props.layout.floors[0].name).toBe('Tầng một');
    });
    it('removes all protected operational content when access is revoked', async () => {
        let denied = false;
        const api = mockApi({
            '/factories/1/snapshot': () => {
                if (denied) throw Object.assign(new Error('Bị từ chối'), { status: 403 });
                return snapshot;
            },
        });
        provideFetch(api);
        const { host } = await render(<Index initialFactoryId={1} />);
        await click(host, 'Chọn máy trong cảnh');
        await click(host, 'Xem công đoạn');
        expect(host.textContent).toContain('WO1');
        denied = true;
        await click(host, 'Cập nhật');
        expect(host.textContent).toContain('Quyền truy cập nhà xưởng đã thay đổi');
        expect(host.textContent).not.toContain('WO1');
        expect(host.querySelector('[role=dialog]')).toBeNull();
        expect(host.querySelector('.fm3d-summary')).toBeNull();
        expect(host.querySelector('[data-testid=scene]')).toBeNull();
    });
    it('refreshes published layout from snapshot revision while preserving edit drafts', async () => {
        let revision = 1;
        const api = mockApi({
            '/factories/1/snapshot': () => ({ ...snapshot, layout_revision: revision }),
            '/factories/1/layout': () => ({
                ...layoutData,
                published_version: revision,
                layout: {
                    ...layoutData.layout,
                    floors: layoutData.layout.floors.map((floor) => ({
                        ...floor,
                        name: `Tầng v${revision}`,
                    })),
                },
            }),
        });
        provideFetch(api);
        const { host } = await render(<Index initialFactoryId={1} />);
        expect(scene.props.layout.floors[0].name).toBe('Tầng v1');
        revision = 2;
        await click(host, 'Cập nhật');
        expect(scene.props.layout.floors[0].name).toBe('Tầng v2');
        await click(host, 'Chỉnh mặt bằng');
        await fill(host, 'Tầng', 'f1');
        await fill(host, 'Tên tầng', 'Bản nháp riêng');
        revision = 3;
        await click(host, 'Cập nhật');
        expect(scene.props.layout.floors[0].name).toBe('Bản nháp riêng');
    });
    it('supports catalog retry, empty factory list and admin creation', async () => {
        let fail = true;
        const api = mockApi({
            '/catalog': () => {
                if (fail) throw new Error('Danh mục lỗi');
                return { ...catalog, factories: [] };
            },
        });
        provideFetch(api);
        const { host } = await render(<Index />);
        expect(host.textContent).toContain('Danh mục lỗi');
        fail = false;
        await click(host, 'Thử lại');
        expect(host.textContent).toContain('Chưa có nhà xưởng');
        await click(host, 'Tạo nhà xưởng');
        expect(host.querySelector('[role=dialog]')).not.toBeNull();
        await click(host, 'Đóng cấu hình');
    });
    it('shows resource errors with retry and handles no published layout or operational rows', async () => {
        let fail = true;
        const api = mockApi({
            '/factories/1/layout': () => {
                if (fail) throw new Error('Mặt bằng lỗi');
                return {
                    ...layoutData,
                    published_version: null,
                    layout: { schema_version: 1, floors: [], zones: [], objects: [] },
                };
            },
            '/factories/1/assets': () => {
                throw new Error('Tệp lỗi');
            },
            '/factories/1/snapshot': () => ({ ...snapshot, stations: [], orders: [] }),
        });
        provideFetch(api);
        const { host } = await render(<Index initialFactoryId={1} />);
        expect(host.textContent).toContain('Mặt bằng lỗi');
        expect(host.textContent).toContain('Tệp lỗi');
        expect(host.textContent).not.toContain('Chưa có mặt bằng được công bố');
        expect(host.querySelector('.fm3d-layout-empty')).toBeNull();
        fail = false;
        await click(host, 'Thử lại');
        expect(host.textContent).toContain('Chưa có mặt bằng được công bố');
        expect(host.textContent).toContain('Chưa có lệnh phù hợp');
    });
    it('keeps history URL consistent and blocks popstate while a draft is dirty', async () => {
        provideFetch(mockApi());
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        const { host } = await render(<Index initialFactoryId={1} />);
        await click(host, 'Chỉnh mặt bằng');
        await fill(host, 'Tầng', 'f1');
        await fill(host, 'Tên tầng', 'Đang sửa');
        await act(async () => {
            window.history.replaceState(null, '', '/modules/factory-management-3d');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(window.location.pathname).toContain('/factories/1');
        window.confirm.mockReturnValue(true);
        await act(async () => {
            window.history.replaceState(null, '', '/modules/factory-management-3d');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(host.textContent).toContain('Mở nhà xưởng');
    });
    it('preserves oversized draft input with a clear error while the scene keeps last valid geometry', async () => {
        const api = mockApi();
        provideFetch(api);
        const { host } = await render(<Index initialFactoryId={1} />);
        await click(host, 'Chỉnh mặt bằng');
        await fill(host, 'Tầng', 'f1');
        const previous = scene.props.layout.floors[0].polygon[1][0];
        await fill(host, 'Đỉnh 2 · X', 1e9);
        expect(host.textContent).toContain('Thông số chưa hợp lệ');
        expect(scene.props.layout.floors[0].polygon[1][0]).toBe(previous);
        expect(
            [...host.querySelectorAll('button')].find((button) => button.textContent === 'Lưu nháp')
                .disabled,
        ).toBe(true);
        expect(host.querySelector('#fm3d-save-reason').textContent).toContain('Sửa thông số');
        expect(host.querySelector('button[aria-describedby="fm3d-save-reason"]')).not.toBeNull();
        expect(api.mock.calls.filter((call) => call[0].endsWith('/draft'))).toHaveLength(0);
        await fill(host, 'Đỉnh 2 · X', 12);
        expect(scene.props.layout.floors[0].polygon[1][0]).toBe(12);
        expect(host.textContent).not.toContain('Thông số chưa hợp lệ');
    });
    it('clears machine filters without resetting camera and announces result counts', async () => {
        provideFetch(mockApi());
        const { host } = await render(<Index initialFactoryId={1} />);
        await fill(host, 'Góc nhìn', 'top');
        await fill(host, 'Tầng', 'f1');
        await fill(host, 'Tìm máy / lệnh / lô', 'không-tìm-thấy');
        expect(host.querySelector('[role="status"][data-filter-results]').textContent).toContain(
            '0 / 1 máy/trạm',
        );
        expect(host.querySelector('[role="group"][aria-label="Góc nhìn 3D"]')).not.toBeNull();
        expect(host.querySelector('[role="group"][aria-label="Bộ lọc máy"]')).not.toBeNull();
        await click(host, 'Xem tất cả máy');
        expect(host.querySelectorAll('.fm3d-station')).toHaveLength(1);
        expect(scene.props.viewMode).toBe('top');
        expect(scene.props.floorId).toBe('f1');
        await fill(host, 'Trạng thái máy', 'RUNNING');
        await check(host, 'Chưa bố trí');
        await click(host, 'Xóa bộ lọc');
        expect(host.querySelectorAll('.fm3d-station')).toHaveLength(1);
    });
    it('replaces the empty canvas with an editor CTA and an ordered setup guide', async () => {
        const empty = { schema_version: 1, floors: [], zones: [], objects: [] };
        provideFetch(
            mockApi({
                '/factories/1/layout': () => ({
                    ...layoutData,
                    layout: empty,
                    published_version: null,
                }),
                '/factories/1/layout?draft=1': () => ({
                    ...layoutData,
                    layout: empty,
                    published_version: null,
                }),
            }),
        );
        const { host } = await render(<Index initialFactoryId={1} />);
        expect(host.querySelector('[data-testid="scene"]')).toBeNull();
        expect(host.querySelectorAll('.fm3d-station')).toHaveLength(1);
        await click(host, 'Bắt đầu dựng mặt bằng');
        expect(host.textContent).toContain('Tạo tầng');
        expect(host.textContent).toContain('Bố trí máy');
        expect(host.querySelector('.fm3d-layout-empty ol')).not.toBeNull();
        expect(host.textContent).toContain('Tạo ít nhất một tầng trước khi công bố.');
        expect(host.textContent).toContain('Không có thay đổi mới để lưu.');
        const tabs = host.querySelector('[aria-label="Công cụ chỉnh sửa"]');
        expect(tabs.querySelector('button[aria-pressed="true"]').textContent).toContain(
            'Tầng / khu vực',
        );
        await click(host, 'Máy / kết cấu');
        expect(tabs.querySelector('button[aria-pressed="true"]').textContent).toContain(
            'Máy / kết cấu',
        );
    });
    it('gives viewers a useful empty layout without offering editing permission', async () => {
        const empty = { schema_version: 1, floors: [], zones: [], objects: [] };
        provideFetch(
            mockApi({
                '/catalog': () => ({
                    ...catalog,
                    is_admin: false,
                    factories: catalog.factories.map((item) => ({ ...item, can_edit: false })),
                }),
                '/factories/1/layout': () => ({
                    ...layoutData,
                    layout: empty,
                    can_edit: false,
                    published_version: null,
                }),
            }),
        );
        const { host } = await render(<Index initialFactoryId={1} />);
        expect(host.textContent).toContain('Liên hệ người có quyền chỉnh mặt bằng');
        expect(
            [...host.querySelectorAll('button')].some(
                (button) => button.textContent === 'Bắt đầu dựng mặt bằng',
            ),
        ).toBe(false);
        expect(host.querySelectorAll('.fm3d-station')).toHaveLength(1);
        expect(host.querySelector('[data-testid="scene"]')).toBeNull();
    });
    it('does not describe a pending layout request as an empty published factory', async () => {
        const resolvers = [];
        provideFetch(
            mockApi({
                '/factories/1/layout': () => new Promise((resolve) => resolvers.push(resolve)),
            }),
        );
        const { host } = await render(<Index initialFactoryId={1} />);
        expect(host.textContent).toContain('Đang tải mặt bằng…');
        expect(host.querySelector('.fm3d-layout-empty')).toBeNull();
        expect(host.querySelector('[data-testid="scene"]')).toBeNull();
        await act(async () => {
            for (const resolve of resolvers)
                resolve({
                    ...layoutData,
                    layout: { schema_version: 1, floors: [], zones: [], objects: [] },
                });
        });
        expect(host.querySelector('.fm3d-layout-empty')).not.toBeNull();
        expect(host.textContent).not.toContain('Đang tải mặt bằng…');
    });
});

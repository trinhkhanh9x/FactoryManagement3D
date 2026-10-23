import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FactoryOverview, { Summary } from '../../resources/js/components/FactoryOverview';
import { catalog, click, factory, fill, mockApi, mount } from './uiHelpers';

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

const factories = [
    { ...factory, id: 1, code: 'CNC-A', name: 'Xưởng Gia Công' },
    { ...factory, id: 2, code: 'PACK-B', name: 'Xưởng đóng gói' },
];
const fullCatalog = { ...catalog, factories };
const overview = (props = {}) => (
    <FactoryOverview
        catalog={fullCatalog}
        api={mockApi()}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        {...props}
    />
);

describe('overview discovery and hierarchy', () => {
    it('filters by trimmed case-insensitive code and name and reports visible results', async () => {
        const { host } = await render(overview());
        expect(host.textContent).toContain('Kết quả: 2/2 nhà xưởng');
        await fill(host, 'Tìm nhà xưởng', '  cnc-a  ');
        expect([...host.querySelectorAll('article h2')].map((item) => item.textContent)).toEqual([
            'Xưởng Gia Công',
        ]);
        expect(host.textContent).toContain('Kết quả: 1/2 nhà xưởng');
        await fill(host, 'Tìm nhà xưởng', '  ĐÓNG GÓI  ');
        expect([...host.querySelectorAll('article h2')].map((item) => item.textContent)).toEqual([
            'Xưởng đóng gói',
        ]);
    });

    it('offers a clear action when search has no matches and restores the catalog', async () => {
        const { host } = await render(overview());
        await fill(host, 'Tìm nhà xưởng', 'Không tồn tại');
        expect(host.querySelectorAll('article')).toHaveLength(0);
        expect(host.textContent).toContain('Không tìm thấy nhà xưởng');
        expect(host.textContent).toContain('Kết quả: 0/2 nhà xưởng');
        await click(host, 'Xóa tìm kiếm');
        expect(host.querySelectorAll('article')).toHaveLength(2);
        expect(host.textContent).toContain('Kết quả: 2/2 nhà xưởng');
    });

    it('uses unique factory action names and leaves the page heading to the MES shell', async () => {
        const onSelect = vi.fn();
        const { host } = await render(overview({ onSelect }));
        expect(host.querySelector('h1')).toBeNull();
        await click(host, 'Mở nhà xưởng Xưởng đóng gói');
        expect(onSelect).toHaveBeenCalledExactlyOnceWith(2);
    });

    it('keeps creation available only to admins and explains an empty assignment', async () => {
        const onCreate = vi.fn();
        const screen = await render(overview({ onCreate }));
        await click(screen.host, 'Tạo nhà xưởng');
        expect(onCreate).toHaveBeenCalledOnce();
        await screen.render(overview({ catalog: { ...catalog, is_admin: false, factories: [] } }));
        expect(
            [...screen.host.querySelectorAll('button')].some(
                (item) => item.textContent === 'Tạo nhà xưởng',
            ),
        ).toBe(false);
        expect(screen.host.textContent).toContain('Liên hệ Admin');
    });

    it('limits polling cards to six per page and resets the page when searching', async () => {
        const api = mockApi();
        const largeCatalog = {
            ...catalog,
            factories: Array.from({ length: 13 }, (_, index) => ({
                ...factory,
                id: index + 1,
                code: `F-${index + 1}`,
                name: `Nhà xưởng ${index + 1}`,
            })),
        };
        const { host } = await render(overview({ api, catalog: largeCatalog }));
        expect(host.querySelectorAll('article')).toHaveLength(6);
        expect(api.mock.calls).toHaveLength(6);
        expect(host.textContent).toContain('Trang 1 / 3');
        expect(host.textContent).toContain('Kết quả: 13/13 nhà xưởng');
        const previous = [...host.querySelectorAll('button')].find(
            (item) => item.getAttribute('aria-label') === 'Trang trước',
        );
        expect(previous.disabled).toBe(true);
        await click(host, 'Trang tiếp');
        expect(host.querySelectorAll('article')).toHaveLength(6);
        expect(api.mock.calls).toHaveLength(12);
        expect(host.textContent).toContain('Trang 2 / 3');
        expect(host.querySelector('article h2').textContent).toBe('Nhà xưởng 7');
        await fill(host, 'Tìm nhà xưởng', 'F-13');
        expect(host.querySelectorAll('article')).toHaveLength(1);
        expect(host.querySelector('article h2').textContent).toBe('Nhà xưởng 13');
        expect(host.textContent).toContain('Kết quả: 1/13 nhà xưởng');
        await fill(host, 'Tìm nhà xưởng', '');
        expect(host.textContent).toContain('Trang 1 / 3');
        expect(host.querySelector('article h2').textContent).toBe('Nhà xưởng 1');
    });
});

describe('summary meaning without color alone', () => {
    it('highlights running machines and nonzero overdue or issue counts with visible labels', async () => {
        const { host } = await render(
            <Summary
                summary={{
                    total_machines: 10,
                    running: 3,
                    unknown: 1,
                    active_orders: 5,
                    overdue_orders: 2,
                    open_issues: 1,
                }}
            />,
        );
        const row = (label) =>
            [...host.querySelectorAll('dt')].find((item) => item.textContent === label)
                ?.parentElement;
        expect(row('Đang chạy').dataset.tone).toBe('running');
        expect(row('Lệnh quá hạn').dataset.tone).toBe('blocked');
        expect(row('Sự cố mở').dataset.tone).toBe('blocked');
        expect(row('Đang chạy').querySelector('dd').textContent).toBe('3');
        expect(row('Chưa có dữ liệu').textContent).toContain('Chưa có dữ liệu');
    });

    it('does not imply a running machine or alarm when the count is zero or missing', async () => {
        const screen = await render(
            <Summary summary={{ running: 0, overdue_orders: 0, open_issues: 0 }} />,
        );
        expect(
            screen.host.querySelector('[data-tone="running"], [data-tone="blocked"]'),
        ).toBeNull();
        await screen.render(<Summary />);
        expect(
            screen.host.querySelector('[data-tone="running"], [data-tone="blocked"]'),
        ).toBeNull();
        expect(screen.host.querySelectorAll('dd')).toHaveLength(6);
        expect(
            [...screen.host.querySelectorAll('dd')].every((item) => item.textContent === '—'),
        ).toBe(true);
    });
});

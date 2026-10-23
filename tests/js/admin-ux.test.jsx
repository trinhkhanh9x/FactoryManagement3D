import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FactoryAdmin from '../../resources/js/components/FactoryAdmin';
import { ApiError } from '../../resources/js/lib/api';
import { catalog, check, click, factory, field, fill, mockApi, mount } from './uiHelpers';

const screens = [];
async function render(props = {}) {
    const screen = await mount(
        <FactoryAdmin
            api={mockApi()}
            catalog={catalog}
            onSaved={vi.fn()}
            onClose={vi.fn()}
            {...props}
        />,
    );
    screens.push(screen);
    return screen;
}
async function submit(host) {
    const form = host.querySelector('form');
    expect(form, 'Configuration supports keyboard form submission').not.toBeNull();
    await act(async () =>
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
}
afterEach(async () => {
    for (const screen of screens.splice(0)) await screen.close();
    vi.restoreAllMocks();
});

describe('configuration validation and recovery', () => {
    it('connects the save button to a form with server-aligned input constraints', async () => {
        const { host } = await render();
        const form = host.querySelector('form');
        expect(form).not.toBeNull();
        const save = [...host.querySelectorAll('button')].find(
            (item) => item.textContent === 'Lưu cấu hình',
        );
        expect(save.type).toBe('submit');
        expect(save.form).toBe(form);
        expect(field(host, 'Mã nhà xưởng').required).toBe(true);
        expect(field(host, 'Mã nhà xưởng').maxLength).toBe(80);
        expect(field(host, 'Tên nhà xưởng').required).toBe(true);
        expect(field(host, 'Tên nhà xưởng').maxLength).toBe(200);
    });

    it.each(['', '   '])(
        'blocks blank or whitespace fields before any request: %j',
        async (value) => {
            const api = mockApi(),
                onClose = vi.fn();
            const { host } = await render({ api, onClose });
            await fill(host, 'Mã nhà xưởng', value);
            await fill(host, 'Tên nhà xưởng', value);
            await submit(host);
            expect(api).not.toHaveBeenCalled();
            expect(host.textContent).toContain('Nhập mã nhà xưởng.');
            expect(host.textContent).toContain('Nhập tên nhà xưởng.');
            expect(onClose).not.toHaveBeenCalled();
        },
    );

    it('recovers from validation and sends trimmed values before saving member permissions', async () => {
        const api = mockApi(),
            onSaved = vi.fn();
        const { host } = await render({ api, onSaved });
        await submit(host);
        await fill(host, 'Mã nhà xưởng', '  CNC-A  ');
        await fill(host, 'Tên nhà xưởng', '  Xưởng cơ khí  ');
        await fill(host, 'Múi giờ IANA', '  Asia/Ho_Chi_Minh  ');
        await check(host, 'Quản lý');
        await check(host, 'Chỉnh mặt bằng');
        await submit(host);
        expect(api.mock.calls.map(([path]) => path)).toEqual([
            '/factories',
            '/factories/1/members',
        ]);
        expect(api.mock.calls[0][1].body).toMatchObject({
            code: 'CNC-A',
            name: 'Xưởng cơ khí',
            timezone: 'Asia/Ho_Chi_Minh',
        });
        expect(api.mock.calls[1][1].body).toEqual({
            members: [{ user_id: 5, can_edit_layout: true }],
        });
        expect(onSaved).toHaveBeenCalledWith(factory, true);
        expect(host.textContent).not.toContain('Nhập mã nhà xưởng.');
        expect(host.textContent).not.toContain('Nhập tên nhà xưởng.');
    });

    it('guards over-limit values even when submission bypasses browser validation', async () => {
        const api = mockApi();
        const { host } = await render({ api });
        await fill(host, 'Mã nhà xưởng', 'A'.repeat(81));
        await fill(host, 'Tên nhà xưởng', 'B'.repeat(201));
        await submit(host);
        expect(api).not.toHaveBeenCalled();
        expect(
            field(host, 'Mã nhà xưởng').closest('label').querySelector('[role="alert"]'),
        ).not.toBeNull();
        expect(
            field(host, 'Tên nhà xưởng').closest('label').querySelector('[role="alert"]'),
        ).not.toBeNull();
    });

    it.each([
        ['   ', 'Nhập múi giờ của nhà xưởng.'],
        ['Asia/Not_A_Timezone', 'Múi giờ không hợp lệ. Ví dụ: Asia/Ho_Chi_Minh.'],
    ])('rejects timezone %j and recovers when corrected to UTC', async (value, message) => {
        const api = mockApi();
        const { host } = await render({ api });
        await fill(host, 'Mã nhà xưởng', 'UTC-FACTORY');
        await fill(host, 'Tên nhà xưởng', 'Xưởng quốc tế');
        await fill(host, 'Múi giờ IANA', value);
        await submit(host);
        expect(api).not.toHaveBeenCalled();
        expect(field(host, 'Múi giờ IANA').closest('label').textContent).toContain(message);
        expect(document.activeElement).toBe(field(host, 'Múi giờ IANA'));
        await fill(host, 'Múi giờ IANA', '  UTC  ');
        await submit(host);
        expect(api.mock.calls[0][1].body.timezone).toBe('UTC');
        expect(api.mock.calls.map(([path]) => path)).toEqual([
            '/factories',
            '/factories/1/members',
        ]);
        expect(field(host, 'Múi giờ IANA').closest('label').textContent).not.toContain(message);
    });

    it('focuses the first invalid field and advances focus after that field is corrected', async () => {
        const api = mockApi();
        const { host } = await render({ api });
        await submit(host);
        expect(document.activeElement).toBe(field(host, 'Mã nhà xưởng'));
        await fill(host, 'Mã nhà xưởng', 'CNC-A');
        await submit(host);
        expect(document.activeElement).toBe(field(host, 'Tên nhà xưởng'));
        expect(api).not.toHaveBeenCalled();
    });

    it('blocks duplicate form submissions during factory and member persistence', async () => {
        let resolveFactory, resolveMembers;
        const api = mockApi({
            '/factories': () =>
                new Promise((resolve) => {
                    resolveFactory = resolve;
                }),
            '/factories/1/members': () =>
                new Promise((resolve) => {
                    resolveMembers = resolve;
                }),
        });
        const onSaved = vi.fn(),
            onClose = vi.fn();
        const { host } = await render({ api, onSaved, onClose });
        await fill(host, 'Mã nhà xưởng', 'CNC-A');
        await fill(host, 'Tên nhà xưởng', 'Xưởng cơ khí');
        await submit(host);
        await submit(host);
        expect(api.mock.calls.map(([path]) => path)).toEqual(['/factories']);
        expect(onSaved).not.toHaveBeenCalled();
        await act(async () => resolveFactory(factory));
        await submit(host);
        expect(api.mock.calls.map(([path]) => path)).toEqual([
            '/factories',
            '/factories/1/members',
        ]);
        expect(onClose).not.toHaveBeenCalled();
        await act(async () => resolveMembers({ members: [] }));
        expect(onSaved).toHaveBeenCalledExactlyOnceWith(factory, true);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('places server validation messages beside their fields and preserves the entered values', async () => {
        const api = mockApi({
            '/factories': () => {
                throw new ApiError('Dữ liệu chưa hợp lệ.', 422, {
                    code: ['Mã xưởng đã tồn tại.'],
                    name: ['Tên xưởng cần kiểm tra.'],
                });
            },
        });
        const { host } = await render({ api });
        await fill(host, 'Mã nhà xưởng', 'CNC-A');
        await fill(host, 'Tên nhà xưởng', 'Xưởng cơ khí');
        await submit(host);
        expect(
            field(host, 'Mã nhà xưởng').closest('label').querySelector('[role="alert"]')
                .textContent,
        ).toContain('Mã xưởng đã tồn tại.');
        expect(
            field(host, 'Tên nhà xưởng').closest('label').querySelector('[role="alert"]')
                .textContent,
        ).toContain('Tên xưởng cần kiểm tra.');
        expect(field(host, 'Mã nhà xưởng').value).toBe('CNC-A');
        expect(api.mock.calls).toHaveLength(1);
    });

    it('retains the loaded-members guard while adding form submission', async () => {
        const api = vi.fn(() => new Promise(() => {}));
        const { host } = await render({ api, factory });
        const save = [...host.querySelectorAll('button')].find(
            (item) => item.textContent === 'Lưu cấu hình',
        );
        expect(save.disabled).toBe(true);
        expect(field(host, 'Quản lý').disabled).toBe(true);
        await click(host, 'Lưu cấu hình');
        await submit(host);
        expect(api).toHaveBeenCalledTimes(1);
        expect(api.mock.calls[0][0]).toBe('/factories/1/members');
    });
});

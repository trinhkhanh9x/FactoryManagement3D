import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FactoryPage } from './factory.page.js';

const runtime = path.resolve('../../../../artifacts/FactoryManagement3D-1.0.0/e2e-runtime');
const fixture = JSON.parse(fs.readFileSync(path.join(runtime, 'fixture.json'), 'utf8'));

async function noHorizontalOverflow(page) {
    await expect
        .poll(() =>
            page.locator('.fm3d-root').evaluate((root) => {
                const main = root.closest('main');
                return Math.max(
                    root.scrollWidth - root.clientWidth,
                    main ? main.scrollWidth - main.clientWidth : 0,
                    document.documentElement.scrollWidth - document.documentElement.clientWidth,
                );
            }),
        )
        .toBeLessThanOrEqual(2);
}

test('overview search finds a factory, explains no results and clears without duplicate page title', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    await expect(app.root.getByRole('heading', { level: 1 })).toHaveCount(0);
    const search = app.root.getByRole('textbox', { name: 'Tìm nhà xưởng', exact: true });
    await search.fill('E2E Factory B');
    await expect(
        app.root.getByRole('button', { name: 'Mở nhà xưởng E2E Factory B', exact: true }),
    ).toBeVisible();
    await expect(
        app.root.getByRole('button', { name: 'Mở nhà xưởng E2E Factory A', exact: true }),
    ).toHaveCount(0);
    await expect(app.root.getByRole('status').filter({ hasText: /^Kết quả:/ })).toContainText(
        /Kết quả: 1\/\d+ nhà xưởng/,
    );
    await search.fill('no-such-factory-e2e');
    await expect(app.root.getByText('Không tìm thấy nhà xưởng', { exact: true })).toBeVisible();
    await app.root.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(
        app.root.getByRole('button', { name: 'Mở nhà xưởng E2E Factory A', exact: true }),
    ).toBeVisible();
    await app.clean();
});

test('combined machine filters explain zero results and both clear actions restore all machines', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    await app.open();
    const filters = app.root.getByRole('group', { name: 'Bộ lọc máy', exact: true });
    const search = filters.getByRole('textbox', { name: 'Tìm máy / lệnh / lô', exact: true });
    await search.fill('E2E-A1');
    await filters
        .getByRole('combobox', { name: 'Trạng thái máy', exact: true })
        .selectOption('UNKNOWN');
    await expect(app.root.locator('[data-filter-results]')).toContainText('0 / 3 máy/trạm');
    await app.root.getByRole('button', { name: 'Xem tất cả máy', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(
        filters.getByRole('combobox', { name: 'Trạng thái máy', exact: true }),
    ).toHaveValue('');
    await expect(
        app.root.getByRole('region', { name: 'Danh sách máy' }).getByRole('button'),
    ).toHaveCount(3);
    await search.fill('E2E-A2');
    await filters.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
    await expect(app.root.locator('[data-filter-results]')).toContainText('3 / 3 máy/trạm');
    await expect(
        app.root.getByRole('heading', { name: 'E2E Factory A', exact: true }),
    ).toBeVisible();
    await expect(app.root.getByRole('group', { name: 'Góc nhìn 3D', exact: true })).toBeVisible();
    await app.clean();
});

test('invalid factory form explains and focuses fields before any create API request', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    const posts = [];
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            request.url().endsWith('/modules/factory-management-3d/factories')
        )
            posts.push(request.url());
    });
    await app.root.getByRole('button', { name: 'Tạo nhà xưởng', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const code = dialog.getByRole('textbox', { name: 'Mã nhà xưởng', exact: true });
    const name = dialog.getByRole('textbox', { name: 'Tên nhà xưởng', exact: true });
    await dialog.getByRole('button', { name: 'Lưu cấu hình', exact: true }).click();
    await expect(dialog.getByText('Nhập mã nhà xưởng.', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Nhập tên nhà xưởng.', { exact: true })).toBeVisible();
    await expect(code).toBeFocused();
    await code.fill('   ');
    await code.press('Enter');
    await expect(code).toBeFocused();
    await code.fill('E2E-VALIDATION');
    await code.press('Enter');
    await expect(name).toBeFocused();
    await name.fill('Validation only');
    await dialog
        .getByRole('textbox', { name: 'Múi giờ IANA', exact: true })
        .fill('invalid/timezone');
    await name.press('Enter');
    await expect(
        dialog.getByText('Múi giờ không hợp lệ. Ví dụ: Asia/Ho_Chi_Minh.', { exact: true }),
    ).toBeVisible();
    expect(posts).toEqual([]);
    await app.clean();
});

test('empty published layout offers editor setup while assigned viewer receives read-only guidance', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    const created = await app.api('/factories', {
        method: 'POST',
        body: {
            code: `E2E-EMPTY-${Date.now()}`,
            name: 'E2E Empty Layout',
            timezone: 'Asia/Ho_Chi_Minh',
            is_active: true,
            line_ids: [],
        },
    });
    expect(created.status).toBe(201);
    const id = created.data.data.id;
    expect(
        (
            await app.api(`/factories/${id}/members`, {
                method: 'PUT',
                body: { members: [{ user_id: fixture.actors.supervisor, can_edit_layout: false }] },
            })
        ).status,
    ).toBe(200);
    await page.goto(`/modules/factory-management-3d/factories/${id}`);
    await expect(
        app.root.getByText('Chưa có mặt bằng được công bố', { exact: true }),
    ).toBeVisible();
    await expect(app.root.locator('.fm3d-scene canvas')).toHaveCount(0);
    await app.root.getByRole('button', { name: 'Bắt đầu dựng mặt bằng', exact: true }).click();
    await expect(
        app.root.getByText('Dựng mặt bằng theo kích thước thực', { exact: true }),
    ).toBeVisible();
    await expect(
        app.root.getByRole('button', { name: 'Chỉnh mặt bằng', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await app.login('supervisor');
    await page.goto(`/modules/factory-management-3d/factories/${id}`);
    await expect(app.root.getByText(/Liên hệ người có quyền chỉnh mặt bằng/)).toBeVisible();
    await expect(
        app.root.getByRole('button', { name: 'Bắt đầu dựng mặt bằng', exact: true }),
    ).toHaveCount(0);
    await expect(app.root.locator('.fm3d-scene canvas')).toHaveCount(0);
    await app.clean();
});

test('layout network failure never appears as an empty layout or an onboarding call to action', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    await page.route(new RegExp(`/factories/${fixture.factories.A}/layout(?:\\?.*)?$`), (route) =>
        route.abort('failed'),
    );
    await app.open();
    await expect(app.root.getByText('Không tải được mặt bằng', { exact: true })).toBeVisible();
    await expect(app.root.getByText('Chưa có mặt bằng được công bố', { exact: true })).toHaveCount(
        0,
    );
    await expect(
        app.root.getByRole('button', { name: 'Bắt đầu dựng mặt bằng', exact: true }),
    ).toHaveCount(0);
    await app.clean();
});

test('snapshot network failure never claims a factory has no machines', async ({ page }) => {
    const app = new FactoryPage(page);
    await app.login();
    await page.route(new RegExp(`/factories/${fixture.factories.A}/snapshot$`), (route) =>
        route.abort('failed'),
    );
    await page.goto(`/modules/factory-management-3d/factories/${fixture.factories.A}`);
    await expect(
        app.root.getByText('Không cập nhật được dữ liệu MES', { exact: true }),
    ).toBeVisible();
    await expect(
        app.root.getByText(/Nhà xưởng chưa có máy|Chưa có máy\/trạm|Không có máy phù hợp/),
    ).toHaveCount(0);
    await app.clean();
});

test('shared theme and responsive layout stay within desktop, zoomed and mobile widths', async ({
    page,
}, testInfo) => {
    const app = new FactoryPage(page);
    await app.login();
    await app.open();
    const scene = app.root.locator('.fm3d-scene');
    const readyScene = async () => {
        await expect(app.root.getByText('Đang tải mặt bằng…', { exact: true })).toHaveCount(0);
        await expect(scene.locator('canvas')).toBeVisible();
        await expect(
            app.root.getByRole('combobox', { name: 'Tầng', exact: true }).first(),
        ).toContainText('E2E Ground');
    };
    const captureLoadedScene = async (name) => {
        await readyScene();
        await page.locator('main').evaluate((node) => node.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        await scene.screenshot({ path: testInfo.outputPath(`${name}-scene.png`) });
    };
    await readyScene();
    for (const width of [1280, 1920]) {
        await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate(
                (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
                theme,
            );
            await noHorizontalOverflow(page);
            await captureLoadedScene(`${theme}-${width}`);
        }
    }
    await page.evaluate(() => {
        document.documentElement.style.zoom = '200%';
    });
    await noHorizontalOverflow(page);
    await captureLoadedScene('zoom-200-percent');
    await page.evaluate(() => {
        document.documentElement.style.zoom = '';
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalOverflow(page);
    await readyScene();
    await expect
        .poll(() => scene.evaluate((node) => parseFloat(getComputedStyle(node).minHeight)))
        .toBeLessThan(480);
    await expect.poll(async () => (await scene.boundingBox()).height).toBeLessThanOrEqual(440);
    await captureLoadedScene('mobile-390');
    await app.clean();
});

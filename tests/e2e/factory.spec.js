import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FactoryPage } from './factory.page.js';

const runtime = path.resolve('../../../../artifacts/FactoryManagement3D-1.0.0/e2e-runtime');
const fixture = JSON.parse(fs.readFileSync(path.join(runtime, 'fixture.json'), 'utf8'));

test('real MES session renders independent machine state, multiple operations, order totals and two factories', async ({
    page,
}, testInfo) => {
    const app = new FactoryPage(page);
    await app.login();
    await expect(
        app.root.getByRole('heading', { name: 'E2E Factory B', exact: true }),
    ).toBeVisible();
    await app.open();
    await app.root.getByRole('button', { name: /E2E-A1 E2E Machine A1/ }).click();
    const inspector = app.root.getByRole('complementary', { name: 'Chi tiết máy' });
    await expect(inspector.getByText('Đã dừng', { exact: true })).toBeVisible();
    await expect(
        inspector.getByRole('heading', { name: 'Công đoạn đang thực hiện (2)' }),
    ).toBeVisible();
    await expect(inspector.getByText('E2E TURN', { exact: true })).toBeVisible();
    await expect(inspector.getByText('E2E INSPECT', { exact: true })).toBeVisible();
    await expect(app.root.getByText('PRIVATE-B-OPERATION')).toHaveCount(0);
    await expect(app.root.getByRole('row').filter({ hasText: 'E2E-WO-100' })).toContainText(
        '30 / 100',
    );
    await app.root.getByRole('button', { name: /E2E-A3 E2E Machine A3/ }).click();
    await expect(inspector.getByText('Chưa có dữ liệu', { exact: true }).first()).toBeVisible();
    await expect(page.locator('.fm3d-scene canvas')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('tracking-1280x800.png'), fullPage: true });
    await app.clean();
});

test('Admin creates factory, assigns existing line and Supervisor using actual form', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    await app.root.getByRole('button', { name: 'Tạo nhà xưởng', exact: true }).click();
    const code = `E2E-CREATED-${Date.now()}`;
    const modal = page.getByRole('dialog');
    await modal.getByRole('textbox', { name: 'Mã nhà xưởng', exact: true }).fill(code);
    await modal
        .getByRole('textbox', { name: 'Tên nhà xưởng', exact: true })
        .fill('E2E Created Factory');
    await modal.getByRole('checkbox', { name: 'E2E-LINE-C · E2E Line C', exact: true }).check();
    await modal.getByRole('checkbox', { name: 'E2E Supervisor', exact: true }).check();
    await modal.getByRole('button', { name: 'Lưu cấu hình', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(
        app.root.getByRole('heading', { name: 'E2E Created Factory', exact: true }),
    ).toBeVisible();
    const catalog = await app.api('/catalog');
    expect(catalog.status).toBe(200);
    const created = catalog.data.data.factories.find((f) => f.code === code);
    expect(created.line_ids).toContain(fixture.lines.C);
    expect(
        (
            await app.api(`/factories/${created.id}`, {
                method: 'PATCH',
                body: { ...created, line_ids: [] },
            })
        ).status,
    ).toBe(200);
    await app.clean();
});

test('Supervisor only sees assigned factory and cannot read foreign factory or edit draft', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login('supervisor');
    await expect(app.root.getByRole('heading', { name: 'E2E Factory B', exact: true })).toHaveCount(
        0,
    );
    await app.open();
    await expect(app.root.getByRole('button', { name: 'Chỉnh mặt bằng', exact: true })).toHaveCount(
        0,
    );
    for (const endpoint of ['layout', 'snapshot', 'assets', 'workstations'])
        expect((await app.api(`/factories/${fixture.factories.B}/${endpoint}`)).status).toBe(404);
    expect((await app.api(`/factories/${fixture.factories.A}/layout?draft=1`)).status).toBe(403);
    await app.clean();
});

test('layout editing, actual GLB protected upload, publish and reload preserve numeric dimensions', async ({
    page,
}, testInfo) => {
    const app = new FactoryPage(page);
    await app.login();
    await app.open();
    await app.root.getByRole('button', { name: 'Chỉnh mặt bằng', exact: true }).click();
    await app.root
        .getByRole('combobox', { name: 'Tầng', exact: true })
        .first()
        .selectOption('ground');
    await app.root.getByRole('button', { name: 'Máy / kết cấu', exact: true }).click();
    await app.root.getByRole('button', { name: 'E2E A1', exact: true }).last().click();
    const inspector = app.root.getByRole('complementary', { name: 'Công cụ chỉnh mặt bằng' });
    await inspector.getByRole('spinbutton', { name: 'Rộng (m)', exact: true }).last().fill('2.75');
    await inspector.getByRole('spinbutton', { name: 'X', exact: true }).fill('7.25');
    const uploaded = page.waitForResponse(
        (r) =>
            r.url().endsWith(`/factories/${fixture.factories.A}/assets`) &&
            r.request().method() === 'POST',
    );
    await inspector
        .getByLabel('Tệp mô hình GLB', { exact: true })
        .setInputFiles(path.join(runtime, 'triangle.glb'));
    const response = await uploaded;
    expect(response.status()).toBe(201);
    const asset = (await response.json()).data;
    await inspector
        .getByRole('combobox', { name: 'Mô hình máy', exact: true })
        .selectOption(String(asset.id));
    await app.root.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(app.root.getByRole('button', { name: 'Công bố', exact: true })).toBeEnabled();
    const publishing = page.waitForResponse(
        (r) =>
            r.url().endsWith(`/factories/${fixture.factories.A}/layout/publish`) &&
            r.request().method() === 'POST',
    );
    await app.root.getByRole('button', { name: 'Công bố', exact: true }).click();
    expect((await publishing).status()).toBe(200);
    const layout = await app.api(`/factories/${fixture.factories.A}/layout`);
    const machine = layout.data.data.layout.objects.find(
        (o) => o.workstation_id === fixture.stations.A1,
    );
    expect(machine.dimensions.width).toBe(2.75);
    expect(machine.position.x).toBe(7.25);
    expect(machine.asset_id).toBe(asset.id);
    const download = await page.request.get(asset.url);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toContain('model/gltf-binary');
    const protectedLoad = page.waitForResponse(
        (r) => r.url().endsWith(asset.url) && r.request().method() === 'GET',
    );
    await page.reload();
    await app.open();
    expect((await protectedLoad).status()).toBe(200);
    await expect(page.locator('.fm3d-scene canvas')).toBeVisible();
    await app.root
        .getByRole('combobox', { name: 'Tầng', exact: true })
        .first()
        .selectOption('ground');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: testInfo.outputPath('glb-1920x1080.png'), fullPage: true });
    const canvas = page.locator('.fm3d-scene canvas');
    const beforeTheme = await canvas.screenshot();
    await page.evaluate(() => {
        document.documentElement.classList.add('dark');
        document.documentElement.style.setProperty('--om-bg', '#102030');
        document.documentElement.style.setProperty('--om-accent', '#ee8844');
    });
    await expect
        .poll(() =>
            page
                .locator('.fm3d-root')
                .evaluate((el) => getComputedStyle(el).getPropertyValue('--om-accent').trim()),
        )
        .toBe('#ee8844');
    await expect
        .poll(async () => Buffer.compare(beforeTheme, await canvas.screenshot()))
        .not.toBe(0);
    await page.screenshot({ path: testInfo.outputPath('dark-custom-theme.png'), fullPage: true });
    await page.evaluate(() => {
        document.documentElement.style.zoom = '200%';
    });
    await page.screenshot({ path: testInfo.outputPath('zoom-200-percent.png'), fullPage: true });
    await app.login('supervisor');
    expect((await page.request.get(asset.url)).status()).toBe(200);
    await page.goto('/__e2e/login/operator');
    expect((await page.request.get(asset.url)).status()).toBe(403);
    await app.clean();
});

test('missing WebGL keeps accessible live machine list and explains fallback', async ({ page }) => {
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            return String(type).startsWith('webgl') ? null : original.call(this, type, ...args);
        };
    });
    const app = new FactoryPage(page);
    await app.login();
    await app.open();
    await expect(app.root.getByText(/Cảnh 3D có giới hạn/)).toBeVisible();
    await expect(app.root.getByRole('region', { name: 'Danh sách máy' })).toBeVisible();
    await app.root.getByRole('button', { name: /E2E-A1 E2E Machine A1/ }).click();
    await expect(
        app.root.getByRole('heading', { name: 'Công đoạn đang thực hiện (2)' }),
    ).toBeVisible();
    await app.clean();
});

test('new floor and machine are authored from numeric UI and survive publication', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    await app.open();
    const original = (await app.api(`/factories/${fixture.factories.A}/layout?draft=1`)).data.data
        .layout;
    await app.root.getByRole('button', { name: 'Chỉnh mặt bằng', exact: true }).click();
    const inspector = app.root.getByRole('complementary', { name: 'Công cụ chỉnh mặt bằng' });
    const floorForm = inspector
        .locator('details')
        .filter({ has: page.getByText('Tạo tầng', { exact: true }) });
    await app.root
        .getByRole('combobox', { name: 'Tầng', exact: true })
        .first()
        .selectOption('ground');
    await expect(
        inspector.getByRole('button', { name: 'Tầng / khu vực', exact: true }),
    ).toBeEnabled();
    if (!(await floorForm.getByRole('textbox', { name: 'Tên tầng mới', exact: true }).isVisible()))
        await floorForm.locator('summary').click();
    await floorForm
        .getByRole('textbox', { name: 'Tên tầng mới', exact: true })
        .fill('E2E numeric floor');
    for (const [label, value] of [
        ['Chiều rộng (m)', '45'],
        ['Chiều sâu (m)', '18'],
        ['Cao độ (m)', '8'],
        ['Độ dày sàn (m)', '0.3'],
    ])
        await floorForm.getByRole('spinbutton', { name: label, exact: true }).fill(value);
    await floorForm.getByRole('button', { name: 'Thêm tầng theo kích thước', exact: true }).click();
    await app.root.getByRole('button', { name: 'Máy / kết cấu', exact: true }).click();
    const objectForm = inspector
        .locator('details')
        .filter({ has: page.getByText('Thêm máy / kết cấu', { exact: true }) });
    await objectForm
        .getByRole('combobox', { name: 'Máy chưa bố trí', exact: true })
        .selectOption(String(fixture.stations.A2));
    for (const [label, value] of [
        ['Rộng (m)', '1.5'],
        ['Cao (m)', '2.5'],
        ['Sâu (m)', '3.5'],
    ])
        await objectForm.getByRole('spinbutton', { name: label, exact: true }).fill(value);
    await objectForm.getByRole('button', { name: 'Thêm đối tượng vào tầng', exact: true }).click();
    await app.root.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
    await expect(app.root.getByRole('button', { name: 'Công bố', exact: true })).toBeEnabled();
    const published = page.waitForResponse(
        (r) =>
            r.url().endsWith(`/factories/${fixture.factories.A}/layout/publish`) &&
            r.request().method() === 'POST',
    );
    await app.root.getByRole('button', { name: 'Công bố', exact: true }).click();
    expect((await published).status()).toBe(200);
    const data = (await app.api(`/factories/${fixture.factories.A}/layout`)).data.data;
    const floor = data.layout.floors.find((f) => f.name === 'E2E numeric floor');
    expect(floor.polygon).toEqual([
        [0, 0],
        [45, 0],
        [45, 18],
        [0, 18],
    ]);
    expect(floor.elevation).toBe(8);
    const object = data.layout.objects.find((o) => o.workstation_id === fixture.stations.A2);
    expect(object.floor_id).toBe(floor.id);
    expect(object.dimensions).toEqual({ width: 1.5, height: 2.5, depth: 3.5 });
    const restore = await app.api(`/factories/${fixture.factories.A}/layout/draft`, {
        method: 'PUT',
        body: { expected_version: data.version, layout: original },
    });
    expect(restore.status).toBe(200);
    expect(
        (
            await app.api(`/factories/${fixture.factories.A}/layout/publish`, {
                method: 'POST',
                body: { expected_version: restore.data.data.version },
            })
        ).status,
    ).toBe(200);
    await app.clean();
});

test('private GLB cannot be read from unassigned factory by guessing its asset ID', async ({
    page,
}) => {
    const app = new FactoryPage(page);
    await app.login();
    const token = await page.locator('meta[name=csrf-token]').getAttribute('content');
    const uploaded = await page.request.post(
        `/modules/factory-management-3d/factories/${fixture.factories.B}/assets`,
        {
            headers: { 'X-CSRF-TOKEN': token, Accept: 'application/json' },
            multipart: {
                model: {
                    name: 'private-b.glb',
                    mimeType: 'model/gltf-binary',
                    buffer: fs.readFileSync(path.join(runtime, 'triangle.glb')),
                },
            },
        },
    );
    expect(uploaded.status()).toBe(201);
    const asset = (await uploaded.json()).data;
    expect((await page.request.get(asset.url)).status()).toBe(200);
    await app.login('supervisor');
    expect((await page.request.get(asset.url)).status()).toBe(404);
    await app.clean();
});

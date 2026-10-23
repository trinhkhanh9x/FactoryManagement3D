import { expect } from '@playwright/test';

export class FactoryPage {
    constructor(page) {
        this.page = page;
        this.root = page.locator('.fm3d-root');
        this.errors = [];
        page.on('pageerror', (error) => this.errors.push(error.message));
    }
    async login(actor = 'admin') {
        await this.page.goto(`/__e2e/login/${actor}`);
        await expect(
            this.page.getByRole('heading', { name: 'Nhà xưởng 3D', exact: true }),
        ).toBeVisible();
        await expect(this.root.getByText('Đang tải danh mục nhà xưởng…')).toHaveCount(0);
    }
    async open(name = 'E2E Factory A') {
        if (!/\/factories\/\d+(?:\?.*)?$/.test(this.page.url())) {
            await this.root
                .locator('article')
                .filter({ has: this.page.getByRole('heading', { name, exact: true }) })
                .getByRole('button', { name: `Mở nhà xưởng ${name}`, exact: true })
                .click();
        }
        await expect(this.root.getByRole('heading', { name, exact: true })).toBeVisible();
        await expect(
            this.root.getByRole('button', { name: /E2E-A1 E2E Machine A1/ }),
        ).toBeVisible();
    }
    async api(path, options = {}) {
        return this.page.evaluate(
            async ({ path, options }) => {
                const response = await fetch('/modules/factory-management-3d' + path, {
                    ...options,
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': document.querySelector('meta[name=csrf-token]').content,
                        ...options.headers,
                    },
                    body: options.body ? JSON.stringify(options.body) : undefined,
                });
                return { status: response.status, data: await response.json().catch(() => null) };
            },
            { path, options },
        );
    }
    async clean() {
        expect(this.errors).toEqual([]);
    }
}

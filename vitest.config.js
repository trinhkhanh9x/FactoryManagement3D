import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const local = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    esbuild: { jsx: 'automatic' },
    resolve: {
        alias: {
            '@openmes/ui': local('./tests/js/stubs/ui.jsx'),
            '@core/layouts/AppLayout': local('./tests/js/stubs/layout.jsx'),
            '@core/components/PageTitle': local('./tests/js/stubs/page.jsx'),
            '@core/components/PageTrail': local('./tests/js/stubs/page.jsx'),
            '@core/lib/i18n': local('./tests/js/stubs/i18n.js'),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['tests/js/**/*.test.{js,jsx,mjs}', 'resources/js/**/*.test.{js,jsx}'],
        exclude: ['**/node_modules/**', '**/tests/e2e/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary', 'html'],
            include: ['resources/js/**/*.{js,jsx,mjs}'],
            exclude: ['resources/js/bootstrap.jsx'],
            thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
        },
    },
});

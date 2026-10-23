import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { existsSync } from 'node:fs';

const artifacts = path.resolve('../../../../artifacts/FactoryManagement3D-1.1.0/e2e');
export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 120000,
    expect: { timeout: 15000 },
    outputDir: path.join(artifacts, 'results'),
    reporter: [
        ['list'],
        ['html', { outputFolder: path.join(artifacts, 'html'), open: 'never' }],
        ['junit', { outputFile: path.join(artifacts, 'junit.xml') }],
    ],
    use: {
        baseURL: 'http://127.0.0.1:19431',
        viewport: { width: 1280, height: 800 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        launchOptions: {
            ...(process.env.FM3D_CHROME
                ? { executablePath: process.env.FM3D_CHROME }
                : existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
                  ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }
                  : {}),
            args: ['--enable-unsafe-swiftshader'],
        },
    },
});

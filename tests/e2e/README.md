# Isolated FactoryManagement3D browser verification

Run from the module directory with the core Composer dependencies and this module's npm dependencies already installed.

1. Set `FM3D_CHROME` only when using a specific Chromium executable. Otherwise the configuration uses installed Chrome when present, then Playwright's installed Chromium.
2. Run `php tools/test-setup.php` using a PHP runtime with SQLite, fileinfo, mbstring and the core's required extensions. Wait for `Isolated E2E fixture ready.` This resets only `artifacts/FactoryManagement3D-1.0.0/e2e-runtime/test.sqlite`.
3. Keep `php -S 127.0.0.1:19431 tools/test-router.php` running in a separate managed terminal.
4. Run `node node_modules/@playwright/test/cli.js test --config playwright.config.js --workers=1 --repeat-each=3`.
5. Stop the local PHP server when finished. Reports are in `artifacts/FactoryManagement3D-1.1.0/e2e/html`, `junit.xml` and `results/`. The isolated fixture runtime intentionally remains under `FactoryManagement3D-1.0.0/e2e-runtime`.

The harness never loads the installation's `.env`, overrides configuration and route cache paths, forces its own SQLite connection, storage, sessions and public assets, and disables telemetry and mail delivery. Its loopback-only session bootstrap exists only in `tools/test-router.php`, which is excluded from release packaging. All dimensions and GLB geometry in the fixture are explicitly test data.

The tests use real MES/Inertia runtime assets, actual module endpoints, authenticated protected model downloads and real WebGL rendering. The unsupported-WebGL scenario replaces `canvas.getContext` to exercise the browser capability fallback. Two failure-state scenarios abort only the relevant layout or snapshot network request. There are no fabricated API responses or UI mocks.

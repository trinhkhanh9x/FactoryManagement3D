import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { buildPackage } from '../../tools/package.mjs';

const directories = [];
afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
});

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'fm3d-package-'));
    directories.push(root);
    for (const dir of [
        'Http',
        'Services',
        'Adapters',
        'Contracts',
        'Models',
        'Providers',
        'database/migrations',
        'public',
        'tests',
        'tools',
        'docs',
    ])
        await mkdir(join(root, dir), { recursive: true });
    await writeFile(
        join(root, 'module.json'),
        JSON.stringify({ name: 'FactoryManagement3D', version: '1.0.0' }),
    );
    for (const path of [
        'Installer.php',
        'compatibility.json',
        'Adapters/OpenMesProductionReader.php',
        'Contracts/ProductionReader.php',
        'README.md',
        'routes.php',
        'Providers/FactoryManagement3DServiceProvider.php',
        'database/migrations/tables.php',
        'public/FactoryManagement3D.js',
        'public/FactoryManagement3D.runtime.json',
        'docs/USER-GUIDE.md',
        'docs/CONTRACT.md',
        'THIRD-PARTY-NOTICES.md',
    ])
        await writeFile(join(root, path), 'fixture');
    await writeFile(join(root, '.env'), 'PRIVATE_NOT_IN_PACKAGE');
    await writeFile(join(root, 'Services/.env.local'), 'PRIVATE_NOT_IN_PACKAGE');
    await writeFile(join(root, 'tests/test.php'), 'DEV_NOT_IN_PACKAGE');
    await writeFile(join(root, 'tools/setup.php'), 'DEV_NOT_IN_PACKAGE');
    return root;
}

describe('release packaging', () => {
    it('creates an installable top-level package with checksum and no local state', async () => {
        const root = await fixture();
        const output = join(root, 'out');
        const result = await buildPackage(root, output);
        const entries = unzipSync(await readFile(result.path));
        const names = Object.keys(entries);
        expect(names).toContain('FactoryManagement3D/module.json');
        expect(names).toContain('FactoryManagement3D/compatibility.json');
        expect(names).toContain('FactoryManagement3D/Adapters/OpenMesProductionReader.php');
        expect(names).toContain('FactoryManagement3D/Contracts/ProductionReader.php');
        expect(names).toContain('FactoryManagement3D/database/migrations/tables.php');
        expect(names).toContain('FactoryManagement3D/docs/USER-GUIDE.md');
        expect(names).toContain('FactoryManagement3D/docs/CONTRACT.md');
        expect(names).toContain('FactoryManagement3D/THIRD-PARTY-NOTICES.md');
        expect(names.every((name) => name.startsWith('FactoryManagement3D/'))).toBe(true);
        expect(names.some((name) => /\.env|\/tests\/|\/tools\/|node_modules/.test(name))).toBe(
            false,
        );
        expect(names.map((name) => strFromU8(entries[name])).join('')).not.toContain(
            'PRIVATE_NOT_IN_PACKAGE',
        );
        expect(await readFile(`${result.path}.sha256`, 'utf8')).toContain(result.sha256);
    });
    it('fails loudly when compiled frontend is missing', async () => {
        const root = await fixture();
        await rm(join(root, 'public/FactoryManagement3D.js'));
        await expect(buildPackage(root, join(root, 'out'))).rejects.toThrow(
            /FactoryManagement3D\.js/,
        );
    });
    it('rejects unexpected module identity rather than building another module', async () => {
        const root = await fixture();
        await writeFile(
            join(root, 'module.json'),
            JSON.stringify({ name: '../Other', version: '1.0.0' }),
        );
        await expect(buildPackage(root, join(root, 'out'))).rejects.toThrow(/identity|manifest/i);
    });
});

import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';

const MODULE = 'FactoryManagement3D';
const PHP_DIRECTORIES = ['Adapters', 'Contracts', 'Http', 'Models', 'Providers', 'Services', 'database/migrations'];
const REQUIRED_FILES = [
    'module.json',
    'compatibility.json',
    'Installer.php',
    'routes.php',
    'README.md',
    'THIRD-PARTY-NOTICES.md',
    'docs/USER-GUIDE.md',
    'docs/CONTRACT.md',
    `public/${MODULE}.js`,
    `public/${MODULE}.runtime.json`,
];

async function phpFiles(root, directory) {
    const result = [];
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Release must not include a symlink: ${path}`);
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) result.push(...(await phpFiles(root, path)));
        else if (entry.name.endsWith('.php')) result.push(path);
    }
    return result;
}

export async function buildPackage(root, output) {
    const manifest = JSON.parse(await readFile(join(root, 'module.json'), 'utf8'));
    if (manifest.name !== MODULE || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(manifest.version)) {
        throw new Error('Invalid release manifest identity/version.');
    }
    const files = [...REQUIRED_FILES];
    for (const directory of PHP_DIRECTORIES) files.push(...(await phpFiles(root, directory)));
    const archive = {};
    for (const path of [...new Set(files)].sort()) {
        const absolute = resolve(root, path);
        const normalized = relative(resolve(root), absolute).split(sep).join('/');
        if (normalized.startsWith('../') || normalized.includes('/../'))
            throw new Error('Release path escaped module root.');
        const stat = await lstat(absolute);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error(`Release file missing or unsafe: ${path}`);
        archive[`${MODULE}/${normalized}`] = new Uint8Array(await readFile(absolute));
    }
    const bytes = zipSync(archive, { level: 9 });
    if (bytes.byteLength > 20 * 1024 * 1024)
        throw new Error('Release ZIP exceeds the OpenMES 20 MiB package limit.');
    await mkdir(output, { recursive: true });
    const path = join(output, `${MODULE}-${manifest.version}.zip`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path, bytes);
    await writeFile(`${path}.sha256`, `${sha256}  ${MODULE}-${manifest.version}.zip\n`);
    return { path, sha256, files: Object.keys(archive).length, size_bytes: bytes.byteLength };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const version = JSON.parse(await readFile(join(root, 'module.json'), 'utf8')).version;
    const output = process.argv[2]
        ? resolve(process.argv[2])
        : resolve(root, '../../../..', 'artifacts', `${MODULE}-${version}`);
    process.stdout.write(`${JSON.stringify(await buildPackage(root, output), null, 2)}\n`);
}

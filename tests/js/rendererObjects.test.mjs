import { afterEach, expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    fitModel,
    modelCache,
    objectGroup,
    polygonMesh,
    replacePlaceholder,
} from '../../resources/js/lib/rendererObjects.mjs';
import { disposeTree } from '../../resources/js/lib/sceneGeometry.mjs';
const theme = { floor: '#fff', line: '#888', muted: '#777' };
const object = {
    id: 'm',
    kind: 'machine',
    floor_id: 'a',
    position: { x: 2, y: 1, z: 3 },
    rotation: { x: 0, y: 0.5, z: 0 },
    dimensions: { width: 4, height: 3, depth: 2 },
};
afterEach(() => vi.restoreAllMocks());
test('floor polygon maps XZ and elevation to its actual slab top', () => {
    const mesh = polygonMesh(
        [
            [0, 0],
            [5, 0],
            [5, 3],
            [0, 3],
        ],
        7,
        0.2,
        '#fff',
    );
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.x).toBeCloseTo(0);
    expect(box.max.z).toBeCloseTo(3);
    expect(box.max.y).toBeCloseTo(7);
    expect(box.min.y).toBeCloseTo(6.8);
    disposeTree(mesh);
});
test('unsafe draft geometry is rejected before creating Three geometry', () => {
    for (const value of [Infinity, NaN, 1e9]) {
        expect(() =>
            polygonMesh(
                [
                    [0, 0],
                    [value, 0],
                    [1, 1],
                ],
                0,
                0.2,
                '#fff',
            ),
        ).toThrow();
        expect(() =>
            objectGroup({ ...object, position: { x: value, y: 0, z: 0 } }, [], theme),
        ).toThrow();
        expect(() =>
            objectGroup(
                {
                    ...object,
                    dimensions: { ...object.dimensions, width: value },
                },
                [],
                theme,
            ),
        ).toThrow();
    }
    expect(() =>
        polygonMesh(
            [
                [0, 0],
                [1, 0],
            ],
            0,
            0.2,
            '#fff',
        ),
    ).toThrow();
    expect(() =>
        polygonMesh(
            [
                [0, 0],
                [1, 0],
                [1, 1],
            ],
            Infinity,
            0.2,
            '#fff',
        ),
    ).toThrow();
    expect(() =>
        polygonMesh(
            [
                [0, 0],
                [1, 0],
                [1, 1],
            ],
            0,
            0,
            '#fff',
        ),
    ).toThrow();
});
test('machine fallback uses physical dimensions with state ring and correct elevation', () => {
    const group = objectGroup(object, [{ id: 'a', elevation: 5 }], theme);
    expect(group.position.toArray()).toEqual([2, 6, 3]);
    expect(group.userData.marker).toBeTruthy();
    expect(group.userData.placeholder[0].geometry.parameters.width).toBe(4);
    const wall = objectGroup({ ...object, kind: 'wall' }, [], theme);
    expect(wall.userData.marker).toBeUndefined();
    const walkway = objectGroup({ ...object, kind: 'walkway' }, [], theme);
    expect(walkway.children[0].material.opacity).toBe(0.45);
    disposeTree(group);
    disposeTree(wall);
    disposeTree(walkway);
});
test('model fit clones disposable geometry/material and preserves source appearance and origin', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#123456' });
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), material));
    const fitted = fitModel(source, { width: 3, height: 4, depth: 2 });
    const clone = fitted.children[0].children[0];
    expect(clone.material.color.getHexString()).toBe('123456');
    expect(clone.material).not.toBe(material);
    expect(clone.geometry).not.toBe(source.children[0].geometry);
    const bounds = new THREE.Box3().setFromObject(fitted);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeCloseTo(4);
    expect(source.position.toArray()).toEqual([0, 0, 0]);
    const group = objectGroup(object, [], theme);
    replacePlaceholder(group, fitted);
    expect(group.userData.placeholder).toEqual([]);
    expect(group.children).toContain(fitted);
    disposeTree(group, { textures: false });
    disposeTree(source);
});
test('cached protected fetch is reused and removed assets abort downloads', async () => {
    const source = new THREE.Group(),
        controllerSignals = [];
    vi.stubGlobal(
        'fetch',
        vi.fn((_url, options) => {
            controllerSignals.push(options.signal);
            return Promise.resolve({
                ok: true,
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
            });
        }),
    );
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({
        scene: source,
    });
    const cache = modelCache(),
        asset = { id: 1, url: '/assets/1' };
    expect(await cache.load(asset)).toBe(source);
    expect(await cache.load(asset)).toBe(source);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].credentials).toBe('same-origin');
    cache.retain([]);
    expect(controllerSignals[0].aborted).toBe(true);
    cache.dispose();
});
test('cache rejects HTTP failures, external URLs and stale parses during disposal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const cache = modelCache();
    await expect(cache.load({ url: '/assets/2' })).rejects.toThrow('403');
    expect(() => cache.load({ url: 'https://external.test/model.glb' })).toThrow();
    cache.dispose();
    let resolveParse;
    vi.mocked(fetch).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveParse = resolve;
            }),
    );
    const pending = modelCache(),
        promise = pending.load({ url: '/assets/3' });
    await vi.waitFor(() => expect(resolveParse).toBeTypeOf('function'));
    pending.dispose();
    resolveParse({ scene: new THREE.Group() });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
});

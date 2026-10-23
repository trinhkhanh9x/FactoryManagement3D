import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const recorded = vi.hoisted(() => ({ renderers: [], grids: [] }));
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        GridHelper: class extends actual.GridHelper {
            constructor(size, divisions, ...args) {
                if (divisions > 200) throw new Error('Unsafe grid complexity');
                super(size, divisions, ...args);
                recorded.grids.push({ size, divisions });
            }
        },
        WebGLRenderer: class {
            constructor({ canvas }) {
                this.domElement = canvas;
                this.dispose = vi.fn();
                this.forceContextLoss = vi.fn();
                this.render = vi.fn((scene, camera) => {
                    scene.updateMatrixWorld(true);
                    camera.updateMatrixWorld(true);
                });
                recorded.renderers.push(this);
            }
            setPixelRatio() {}
            setSize(width, height) {
                this.domElement.width = width;
                this.domElement.height = height;
            }
        },
    };
});
import { createFactoryRenderer } from '../../resources/js/lib/renderer.mjs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
let host, engine;
const layout = {
    floors: [
        {
            id: 'f',
            name: 'Floor',
            elevation: 0,
            thickness: 0.2,
            polygon: [
                [-5, -5],
                [5, -5],
                [5, 5],
                [-5, 5],
            ],
        },
    ],
    zones: [],
    objects: [
        {
            id: 'm',
            label: 'Máy',
            kind: 'machine',
            floor_id: 'f',
            workstation_id: 1,
            asset_id: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { width: 2, height: 2, depth: 2 },
        },
    ],
};
const initial = {
    layout,
    stations: [{ id: 1, state: 'RUNNING' }],
    assets: [],
    floorId: null,
    viewMode: 'perspective',
    selectedId: null,
    editable: false,
};
beforeEach(() => {
    vi.useFakeTimers();
    recorded.renderers.length = 0;
    recorded.grids.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            disconnect() {}
        },
    );
    vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    host = document.createElement('div');
    host.style.cssText =
        '--om-bg:#111;--om-panel:#222;--om-line:#333;--om-muted:#888;--om-accent:#f00;--om-ink:#fff;--om-running:#0f0;--om-blocked:#a00;--om-maint:#00f;--om-planned:#ff0';
    Object.defineProperties(host, {
        clientWidth: { value: 800 },
        clientHeight: { value: 600 },
    });
    document.body.append(host);
});
afterEach(() => {
    engine?.dispose();
    engine = null;
    host?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
test('unsupported WebGL returns actionable error without mounting a canvas', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(() => createFactoryRenderer(host, {})).toThrow('WebGL 2');
    expect(host.querySelector('canvas')).toBeNull();
});
test('large valid floor uses a bounded grid and zone theme changes preserve model identity', async () => {
    const largeLayout = {
        ...layout,
        floors: layout.floors.map((floor) => ({
            ...floor,
            polygon: [
                [-10000, -10000],
                [10000, -10000],
                [10000, 10000],
                [-10000, 10000],
            ],
        })),
        zones: [
            {
                id: 'zone',
                floor_id: 'f',
                polygon: [
                    [0, 0],
                    [2, 0],
                    [2, 2],
                ],
            },
        ],
    };
    engine = createFactoryRenderer(host, {});
    expect(() => engine.update({ ...initial, layout: largeLayout })).not.toThrow();
    await vi.runOnlyPendingTimersAsync();
    expect(recorded.grids).toEqual([{ size: 20000, divisions: 200 }]);
    const [scene] = recorded.renderers[0].render.mock.lastCall,
        content = scene.children.find((child) => child.type === 'Group'),
        zone = content.children.find((child) => child.userData.zone),
        machine = content.children.find((child) => child.userData.sceneId === 'm');
    expect(zone).toBeDefined();
    expect(zone.material.color.getHexString()).toBe('333333');
    host.style.setProperty('--om-line', '#abcdef');
    document.dispatchEvent(new Event('themechange'));
    await vi.runOnlyPendingTimersAsync();
    expect(zone.material.color.getHexString()).toBe('abcdef');
    expect(content.children.find((child) => child.userData.sceneId === 'm')).toBe(machine);
});
test.each(['perspective', 'top'])(
    'framing a large floor keeps its whole depth inside the %s camera',
    async (viewMode) => {
        const largeLayout = {
            ...layout,
            floors: layout.floors.map((floor) => ({
                ...floor,
                polygon: [
                    [-10000, -10000],
                    [10000, -10000],
                    [10000, 10000],
                    [-10000, 10000],
                ],
            })),
        };
        engine = createFactoryRenderer(host, {});
        engine.update({ ...initial, layout: largeLayout, viewMode });
        await vi.runOnlyPendingTimersAsync();
        const [scene, camera] = recorded.renderers[0].render.mock.lastCall;
        const content = scene.children.find((child) => child.type === 'Group');
        const bounds = new Box3().setFromObject(content);
        for (const x of [bounds.min.x, bounds.max.x])
            for (const y of [bounds.min.y, bounds.max.y])
                for (const z of [bounds.min.z, bounds.max.z]) {
                    const point = new Vector3(x, y, z);
                    expect(-point.clone().applyMatrix4(camera.matrixWorldInverse).z).toBeLessThan(
                        camera.far,
                    );
                    expect(point.project(camera).z).toBeLessThan(1);
                }
    },
);
test('renderer updates state/theme and camera on demand without perpetual RAF', async () => {
    const onError = vi.fn();
    engine = createFactoryRenderer(host, { onError });
    engine.update(initial);
    await vi.runOnlyPendingTimersAsync();
    const renderer = recorded.renderers[0];
    expect(renderer.render).toHaveBeenCalled();
    const [scene] = renderer.render.mock.lastCall;
    expect(scene.background.getHexString()).toBe('111111');
    expect(
        scene.children
            .find((child) => child.type === 'Group')
            .children.some((child) => child.userData.grid),
    ).toBe(true);
    const content = scene.children.find((child) => child.type === 'Group'),
        machine = content.children.find((child) => child.userData.sceneId === 'm');
    expect(machine.userData.marker.material.color.getHexString()).toBe('00ff00');
    engine.update({ ...initial, stations: [{ id: 1, state: 'FAULT' }] });
    await vi.runOnlyPendingTimersAsync();
    expect(content.children.find((child) => child.userData.sceneId === 'm')).toBe(machine);
    expect(machine.userData.marker.material.color.getHexString()).toBe('aa0000');
    host.style.setProperty('--om-bg', '#fff');
    document.documentElement.classList.toggle('dark');
    await Promise.resolve();
    await vi.runOnlyPendingTimersAsync();
    expect(scene.background.getHexString()).toBe('ffffff');
    engine.update({
        ...initial,
        viewMode: 'top',
        selectedId: 'm',
        editable: true,
        focusId: 'm',
    });
    await vi.runOnlyPendingTimersAsync();
    expect(renderer.render.mock.lastCall[1].isOrthographicCamera).toBe(true);
    engine.update({ ...initial, viewMode: 'perspective' });
    await vi.runOnlyPendingTimersAsync();
    expect(renderer.render.mock.lastCall[1].isPerspectiveCamera).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    host.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('WebGL'));
    engine.dispose();
    engine = null;
    expect(renderer.dispose).toHaveBeenCalled();
    expect(renderer.forceContextLoss).toHaveBeenCalled();
    expect(host.querySelector('canvas')).toBeNull();
});
test('labels project to viewport and floor filtering rebuilds content, selection accepts empty space', async () => {
    const label = document.createElement('button');
    label.dataset.sceneLabel = 'm';
    host.append(label);
    const onSelect = vi.fn();
    engine = createFactoryRenderer(host, { onSelect });
    engine.update(initial);
    await vi.runOnlyPendingTimersAsync();
    expect(label.style.left).toMatch(/px$/);
    expect(label.style.top).toMatch(/px$/);
    const canvas = host.querySelector('canvas');
    canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
    });
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300 }));
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 400, clientY: 300 }));
    expect(onSelect).toHaveBeenCalled();
    engine.update({ ...initial, floorId: 'missing' });
    await vi.runOnlyPendingTimersAsync();
    const [scene] = recorded.renderers[0].render.mock.lastCall;
    expect(scene.children.find((child) => child.type === 'Group').children).toHaveLength(0);
});
test('editor transform emits complete floor-relative positions and disables when editor exits', async () => {
    const onMove = vi.fn();
    engine = createFactoryRenderer(host, { onMove });
    const elevated = {
        ...layout,
        floors: layout.floors.map((floor) => ({ ...floor, elevation: 5 })),
    };
    engine.update({
        ...initial,
        layout: elevated,
        selectedId: 'm',
        editable: true,
    });
    await vi.runOnlyPendingTimersAsync();
    const [scene] = recorded.renderers[0].render.mock.lastCall,
        helper = scene.children.find((child) => child.isTransformControlsRoot);
    const control = helper.controls;
    expect(control.enabled).toBe(true);
    expect(control.translationSnap).toBe(0.1);
    const detach = vi.spyOn(control, 'detach');
    control.dragging = true;
    engine.update({
        ...initial,
        layout: elevated,
        selectedId: 'm',
        editable: true,
        stations: [{ id: 1, state: 'FAULT' }],
    });
    expect(detach).not.toHaveBeenCalled();
    expect(control.dragging).toBe(true);
    control.dragging = false;
    control.object.position.set(3, 6, 4);
    control.dispatchEvent({ type: 'dragging-changed', value: true });
    control.dispatchEvent({ type: 'mouseUp' });
    expect(onMove).toHaveBeenCalledWith('m', { x: 3, y: 1, z: 4 });
    engine.update({
        ...initial,
        layout: elevated,
        selectedId: 'm',
        editable: false,
    });
    expect(control.enabled).toBe(false);
});
test('explicit reset reframes repeatedly and structure visibility leaves machine visible', async () => {
    const withWall = {
        ...layout,
        objects: [
            ...layout.objects,
            {
                ...layout.objects[0],
                id: 'wall',
                kind: 'wall',
                workstation_id: null,
            },
        ],
    };
    engine = createFactoryRenderer(host, {});
    engine.update({ ...initial, layout: withWall });
    await vi.runOnlyPendingTimersAsync();
    const renderer = recorded.renderers[0],
        camera = renderer.render.mock.lastCall[1],
        original = camera.position.clone();
    camera.position.set(90, 80, 70);
    engine.update({ ...initial, layout: withWall, resetKey: 1 });
    await vi.runOnlyPendingTimersAsync();
    expect(camera.position.toArray()).toEqual(original.toArray());
    camera.position.set(90, 80, 70);
    engine.update({
        ...initial,
        layout: withWall,
        resetKey: 2,
        showStructure: false,
        snap: 0,
    });
    await vi.runOnlyPendingTimersAsync();
    expect(camera.position.toArray()).toEqual(original.toArray());
    const content = renderer.render.mock.lastCall[0].children.find(
        (child) => child.type === 'Group',
    );
    expect(content.children.some((child) => child.userData.sceneId === 'wall')).toBe(false);
    expect(content.children.some((child) => child.userData.sceneId === 'm')).toBe(true);
});
test('self-contained model loads once across snapshots, keeps material and falls back on load failures', async () => {
    const source = new Group();
    source.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial({ color: '#123456' })));
    const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({
        scene: source,
    });
    const onError = vi.fn(),
        assets = [{ id: 4, url: '/assets/4' }],
        withAsset = {
            ...layout,
            zones: [
                {
                    id: 'z',
                    floor_id: 'f',
                    polygon: [
                        [0, 0],
                        [2, 0],
                        [2, 2],
                    ],
                },
            ],
            objects: layout.objects.map((item) => ({ ...item, asset_id: 4 })),
        };
    engine = createFactoryRenderer(host, { onError });
    engine.update({ ...initial, layout: withAsset, assets });
    await vi.runOnlyPendingTimersAsync();
    const [scene] = recorded.renderers[0].render.mock.lastCall,
        machine = scene.children
            .find((child) => child.type === 'Group')
            .children.find((child) => child.userData.sceneId === 'm');
    expect(machine.userData.placeholder).toEqual([]);
    engine.update({
        ...initial,
        layout: withAsset,
        assets,
        stations: [{ id: 1, state: null }],
    });
    await vi.runOnlyPendingTimersAsync();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(machine.userData.marker.material.wireframe).toBe(true);
    fetcher.mockResolvedValueOnce({ ok: false, status: 500 });
    engine.update({
        ...initial,
        layout: withAsset,
        assets: [{ id: 4, url: '/assets/broken' }],
    });
    await vi.runOnlyPendingTimersAsync();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('khối thay thế'));
});

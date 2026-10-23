import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
    worldPosition,
    floorPosition,
    visibleObjects,
    physicalScale,
    disposeTree,
    createGeneration,
    safeAssetUrl,
    gridParameters,
} from '../../resources/js/lib/sceneGeometry.mjs';
import { stationState, readSceneTheme, observeSceneTheme } from '../../resources/js/lib/theme.mjs';

test('objects use floor-relative metres and filter floors without mutating layout', () => {
    const layout = {
        floors: [{ id: 'a', elevation: 7 }],
        objects: [{ id: 'm', floor_id: 'a', position: { x: 2, y: 1, z: -3 } }],
    };
    assert.deepEqual(worldPosition(layout.objects[0], layout.floors), {
        x: 2,
        y: 8,
        z: -3,
    });
    assert.deepEqual(floorPosition({ x: 2, y: 8, z: -3 }, layout.floors[0]), {
        x: 2,
        y: 1,
        z: -3,
    });
    assert.equal(visibleObjects(layout, null).length, 1);
    assert.equal(visibleObjects(layout, 'b').length, 0);
    assert.equal(layout.objects[0].position.y, 1);
    assert.equal(
        visibleObjects(
            {
                ...layout,
                objects: [
                    { kind: 'wall', floor_id: 'a' },
                    { kind: 'door', floor_id: 'a' },
                    ...layout.objects,
                ],
            },
            null,
            false,
        ).length,
        1,
    );
});
test('grid complexity stays bounded while spacing adapts to large valid floors', () => {
    assert.deepEqual(gridParameters(10, 6), { span: 10, divisions: 10 });
    assert.deepEqual(gridParameters(20000, 10000), {
        span: 20000,
        divisions: 200,
    });
    for (const value of [Infinity, NaN, -1, 1e9]) assert.throws(() => gridParameters(value, 5));
});
test('GLB fitting uses uniform physical scale and rejects degenerate models', () => {
    assert.equal(physicalScale({ x: 2, y: 4, z: 1 }, { width: 3, height: 4, depth: 2 }), 1);
    assert.equal(physicalScale({ x: 2, y: 4, z: 1 }, { width: 1, height: 8, depth: 2 }), 0.5);
    assert.throws(() => physicalScale({ x: 0, y: 0, z: 0 }, { width: 1, height: 1, depth: 1 }));
});
test('resource disposal deduplicates shared geometry, materials and textures', () => {
    const counts = { geometry: 0, material: 0, texture: 0 };
    const geometry = {
        dispose() {
            counts.geometry++;
        },
    };
    let closed = 0;
    const material = {
        map: {
            isTexture: true,
            source: {
                data: {
                    close() {
                        closed++;
                    },
                },
            },
            dispose() {
                counts.texture++;
            },
        },
        dispose() {
            counts.material++;
        },
    };
    disposeTree({
        traverse(fn) {
            fn({ geometry, material: [material, material] });
            fn({ geometry, material });
        },
    });
    assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
    assert.equal(closed, 1);
    disposeTree(
        {
            traverse(fn) {
                fn({ material });
            },
        },
        { textures: false },
    );
    assert.equal(counts.texture, 1);
});
test('generations suppress stale asynchronous loads and invalidate on teardown', () => {
    const guard = createGeneration();
    const a = guard.next();
    assert.equal(guard.isCurrent(a), true);
    const b = guard.next();
    assert.equal(guard.isCurrent(a), false);
    assert.equal(guard.isCurrent(b), true);
    guard.dispose();
    assert.equal(guard.isCurrent(b), false);
});
test('protected assets must remain on the current origin', () => {
    assert.equal(
        safeAssetUrl('/modules/factory-management-3d/assets/1', 'https://mes.test'),
        'https://mes.test/modules/factory-management-3d/assets/1',
    );
    assert.throws(() => safeAssetUrl('https://foreign.test/m.glb', 'https://mes.test'));
    assert.throws(() => safeAssetUrl('data:model/gltf-binary;base64,AA', 'https://mes.test'));
});
test('machine colors retain shift board semantics and unknown differs from idle', () => {
    for (const state of ['STOPPED', 'FAULT', 'WAITING'])
        assert.equal(stationState(state).token, '--om-blocked');
    assert.equal(stationState('RUNNING').token, '--om-running');
    assert.equal(stationState('SETUP').token, '--om-maint');
    assert.equal(stationState('MAINTENANCE').token, '--om-planned');
    assert.equal(stationState('IDLE').pattern, false);
    assert.equal(stationState(null).pattern, true);
    assert.notEqual(stationState('FAULT').label, stationState('WAITING').label);
});
test('theme adapter reads current tokens without hardcoded colors', () => {
    const theme = readSceneTheme({
        getPropertyValue: (token) => (token === '--om-bg' ? ' #abc ' : ' rgb(1, 2, 3) '),
    });
    assert.equal(theme.background, '#abc');
    assert.equal(theme['--om-running'], 'rgb(1, 2, 3)');
});
test('theme observer watches only theme attributes and cleans observer/listeners', () => {
    let observerOptions,
        disconnected = false,
        events = [];
    class Observer {
        constructor(fn) {
            this.fn = fn;
        }
        observe(_target, options) {
            observerOptions = options;
        }
        disconnect() {
            disconnected = true;
        }
    }
    const doc = {
        documentElement: {},
        body: {},
        addEventListener: (e) => events.push(e),
        removeEventListener: (e) => events.splice(events.indexOf(e), 1),
    };
    const stop = observeSceneTheme(() => {}, doc, Observer);
    assert.deepEqual(observerOptions.attributeFilter, [
        'class',
        'style',
        'data-theme',
        'data-color-scheme',
    ]);
    stop();
    assert.equal(disconnected, true);
    assert.equal(events.length, 0);
});

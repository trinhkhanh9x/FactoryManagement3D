import { describe, expect, it } from 'vitest';
import {
    emptyLayout,
    addEntity,
    updateEntity,
    removeEntity,
    validateLayout,
    radians,
    degrees,
    filterStations,
} from '../../resources/js/lib/layout.js';

describe('immutable draft editing', () => {
    it('keeps original layout untouched and removes dependent geometry safely', () => {
        const initial = emptyLayout();
        const withFloor = addEntity(initial, 'floors', {
            id: 'f1',
            name: 'Tầng',
            elevation: 0,
            thickness: 0.2,
            polygon: [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
            ],
            verified: false,
        });
        const withZone = addEntity(withFloor, 'zones', {
            id: 'z1',
            name: 'Khu',
            floor_id: 'f1',
            polygon: [
                [0, 0],
                [1, 0],
                [1, 1],
            ],
        });
        const withMachine = addEntity(withZone, 'objects', {
            id: 'm1',
            kind: 'machine',
            floor_id: 'f1',
            zone_id: 'z1',
            position: { x: 1, y: 0, z: 1 },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { width: 1, height: 1, depth: 1 },
            workstation_id: 8,
        });
        const moved = updateEntity(withMachine, 'objects', 'm1', {
            position: { x: 4, y: 0, z: 5 },
        });
        expect(withMachine.objects[0].position.x).toBe(1);
        expect(moved.objects[0].position.x).toBe(4);
        expect(initial.floors).toEqual([]);
        expect(removeEntity(moved, 'zones', 'z1').objects[0].zone_id).toBeNull();
        expect(removeEntity(moved, 'floors', 'f1')).toEqual(emptyLayout());
    });
    it('rejects duplicate machines, dangling references and non-finite geometry before save', () => {
        const layout = {
            schema_version: 1,
            floors: [
                {
                    id: 'f',
                    name: 'F',
                    elevation: 0,
                    thickness: 0.2,
                    polygon: [
                        [0, 0],
                        [5, 0],
                        [5, 5],
                    ],
                },
            ],
            zones: [],
            objects: [
                {
                    id: 'a',
                    kind: 'machine',
                    floor_id: 'f',
                    workstation_id: 1,
                    position: { x: 0, y: 0, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    dimensions: { width: 1, height: 1, depth: 1 },
                },
                {
                    id: 'b',
                    kind: 'machine',
                    floor_id: 'missing',
                    workstation_id: 1,
                    position: { x: NaN, y: 0, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    dimensions: { width: 0, height: 1, depth: 1 },
                },
            ],
        };
        expect(validateLayout(layout).join(' ')).toMatch(/trùng|một vị trí/);
        expect(validateLayout(layout).join(' ')).toMatch(/tầng/);
        expect(validateLayout(layout).join(' ')).toMatch(/hợp lệ|hữu hạn|dương/);
    });
    it('converts degrees and searches concurrent operations without inferring machine state', () => {
        expect(degrees(radians(90))).toBeCloseTo(90);
        const station = {
            id: 1,
            state: 'UNKNOWN',
            code: 'MC1',
            name: 'Tiện',
            active_operations: [{ order_no: 'WO-9' }, { order_no: 'WO-10' }],
        };
        expect(filterStations([station], 'wo-10', 'UNKNOWN')).toEqual([station]);
        expect(filterStations([station], '', 'RUNNING')).toEqual([]);
    });
    it('rejects huge finite geometry before it can reach the live renderer', () => {
        const floor = {
            id: 'f',
            name: 'F',
            elevation: 0,
            thickness: 0.2,
            polygon: [
                [0, 0],
                [10, 0],
                [10, 10],
            ],
        };
        const object = {
            id: 'm',
            kind: 'machine',
            floor_id: 'f',
            workstation_id: 1,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { width: 1, height: 1, depth: 1 },
        };
        const valid = { schema_version: 1, floors: [floor], zones: [], objects: [object] };
        expect(validateLayout(valid)).toEqual([]);
        expect(
            validateLayout({
                ...valid,
                floors: [
                    {
                        ...floor,
                        polygon: [
                            [0, 0],
                            [1e9, 0],
                            [1e9, 1e9],
                        ],
                    },
                ],
            }).length,
        ).toBeGreaterThan(0);
        expect(
            validateLayout({ ...valid, floors: [{ ...floor, elevation: 1001, thickness: 101 }] })
                .length,
        ).toBeGreaterThan(0);
        expect(
            validateLayout({
                ...valid,
                objects: [
                    {
                        ...object,
                        position: { x: 10001, y: 0, z: 0 },
                        rotation: { x: 0, y: 10001, z: 0 },
                        dimensions: { width: 0.00001, height: 1, depth: 1 },
                    },
                ],
            }).length,
        ).toBeGreaterThan(0);
    });
});

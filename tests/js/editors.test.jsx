import React, { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BuildingEditor from '../../resources/js/components/BuildingEditor';
import ObjectEditor, { AssetUpload } from '../../resources/js/components/ObjectEditor';
import FactoryAdmin from '../../resources/js/components/FactoryAdmin';
import {
    catalog,
    factory,
    layout,
    machine,
    station,
    mount,
    click,
    fill,
    check,
    field,
    mockApi,
} from './uiHelpers';

const screens = [];
const render = async (component) => {
    const screen = await mount(component);
    screens.push(screen);
    return screen;
};
afterEach(async () => {
    for (const screen of screens.splice(0)) await screen.close();
    vi.restoreAllMocks();
});

describe('building editor', () => {
    it('requires real dimensions, adds floor then edits vertices and verification immutably', async () => {
        let current;
        function Harness() {
            const [value, setValue] = useState({
                    schema_version: 1,
                    floors: [],
                    zones: [],
                    objects: [],
                }),
                [floor, setFloor] = useState(null);
            current = value;
            return (
                <BuildingEditor
                    layout={value}
                    floorId={floor}
                    onFloorChange={setFloor}
                    onChange={setValue}
                />
            );
        }
        const { host } = await render(<Harness />);
        const add = [...host.querySelectorAll('button')].find(
            (button) => button.textContent === 'Thêm tầng theo kích thước',
        );
        expect(add.disabled).toBe(true);
        await fill(host, 'Tên tầng mới', 'Tầng 2');
        await fill(host, 'Chiều rộng (m)', 12);
        await fill(host, 'Chiều sâu (m)', 8);
        await fill(host, 'Độ dày sàn (m)', 0.3);
        await click(host, 'Thêm tầng theo kích thước');
        expect(current.floors[0].polygon).toEqual([
            [0, 0],
            [12, 0],
            [12, 8],
            [0, 8],
        ]);
        await fill(host, 'Tên tầng', 'Tầng lửng');
        await fill(host, 'Cao độ (m)', 3);
        await check(host, 'Đã xác minh kích thước tầng');
        expect(current.floors[0]).toMatchObject({
            name: 'Tầng lửng',
            elevation: 3,
            verified: true,
        });
        await fill(host, 'Chiều rộng hình chữ nhật', 9);
        await fill(host, 'Chiều sâu hình chữ nhật', 6);
        await click(host, 'Dùng hình chữ nhật');
        await fill(host, 'Đỉnh 1 · X', 1);
        await fill(host, 'Đỉnh 1 · Z', 2);
        await click(host, 'Thêm đỉnh');
        await click(host, 'Xóa đỉnh 5');
        expect(current.floors[0].polygon[0]).toEqual([1, 2]);
    });
    it('adds, edits and deletes zones and confirms floor cascade', async () => {
        let current;
        function Harness() {
            const [value, setValue] = useState(layout),
                [floor, setFloor] = useState('f1');
            current = value;
            return (
                <BuildingEditor
                    layout={value}
                    floorId={floor}
                    onFloorChange={setFloor}
                    onChange={setValue}
                />
            );
        }
        const { host } = await render(<Harness />);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await click(host, 'Thêm khu vực theo biên tầng');
        await fill(host, 'Tên khu vực', 'Kho');
        expect(current.zones[0].name).toBe('Kho');
        expect(layout.zones).toEqual([]);
        await click(host, 'Xóa khu vực');
        expect(current.zones).toEqual([]);
        await click(host, 'Xóa tầng');
        expect(current.objects).toEqual([]);
        expect(current.floors).toEqual([]);
    });
});

describe('object editor and GLB upload', () => {
    it('edits position, radians, dimensions and verification then removes local object only', async () => {
        let current;
        function Harness() {
            const [value, setValue] = useState(layout),
                [selected, setSelected] = useState('m1');
            current = value;
            return (
                <ObjectEditor
                    layout={value}
                    onChange={setValue}
                    stations={[station]}
                    assets={[{ id: 8, name: 'Máy GLB' }]}
                    floorId="f1"
                    selectedId={selected}
                    onSelect={setSelected}
                />
            );
        }
        const { host } = await render(<Harness />);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await fill(host, 'Nhãn', 'Máy A');
        await fill(host, 'X', 4);
        await fill(host, 'Y °', 90);
        await fill(host, 'Rộng (m)', 3);
        await fill(host, 'Mô hình máy', 8);
        await check(host, 'Đã xác minh vị trí');
        await check(host, 'Đã xác minh hình dáng');
        expect(current.objects[0]).toMatchObject({
            label: 'Máy A',
            position: { x: 4, y: 0, z: 1 },
            rotation: { x: 0, y: Math.PI / 2, z: 0 },
            dimensions: { width: 3, height: 2, depth: 2 },
            asset_id: 8,
            verified_position: true,
            verified_geometry: true,
        });
        expect(machine.position.x).toBe(1);
        await click(host, 'Xóa khỏi mặt bằng');
        expect(current.objects).toEqual([]);
    });
    it('adds only unplaced inventory machines and requires explicit dimensions', async () => {
        let current;
        function Harness() {
            const [value, setValue] = useState({ ...layout, objects: [] }),
                [selected, setSelected] = useState(null);
            current = value;
            return (
                <ObjectEditor
                    layout={value}
                    onChange={setValue}
                    stations={[station]}
                    assets={[]}
                    floorId="f1"
                    selectedId={selected}
                    onSelect={setSelected}
                />
            );
        }
        const { host } = await render(<Harness />);
        await fill(host, 'Máy chưa bố trí', 1);
        await fill(host, 'Rộng (m)', 2);
        await fill(host, 'Cao (m)', 3);
        await fill(host, 'Sâu (m)', 4);
        await click(host, 'Thêm đối tượng vào tầng');
        expect(current.objects[0]).toMatchObject({
            workstation_id: 1,
            verified_position: false,
            verified_geometry: false,
        });
    });
    it('adds structural object without workstation and supports floor/zone changes', async () => {
        let current;
        function Harness() {
            const [value, setValue] = useState({
                    ...layout,
                    objects: [],
                    zones: [
                        {
                            id: 'z1',
                            name: 'Khu A',
                            floor_id: 'f1',
                            polygon: [
                                [0, 0],
                                [1, 0],
                                [1, 1],
                            ],
                        },
                    ],
                }),
                [selected, setSelected] = useState(null);
            current = value;
            return (
                <ObjectEditor
                    layout={value}
                    onChange={setValue}
                    stations={[station]}
                    assets={[]}
                    floorId="f1"
                    selectedId={selected}
                    onSelect={setSelected}
                />
            );
        }
        const { host } = await render(<Harness />);
        await fill(host, 'Loại đối tượng', 'wall');
        await fill(host, 'Nhãn đối tượng', 'Tường bắc');
        await fill(host, 'Rộng (m)', 5);
        await fill(host, 'Cao (m)', 3);
        await fill(host, 'Sâu (m)', 0.2);
        await click(host, 'Thêm đối tượng vào tầng');
        await fill(host, 'Khu vực', 'z1');
        expect(current.objects[0]).toMatchObject({
            kind: 'wall',
            workstation_id: null,
            zone_id: 'z1',
        });
        await fill(host, 'Tầng', 'f1');
        expect(current.objects[0].zone_id).toBeNull();
    });
    it('rejects invalid extension locally and uploads valid file with server errors visible', async () => {
        const api = vi
                .fn()
                .mockRejectedValueOnce(new Error('Mô hình lỗi'))
                .mockResolvedValueOnce({ id: 4, name: 'valid.glb' }),
            uploaded = vi.fn();
        const { host } = await render(
            <AssetUpload api={api} factoryId={1} onUploaded={uploaded} />,
        );
        await click(host, 'Tải mô hình GLB');
        const input = host.querySelector('input[type=file]');
        async function file(name) {
            await act(async () => {
                Object.defineProperty(input, 'files', {
                    value: [new File(['binary'], name)],
                    configurable: true,
                });
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        await file('bad.obj');
        expect(host.textContent).toContain('Chỉ nhận GLB');
        expect(api).not.toHaveBeenCalled();
        await file('a.glb');
        expect(host.textContent).toContain('Mô hình lỗi');
        await file('b.glb');
        expect(uploaded).toHaveBeenCalledWith({ id: 4, name: 'valid.glb' });
    });
    it('ignores pending asset response after switching factory', async () => {
        let resolve;
        const api = vi.fn(
                () =>
                    new Promise((done) => {
                        resolve = done;
                    }),
            ),
            uploaded = vi.fn();
        const screen = await render(<AssetUpload api={api} factoryId={1} onUploaded={uploaded} />);
        await act(async () => {
            const input = screen.host.querySelector('input');
            Object.defineProperty(input, 'files', {
                value: [new File(['x'], 'a.glb')],
                configurable: true,
            });
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await screen.render(<AssetUpload api={api} factoryId={2} onUploaded={uploaded} />);
        await act(async () => resolve({ id: 9 }));
        expect(uploaded).not.toHaveBeenCalled();
        expect(api.mock.calls[0][1].signal.aborted).toBe(true);
    });
});

describe('factory configuration', () => {
    it('creates factory with selected lines and members, separate editor permission', async () => {
        const api = mockApi(),
            onSaved = vi.fn(),
            onClose = vi.fn();
        const { host } = await render(
            <FactoryAdmin api={api} catalog={catalog} onSaved={onSaved} onClose={onClose} />,
        );
        await fill(host, 'Mã nhà xưởng', 'NEW');
        await fill(host, 'Tên nhà xưởng', 'Xưởng mới');
        await fill(host, 'Múi giờ IANA', 'Asia/Tokyo');
        await check(host, 'Đang hoạt động');
        await check(host, 'L2 · Cắt');
        await check(host, 'Quản lý');
        await check(host, 'Chỉnh mặt bằng');
        await click(host, 'Lưu cấu hình');
        expect(api.mock.calls[0]).toEqual([
            '/factories',
            {
                method: 'POST',
                body: {
                    code: 'NEW',
                    name: 'Xưởng mới',
                    timezone: 'Asia/Tokyo',
                    is_active: false,
                    line_ids: [2],
                },
            },
        ]);
        expect(api.mock.calls[1][1].body.members).toEqual([{ user_id: 5, can_edit_layout: true }]);
        expect(onSaved).toHaveBeenCalledWith(factory, true);
        expect(onClose).toHaveBeenCalled();
    });
    it('loads members and retains failed changes; close asks to discard', async () => {
        const api = mockApi({
                '/factories/1/members': () => ({
                    members: [{ user_id: 5, can_edit_layout: true }],
                }),
                '/factories/1': () => {
                    throw new Error('Không lưu được');
                },
            }),
            close = vi.fn();
        const { host } = await render(
            <FactoryAdmin
                api={api}
                catalog={catalog}
                factory={factory}
                onSaved={vi.fn()}
                onClose={close}
            />,
        );
        await check(host, 'Quản lý');
        await fill(host, 'Tên nhà xưởng', 'Tên sửa');
        await click(host, 'Lưu cấu hình');
        expect(host.textContent).toContain('Không lưu được');
        expect(field(host, 'Tên nhà xưởng').value).toBe('Tên sửa');
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        await click(host, 'Hủy');
        expect(close).not.toHaveBeenCalled();
        window.confirm.mockReturnValue(true);
        await click(host, 'Hủy');
        expect(close).toHaveBeenCalled();
    });
    it('retries partial creation with PATCH rather than creating duplicate factories', async () => {
        let memberCalls = 0;
        const api = mockApi({
                '/factories/1/members': () => {
                    if (!memberCalls++) throw new Error('Quyền lỗi');
                    return { members: [] };
                },
            }),
            saved = vi.fn();
        const { host } = await render(
            <FactoryAdmin api={api} catalog={catalog} onSaved={saved} onClose={vi.fn()} />,
        );
        await fill(host, 'Mã nhà xưởng', 'F2');
        await fill(host, 'Tên nhà xưởng', 'Mới');
        await click(host, 'Lưu cấu hình');
        expect(host.textContent).toContain('phân quyền chưa lưu');
        await click(host, 'Lưu cấu hình');
        expect(api.mock.calls.filter((call) => call[0] === '/factories')).toHaveLength(1);
        expect(
            api.mock.calls.some((call) => call[0] === '/factories/1' && call[1].method === 'PATCH'),
        ).toBe(true);
    });
});

import React, { useState } from 'react';
import { Button, InlineAlert, TextField } from '@openmes/ui';
import { CheckField, NumberField, SelectField } from './Fields';
import PolygonField from './PolygonField';
import { addEntity, entityId, removeEntity, updateEntity } from '../lib/layout';

function NewFloor({ onAdd }) {
    const [form, setForm] = useState({
        name: '',
        width: NaN,
        depth: NaN,
        elevation: 0,
        thickness: NaN,
    });
    const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const add = () => {
        onAdd({
            id: entityId('floor'),
            name: form.name.trim(),
            elevation: form.elevation,
            thickness: form.thickness,
            polygon: [
                [0, 0],
                [form.width, 0],
                [form.width, form.depth],
                [0, form.depth],
            ],
            verified: false,
        });
        setForm({ name: '', width: NaN, depth: NaN, elevation: 0, thickness: NaN });
    };
    return (
        <div className="fm3d-stack">
            <TextField
                label="Tên tầng mới"
                value={form.name}
                onChange={(value) => change('name', value)}
            />
            <div className="fm3d-grid2">
                {[
                    ['width', 'Chiều rộng (m)'],
                    ['depth', 'Chiều sâu (m)'],
                    ['elevation', 'Cao độ (m)'],
                    ['thickness', 'Độ dày sàn (m)'],
                ].map(([key, label]) => (
                    <NumberField
                        key={key}
                        label={label}
                        value={form[key]}
                        onChange={(value) => change(key, value)}
                    />
                ))}
            </div>
            <Button
                variant="secondary"
                disabled={
                    !form.name.trim() ||
                    !(
                        form.width > 0 &&
                        form.depth > 0 &&
                        form.thickness > 0 &&
                        Number.isFinite(form.elevation)
                    )
                }
                onClick={add}
            >
                Thêm tầng theo kích thước
            </Button>
        </div>
    );
}

export default function BuildingEditor({ layout, onChange, floorId, onFloorChange }) {
    const [zoneId, setZoneId] = useState('');
    const floor = layout.floors.find((item) => item.id === floorId);
    const zones = layout.zones.filter((item) => item.floor_id === floorId);
    const zone = zones.find((item) => item.id === zoneId);
    const updateFloor = (changes) => onChange(updateEntity(layout, 'floors', floor.id, changes));
    const updateZone = (changes) => onChange(updateEntity(layout, 'zones', zone.id, changes));
    return (
        <div className="fm3d-stack">
            <details open={!layout.floors.length}>
                <summary>Tạo tầng</summary>
                <NewFloor
                    onAdd={(item) => {
                        onChange(addEntity(layout, 'floors', item));
                        onFloorChange(item.id);
                    }}
                />
            </details>
            {!floor ? (
                <InlineAlert severity="info" title="Chọn một tầng để chỉnh sửa">
                    Nhập kích thước thực để dựng sàn. Không có mặt bằng mẫu được tự gán.
                </InlineAlert>
            ) : (
                <>
                    <h3>Thông số tầng</h3>
                    <TextField
                        label="Tên tầng"
                        value={floor.name}
                        onChange={(name) => updateFloor({ name })}
                    />
                    <div className="fm3d-grid2">
                        <NumberField
                            label="Cao độ (m)"
                            value={floor.elevation}
                            onChange={(elevation) => updateFloor({ elevation })}
                        />
                        <NumberField
                            label="Độ dày sàn (m)"
                            value={floor.thickness}
                            onChange={(thickness) => updateFloor({ thickness })}
                            min={0.001}
                        />
                    </div>
                    <CheckField
                        label="Đã xác minh kích thước tầng"
                        checked={floor.verified}
                        onChange={(verified) => updateFloor({ verified })}
                    />
                    <PolygonField
                        polygon={floor.polygon}
                        onChange={(polygon) => updateFloor({ polygon })}
                    />
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                            if (
                                window.confirm(
                                    'Xóa tầng và toàn bộ khu vực, vị trí máy trên tầng này?',
                                )
                            ) {
                                onChange(removeEntity(layout, 'floors', floor.id));
                                onFloorChange(null);
                            }
                        }}
                    >
                        Xóa tầng
                    </Button>
                    <h3>Khu vực</h3>
                    <SelectField label="Chọn khu vực" value={zoneId} onChange={setZoneId}>
                        <option value="">Chọn khu vực</option>
                        {zones.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </SelectField>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            const id = entityId('zone');
                            onChange(
                                addEntity(layout, 'zones', {
                                    id,
                                    name: 'Khu vực mới',
                                    floor_id: floor.id,
                                    polygon: floor.polygon.map((point) => [...point]),
                                }),
                            );
                            setZoneId(id);
                        }}
                    >
                        Thêm khu vực theo biên tầng
                    </Button>
                    {zone && (
                        <>
                            <TextField
                                label="Tên khu vực"
                                value={zone.name}
                                onChange={(name) => updateZone({ name })}
                            />
                            <PolygonField
                                polygon={zone.polygon}
                                onChange={(polygon) => updateZone({ polygon })}
                            />
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                    onChange(removeEntity(layout, 'zones', zone.id));
                                    setZoneId('');
                                }}
                            >
                                Xóa khu vực
                            </Button>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

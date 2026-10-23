import React, { useEffect, useRef, useState } from 'react';
import { Button, InlineAlert, TextField } from '@openmes/ui';
import { CheckField, NumberField, SelectField } from './Fields';
import { addEntity, degrees, entityId, radians, removeEntity, updateEntity } from '../lib/layout';
import { errorText } from '../lib/api';

export const kindLabels = { machine: 'Máy/trạm', wall: 'Tường', door: 'Cửa', walkway: 'Lối đi' };

function NewObject({ layout, stations, floorId, onAdd }) {
    const [kind, setKind] = useState('machine'),
        [stationId, setStationId] = useState(''),
        [label, setLabel] = useState('');
    const [dimensions, setDimensions] = useState({ width: NaN, height: NaN, depth: NaN });
    const available = stations.filter(
        (station) =>
            !layout.objects.some(
                (item) => item.kind === 'machine' && item.workstation_id === station.id,
            ),
    );
    const add = () => {
        const station = available.find((item) => String(item.id) === stationId);
        onAdd({
            id: entityId('object'),
            kind,
            label:
                label.trim() ||
                `${station?.code || ''} ${station?.name || kindLabels[kind]}`.trim(),
            floor_id: floorId,
            zone_id: null,
            workstation_id: kind === 'machine' ? station.id : null,
            asset_id: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { ...dimensions },
            verified_position: false,
            verified_geometry: false,
        });
        setStationId('');
        setLabel('');
        setDimensions({ width: NaN, height: NaN, depth: NaN });
    };
    return (
        <div className="fm3d-stack">
            <SelectField label="Loại đối tượng" value={kind} onChange={setKind}>
                {Object.entries(kindLabels).map(([value, name]) => (
                    <option key={value} value={value}>
                        {name}
                    </option>
                ))}
            </SelectField>
            {kind === 'machine' && (
                <SelectField label="Máy chưa bố trí" value={stationId} onChange={setStationId}>
                    <option value="">Chọn máy thuộc xưởng</option>
                    {available.map((station) => (
                        <option key={station.id} value={station.id}>
                            {station.code} · {station.name}
                        </option>
                    ))}
                </SelectField>
            )}
            <TextField
                label="Nhãn đối tượng"
                value={label}
                onChange={setLabel}
                hint="Máy sẽ dùng tên trong MES nếu bỏ trống."
            />
            <div className="fm3d-grid3">
                {[
                    ['width', 'Rộng (m)'],
                    ['height', 'Cao (m)'],
                    ['depth', 'Sâu (m)'],
                ].map(([key, name]) => (
                    <NumberField
                        key={key}
                        label={name}
                        value={dimensions[key]}
                        min={0.001}
                        onChange={(value) =>
                            setDimensions((current) => ({ ...current, [key]: value }))
                        }
                    />
                ))}
            </div>
            <p className="fm3d-muted">
                Vị trí ban đầu là gốc tầng (0, 0, 0), chưa xác minh. Điều chỉnh theo mặt bằng thực
                sau khi thêm.
            </p>
            <Button
                variant="secondary"
                onClick={add}
                disabled={
                    !floorId ||
                    !Object.values(dimensions).every(
                        (value) => Number.isFinite(value) && value > 0,
                    ) ||
                    (kind === 'machine' ? !stationId : !label.trim())
                }
            >
                Thêm đối tượng vào tầng
            </Button>
        </div>
    );
}

export function AssetUpload({ api, factoryId, onUploaded, disabled }) {
    const input = useRef(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(null);
    const pending = useRef(null),
        generation = useRef(0),
        scope = useRef(factoryId);
    scope.current = factoryId;
    useEffect(() => {
        generation.current += 1;
        setBusy(false);
        setError(null);
        return () => {
            generation.current += 1;
            pending.current?.abort();
        };
    }, [factoryId]);
    async function upload(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.glb')) {
            setError(new Error('Chỉ nhận GLB tối đa 20 MiB.'));
            event.target.value = '';
            return;
        }
        setBusy(true);
        setError(null);
        const current = generation.current,
            currentFactory = factoryId,
            controller = new AbortController();
        pending.current = controller;
        try {
            const body = new FormData();
            body.append('model', file);
            const asset = await api(`/factories/${factoryId}/assets`, {
                method: 'POST',
                body,
                signal: controller.signal,
            });
            if (
                current === generation.current &&
                scope.current === currentFactory &&
                !controller.signal.aborted
            )
                onUploaded(asset);
        } catch (problem) {
            if (current === generation.current && !controller.signal.aborted) setError(problem);
        } finally {
            if (current === generation.current) {
                setBusy(false);
                if (input.current) input.current.value = '';
            }
        }
    }
    return (
        <div className="fm3d-stack">
            <input
                ref={input}
                className="fm3d-hidden"
                aria-label="Tệp mô hình GLB"
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={upload}
                disabled={busy || disabled}
            />
            <Button
                variant="ghost"
                loading={busy}
                disabled={disabled}
                onClick={() => input.current?.click()}
            >
                Tải mô hình GLB
            </Button>
            <p className="fm3d-muted">
                Tự chứa tài nguyên; tối đa 20 MiB, 250.000 tam giác, texture 4.096 px. Không hỗ trợ
                Draco/KTX2.
            </p>
            {error && (
                <InlineAlert severity="error" title="Không thể tải mô hình">
                    {errorText(error)}
                </InlineAlert>
            )}
        </div>
    );
}

export default function ObjectEditor({
    layout,
    stations,
    assets,
    floorId,
    selectedId,
    onSelect,
    onChange,
}) {
    const object = layout.objects.find((item) => item.id === selectedId);
    const update = (changes) => onChange(updateEntity(layout, 'objects', object.id, changes));
    return (
        <div className="fm3d-stack">
            <details open={!object}>
                <summary>Thêm máy / kết cấu</summary>
                <NewObject
                    layout={layout}
                    stations={stations}
                    floorId={floorId}
                    onAdd={(item) => {
                        onChange(addEntity(layout, 'objects', item));
                        onSelect(item.id);
                    }}
                />
            </details>
            {!object ? (
                <p className="fm3d-muted">
                    Chọn đối tượng trên cảnh hoặc danh sách để nhập tọa độ chính xác.
                </p>
            ) : (
                <>
                    <h3>
                        {kindLabels[object.kind]} · {object.label}
                    </h3>
                    <TextField
                        label="Nhãn"
                        value={object.label}
                        onChange={(label) => update({ label })}
                    />
                    <SelectField
                        label="Tầng"
                        value={object.floor_id}
                        onChange={(id) => update({ floor_id: id, zone_id: null })}
                    >
                        {layout.floors.map((floor) => (
                            <option key={floor.id} value={floor.id}>
                                {floor.name}
                            </option>
                        ))}
                    </SelectField>
                    <SelectField
                        label="Khu vực"
                        value={object.zone_id || ''}
                        onChange={(zone_id) => update({ zone_id: zone_id || null })}
                    >
                        <option value="">Không phân khu</option>
                        {layout.zones
                            .filter((zone) => zone.floor_id === object.floor_id)
                            .map((zone) => (
                                <option key={zone.id} value={zone.id}>
                                    {zone.name}
                                </option>
                            ))}
                    </SelectField>
                    <fieldset className="fm3d-fieldset">
                        <legend>Vị trí tương đối tầng (m)</legend>
                        <div className="fm3d-grid3">
                            {['x', 'y', 'z'].map((key) => (
                                <NumberField
                                    key={key}
                                    label={key.toUpperCase()}
                                    value={object.position[key]}
                                    onChange={(value) =>
                                        update({ position: { ...object.position, [key]: value } })
                                    }
                                />
                            ))}
                        </div>
                    </fieldset>
                    <fieldset className="fm3d-fieldset">
                        <legend>Góc quay (độ)</legend>
                        <div className="fm3d-grid3">
                            {['x', 'y', 'z'].map((key) => (
                                <NumberField
                                    key={key}
                                    label={`${key.toUpperCase()} °`}
                                    value={Math.round(degrees(object.rotation[key]) * 1000) / 1000}
                                    onChange={(value) =>
                                        update({
                                            rotation: { ...object.rotation, [key]: radians(value) },
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </fieldset>
                    <div className="fm3d-grid3">
                        {[
                            ['width', 'Rộng (m)'],
                            ['height', 'Cao (m)'],
                            ['depth', 'Sâu (m)'],
                        ].map(([key, label]) => (
                            <NumberField
                                key={key}
                                label={label}
                                value={object.dimensions[key]}
                                onChange={(value) =>
                                    update({ dimensions: { ...object.dimensions, [key]: value } })
                                }
                                min={0.001}
                            />
                        ))}
                    </div>
                    {object.kind === 'machine' && (
                        <SelectField
                            label="Mô hình máy"
                            value={object.asset_id || ''}
                            onChange={(value) => update({ asset_id: value ? Number(value) : null })}
                        >
                            <option value="">Khối thay thế · chưa có GLB</option>
                            {assets.map((asset) => (
                                <option key={asset.id} value={asset.id}>
                                    {asset.name}
                                </option>
                            ))}
                        </SelectField>
                    )}
                    <CheckField
                        label="Đã xác minh vị trí và kích thước"
                        checked={object.verified_position}
                        onChange={(verified_position) => update({ verified_position })}
                    />
                    <CheckField
                        label="Đã xác minh hình dáng mô hình"
                        checked={object.verified_geometry}
                        onChange={(verified_geometry) => update({ verified_geometry })}
                    />
                    {!object.verified_position && (
                        <p className="fm3d-muted">
                            Chưa xác minh vị trí / kích thước theo thực tế.
                        </p>
                    )}
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                            if (
                                window.confirm(
                                    'Xóa đối tượng khỏi mặt bằng? Dữ liệu máy trong MES được giữ nguyên.',
                                )
                            ) {
                                onChange(removeEntity(layout, 'objects', object.id));
                                onSelect(null);
                            }
                        }}
                    >
                        Xóa khỏi mặt bằng
                    </Button>
                </>
            )}
        </div>
    );
}

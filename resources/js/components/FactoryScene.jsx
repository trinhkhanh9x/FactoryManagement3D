import React, { useEffect, useRef, useState } from 'react';
import { createFactoryRenderer } from '../lib/renderer.mjs';
import { stationState } from '../lib/theme.mjs';
import { visibleObjects } from '../lib/sceneGeometry.mjs';

export default function FactoryScene({
    layout,
    stations = [],
    assets = [],
    selectedId,
    onSelect,
    onMove,
    editable = false,
    floorId = null,
    viewMode = 'perspective',
    focusId = null,
    onError,
    resetKey = 0,
    snap = 0.1,
    showStructure = true,
}) {
    const host = useRef(null),
        engine = useRef(null),
        latest = useRef({ onSelect, onMove, onError });
    latest.current = { onSelect, onMove, onError };
    const [error, setError] = useState(null),
        [failed, setFailed] = useState(false);
    useEffect(() => {
        try {
            engine.current = createFactoryRenderer(host.current, {
                onSelect: (id) => latest.current.onSelect?.(id),
                onMove: (id, position) => latest.current.onMove?.(id, position),
                onError: (message) => {
                    setError(message);
                    latest.current.onError?.(message);
                },
            });
        } catch (reason) {
            setFailed(true);
            setError(reason.message);
            latest.current.onError?.(reason.message);
        }
        return () => {
            engine.current?.dispose();
            engine.current = null;
        };
    }, []);
    useEffect(() => {
        if (!engine.current || !layout) return;
        try {
            engine.current.update({
                layout,
                stations,
                assets,
                selectedId,
                editable,
                floorId,
                viewMode,
                focusId,
                resetKey,
                snap,
                showStructure,
            });
        } catch (reason) {
            setError(reason.message);
            latest.current.onError?.(reason.message);
        }
    }, [
        layout,
        stations,
        assets,
        selectedId,
        editable,
        floorId,
        viewMode,
        focusId,
        resetKey,
        snap,
        showStructure,
    ]);
    const stationMap = new Map(stations.map((station) => [String(station.id), station]));
    const objects = visibleObjects(layout, floorId, showStructure);
    return (
        <div ref={host} className="fm3d-scene" aria-label="Mặt bằng nhà xưởng 3D">
            {error && (
                <div className="fm3d-scene-fallback" role="status">
                    {error}
                </div>
            )}
            {!failed && (
                <div
                    className="fm3d-scene-labels"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                    }}
                >
                    {objects.map((object) => {
                        const state = stationState(
                            stationMap.get(String(object.workstation_id))?.state,
                        );
                        const asset = assets.find(
                            (item) => String(item.id) === String(object.asset_id),
                        );
                        return (
                            <button
                                key={object.id}
                                type="button"
                                className={`fm3d-scene-label${selectedId === object.id ? ' fm3d-scene-label-selected' : ''}`}
                                data-scene-label={object.id}
                                onClick={() => onSelect?.(object.id)}
                                aria-pressed={selectedId === object.id}
                                style={{
                                    position: 'absolute',
                                    transform: 'translate(-50%,-100%)',
                                    pointerEvents: 'auto',
                                    maxWidth: 220,
                                    borderStyle:
                                        object.kind === 'machine' && state.pattern
                                            ? 'dashed'
                                            : 'solid',
                                }}
                            >
                                <span>{object.label || object.id}</span>
                                {object.kind === 'machine' && (
                                    <small
                                        style={{
                                            display: 'block',
                                            color: 'var(--om-ink)',
                                        }}
                                    >
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                display: 'inline-block',
                                                width: 8,
                                                height: 8,
                                                marginRight: 4,
                                                borderRadius: '50%',
                                                backgroundColor: `var(${state.token})`,
                                            }}
                                        />
                                        {state.label}
                                    </small>
                                )}
                                {(!object.verified_position || !object.verified_geometry) && (
                                    <small style={{ display: 'block' }}>Chưa xác minh</small>
                                )}
                                {object.kind === 'machine' && !asset && (
                                    <small style={{ display: 'block' }}>Chưa có mô hình</small>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
            {!layout?.floors?.length && !error && (
                <p className="fm3d-scene-fallback">
                    Chưa có mặt bằng. Thêm tầng và bố trí máy để xem 3D.
                </p>
            )}
        </div>
    );
}

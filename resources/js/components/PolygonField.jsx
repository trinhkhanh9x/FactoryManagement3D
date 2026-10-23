import React, { useState } from 'react';
import { Button } from '@openmes/ui';
import { NumberField } from './Fields';

export default function PolygonField({ polygon, onChange, label = 'Đỉnh đa giác (X, Z · m)' }) {
    const [width, setWidth] = useState(NaN),
        [depth, setDepth] = useState(NaN);
    return (
        <fieldset className="fm3d-fieldset">
            <legend>{label}</legend>
            <div className="fm3d-grid2">
                <NumberField
                    label="Chiều rộng hình chữ nhật (m)"
                    value={width}
                    onChange={setWidth}
                    min={0.01}
                />
                <NumberField
                    label="Chiều sâu hình chữ nhật (m)"
                    value={depth}
                    onChange={setDepth}
                    min={0.01}
                />
            </div>
            <Button
                variant="ghost"
                size="sm"
                disabled={!(width > 0 && depth > 0)}
                onClick={() =>
                    onChange([
                        [0, 0],
                        [width, 0],
                        [width, depth],
                        [0, depth],
                    ])
                }
            >
                Dùng hình chữ nhật
            </Button>
            {polygon.map((point, index) => (
                <div className="fm3d-polygon-row" key={index}>
                    <NumberField
                        label={`Đỉnh ${index + 1} · X`}
                        value={point[0]}
                        onChange={(value) =>
                            onChange(polygon.map((p, i) => (i === index ? [value, p[1]] : p)))
                        }
                    />
                    <NumberField
                        label={`Đỉnh ${index + 1} · Z`}
                        value={point[1]}
                        onChange={(value) =>
                            onChange(polygon.map((p, i) => (i === index ? [p[0], value] : p)))
                        }
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Xóa đỉnh ${index + 1}`}
                        disabled={polygon.length <= 3}
                        onClick={() => onChange(polygon.filter((_, i) => i !== index))}
                    >
                        Xóa
                    </Button>
                </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => onChange([...polygon, [0, 0]])}>
                Thêm đỉnh
            </Button>
            <p className="fm3d-muted">
                Ít nhất 3 đỉnh, lần lượt theo đường biên. Máy chủ kiểm tra đa giác trước khi lưu.
            </p>
        </fieldset>
    );
}

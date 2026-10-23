import React, { useId } from 'react';
import { Checkbox, TextField } from '@openmes/ui';

export function SelectField({ label, value, onChange, children, disabled = false, ...props }) {
    const id = useId();
    return (
        <label className="fm3d-field" htmlFor={id}>
            <span>{label}</span>
            <select
                id={id}
                value={value ?? ''}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                {...props}
            >
                {children}
            </select>
        </label>
    );
}

export function CheckField({ label, checked, onChange, disabled = false }) {
    return (
        <Checkbox
            className="fm3d-check"
            label={label}
            checked={Boolean(checked)}
            onChange={onChange}
            disabled={disabled}
        />
    );
}

export function NumberField({ label, value, onChange, min, step = 'any', ...props }) {
    return (
        <TextField
            label={label}
            mono
            type="number"
            step={step}
            min={min}
            value={Number.isFinite(value) ? value : ''}
            onChange={(input) => onChange(input === '' ? NaN : Number(input))}
            {...props}
        />
    );
}

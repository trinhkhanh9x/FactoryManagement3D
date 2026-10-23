import React from 'react';
export function Icon({ name }) {
    return <span aria-hidden="true" data-icon={name} />;
}
export function Button({
    children,
    loading,
    leftIcon,
    rightIcon,
    variant: _variant,
    size: _size,
    ...props
}) {
    return (
        <button {...props} disabled={props.disabled || loading}>
            {leftIcon}
            {children}
            {rightIcon}
        </button>
    );
}
export function TextField({
    label,
    onChange,
    error,
    hint,
    mono: _mono,
    labelHint: _labelHint,
    suffix: _suffix,
    multiline,
    ...props
}) {
    const Field = multiline ? 'textarea' : 'input';
    return (
        <label>
            {label}
            <Field {...props} onChange={(event) => onChange?.(event.target.value)} />
            {error && <span role="alert">{error}</span>}
            {hint}
        </label>
    );
}
export function StatusBadge({ label }) {
    return <span>{label}</span>;
}
export function InlineAlert({ children, message, title }) {
    return (
        <div role="alert">
            {title}
            {message}
            {children}
        </div>
    );
}
export function ProgressBar({ value = 0 }) {
    return <progress value={value} max="100" />;
}
export function Skeleton() {
    return <span>Đang tải…</span>;
}
export function Modal({ open, children, title, footer, onClose, closeLabel = 'Đóng' }) {
    return open ? (
        <section role="dialog" aria-label={title}>
            <h2>{title}</h2>
            {children}
            {footer}
            <button type="button" aria-label={closeLabel} onClick={onClose}>
                {closeLabel}
            </button>
        </section>
    ) : null;
}
export function Checkbox({ label, checked, onChange, disabled, className }) {
    return (
        <label className={className}>
            <input
                type="checkbox"
                checked={!!checked}
                disabled={disabled}
                onChange={(event) => onChange?.(event.target.checked)}
            />
            {label}
        </label>
    );
}
export function Tabs({ children }) {
    return <div>{children}</div>;
}
export function Toast({ message }) {
    return <div role="status">{message}</div>;
}

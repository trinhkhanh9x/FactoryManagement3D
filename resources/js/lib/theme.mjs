const states = {
    RUNNING: ['--om-running', 'Đang chạy'],
    STOPPED: ['--om-blocked', 'Đã dừng'],
    FAULT: ['--om-blocked', 'Lỗi máy'],
    WAITING: ['--om-blocked', 'Đang chờ'],
    SETUP: ['--om-maint', 'Gá đặt'],
    CLEANING: ['--om-planned', 'Vệ sinh'],
    MAINTENANCE: ['--om-planned', 'Bảo trì'],
    IDLE: ['--om-muted', 'Nhàn rỗi'],
    UNKNOWN: ['--om-muted', 'Chưa có dữ liệu'],
};
export function stationState(state) {
    const key = Object.hasOwn(states, state) ? state : 'UNKNOWN';
    return {
        token: states[key][0],
        label: states[key][1],
        pattern: key === 'UNKNOWN',
    };
}
export function readSceneTheme(style) {
    const value = (token) => style.getPropertyValue(token).trim();
    return {
        background: value('--om-bg'),
        floor: value('--om-panel'),
        line: value('--om-line'),
        muted: value('--om-muted'),
        accent: value('--om-accent'),
        ink: value('--om-ink'),
        ...Object.fromEntries(
            [...new Set(Object.values(states).map(([token]) => token))].map((token) => [
                token,
                value(token),
            ]),
        ),
    };
}
export function observeSceneTheme(onChange, doc = document, Observer = MutationObserver) {
    const observer = new Observer(onChange);
    const options = {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'],
    };
    observer.observe(doc.documentElement, options);
    if (doc.body) observer.observe(doc.body, options);
    doc.addEventListener('themechange', onChange);
    const media = doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', onChange);
    return () => {
        observer.disconnect();
        doc.removeEventListener('themechange', onChange);
        media?.removeEventListener?.('change', onChange);
    };
}

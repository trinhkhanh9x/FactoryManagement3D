export class ApiError extends Error {
    constructor(message, status = 0, errors = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = errors;
    }
}

export function safeLocalUrl(value) {
    return typeof value === 'string' &&
        /^\/(?!\/)/.test(value) &&
        !Array.from(value).some((char) => char === '\\' || char.charCodeAt(0) < 32)
        ? value
        : null;
}

export function createApi(basePath, csrfToken) {
    const base = basePath.replace(/\/$/, '');
    return async (path, { method = 'GET', body, signal } = {}) => {
        const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
        const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
        if (method !== 'GET') headers['X-CSRF-TOKEN'] = csrfToken;
        if (body != null && !multipart) headers['Content-Type'] = 'application/json';
        const response = await fetch(`${base}${path}`, {
            method,
            headers,
            credentials: 'same-origin',
            signal,
            body: body == null ? undefined : multipart ? body : JSON.stringify(body),
        });
        let payload;
        try {
            payload = await response.json();
        } catch {
            throw new ApiError(
                'Không đọc được phản hồi MES. Hãy kiểm tra phiên đăng nhập.',
                response.status,
            );
        }
        if (!response.ok || payload.success !== true) {
            const message =
                payload.message ||
                (typeof payload.error === 'string' ? payload.error : payload.error?.message);
            throw new ApiError(
                message || 'Không thể thực hiện yêu cầu.',
                response.status,
                payload.errors || {},
            );
        }
        return payload.data;
    };
}

export function errorText(error) {
    const fields = Object.values(error?.errors || {})
        .flat()
        .join(' ');
    return fields
        ? `${error.message} ${fields}`
        : error?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

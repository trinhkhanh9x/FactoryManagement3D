import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, ApiError, safeLocalUrl } from '../../resources/js/lib/api.js';

describe('session scoped API', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('sends CSRF only on writes and preserves CAS/validation errors', async () => {
        const fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 409,
            json: async () => ({
                message: 'Đã thay đổi',
                errors: { expected_version: ['Xung đột'] },
            }),
        });
        vi.stubGlobal('fetch', fetch);
        const api = createApi('/modules/factory-management-3d', 'csrf');
        await expect(
            api('/factories/2/layout/draft', { method: 'PUT', body: { expected_version: 1 } }),
        ).rejects.toMatchObject({ status: 409, errors: { expected_version: ['Xung đột'] } });
        expect(fetch.mock.calls[0][1].headers['X-CSRF-TOKEN']).toBe('csrf');
        expect(fetch.mock.calls[0][1].credentials).toBe('same-origin');
    });
    it('rejects expired HTML sessions and supports multipart without JSON headers', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => {
                    throw new Error('html');
                },
            }),
        );
        const api = createApi('/module', 'x');
        await expect(api('/catalog')).rejects.toBeInstanceOf(ApiError);
        const form = new FormData();
        form.append('model', new Blob(['data']), 'a.glb');
        await expect(api('/assets', { method: 'POST', body: form })).rejects.toBeInstanceOf(
            ApiError,
        );
        expect(fetch.mock.calls[1][1].headers['Content-Type']).toBeUndefined();
    });
    it('only links to local application pages', () => {
        expect(safeLocalUrl('/work-orders/1')).toBe('/work-orders/1');
        expect(safeLocalUrl('javascript:alert(1)')).toBeNull();
        expect(safeLocalUrl('//foreign/x')).toBeNull();
    });
});

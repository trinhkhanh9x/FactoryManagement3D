import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSnapshotPoller } from '../../resources/js/lib/polling.js';

describe('snapshot polling lifecycle', () => {
    afterEach(() => vi.useRealTimers());
    it('never overlaps, preserves scheduling after failure, pauses hidden and aborts on disposal', async () => {
        vi.useFakeTimers();
        let resolve,
            hidden = false,
            visibility;
        const request = vi.fn(
            ({ signal }) =>
                new Promise((r) => {
                    resolve = r;
                    signal.addEventListener('abort', () => r(null));
                }),
        );
        const onData = vi.fn(),
            onError = vi.fn();
        const poll = createSnapshotPoller({
            request,
            onData,
            onError,
            isHidden: () => hidden,
            subscribeVisibility: (fn) => {
                visibility = fn;
                return () => {};
            },
        });
        poll.start();
        await vi.advanceTimersByTimeAsync(30000);
        expect(request).toHaveBeenCalledTimes(1);
        resolve({ factory_id: 1 });
        await vi.advanceTimersByTimeAsync(0);
        expect(onData).toHaveBeenCalledWith({ factory_id: 1 });
        hidden = true;
        visibility();
        await vi.advanceTimersByTimeAsync(50000);
        expect(request).toHaveBeenCalledTimes(1);
        hidden = false;
        visibility();
        expect(request).toHaveBeenCalledTimes(2);
        const signal = request.mock.calls[1][0].signal;
        poll.stop();
        expect(signal.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(50000);
        expect(onData).toHaveBeenCalledTimes(1);
    });
    it('backs off to sixty seconds and recovers without discarding last successful data', async () => {
        vi.useFakeTimers();
        const onData = vi.fn(),
            onError = vi.fn();
        const request = vi
            .fn()
            .mockRejectedValue(new Error('Mạng'))
            .mockResolvedValueOnce({ stations: [1] });
        const poll = createSnapshotPoller({
            request,
            onData,
            onError,
            isHidden: () => false,
            subscribeVisibility: () => () => {},
        });
        poll.start();
        await vi.advanceTimersByTimeAsync(10000);
        expect(onData).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(20000);
        expect(onError).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(40000);
        expect(onError).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(60000);
        expect(onError).toHaveBeenCalledTimes(4);
        poll.stop();
    });
});

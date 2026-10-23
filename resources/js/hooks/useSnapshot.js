import { useEffect, useRef, useState } from 'react';
import { createSnapshotPoller } from '../lib/polling';

export default function useSnapshot(api, factoryId) {
    const [state, setState] = useState({
        factoryId: null,
        data: null,
        error: null,
        lastSuccess: null,
        now: Date.now(),
    });
    const poller = useRef(null);
    useEffect(() => {
        setState({ factoryId, data: null, error: null, lastSuccess: null, now: Date.now() });
        if (!factoryId) return undefined;
        const poll = createSnapshotPoller({
            request: ({ signal }) => api(`/factories/${factoryId}/snapshot`, { signal }),
            onData: (data) =>
                setState({
                    factoryId,
                    data,
                    error: null,
                    lastSuccess: Date.now(),
                    now: Date.now(),
                }),
            onError: (error) => {
                if ([401, 403, 404].includes(error.status)) {
                    setState({ factoryId, data: null, error, lastSuccess: null, now: Date.now() });
                    poll.stop();
                } else setState((current) => ({ ...current, error, now: Date.now() }));
            },
        });
        poller.current = poll;
        poll.start();
        const clock = setInterval(
            () => setState((current) => ({ ...current, now: Date.now() })),
            5000,
        );
        return () => {
            poll.stop();
            clearInterval(clock);
            poller.current = null;
        };
    }, [api, factoryId]);
    const scoped =
        state.factoryId === factoryId
            ? state
            : { factoryId, data: null, error: null, lastSuccess: null, now: Date.now() };
    return {
        ...scoped,
        stale: scoped.lastSuccess != null && scoped.now - scoped.lastSuccess >= 30000,
        refresh: () => poller.current?.refresh(),
    };
}

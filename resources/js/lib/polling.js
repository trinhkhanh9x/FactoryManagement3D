/** One in-flight request; scoped disposal prevents a departed factory from updating UI. */
export function createSnapshotPoller({
    request,
    onData,
    onError,
    interval = 10000,
    isHidden = () => document.hidden,
    subscribeVisibility = (listener) => {
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
    },
}) {
    let stopped = true,
        controller = null,
        timer = null,
        failureCount = 0,
        unsubscribe = null,
        resume = false;
    const clear = () => {
        clearTimeout(timer);
        timer = null;
    };
    const schedule = () => {
        clear();
        if (!stopped && !isHidden())
            timer = setTimeout(tick, Math.min(interval * 2 ** failureCount, 60000));
    };
    async function tick() {
        if (stopped || isHidden() || controller) return;
        const current = new AbortController();
        controller = current;
        try {
            const data = await request({ signal: current.signal });
            if (!stopped && !current.signal.aborted) {
                failureCount = 0;
                onData(data);
            }
        } catch (error) {
            if (!stopped && !current.signal.aborted) {
                failureCount += 1;
                onError(error);
            }
        } finally {
            if (controller === current) controller = null;
            if (resume && !stopped && !isHidden()) {
                resume = false;
                void tick();
            } else schedule();
        }
    }
    const visibilityChanged = () => {
        clear();
        if (isHidden()) controller?.abort();
        else if (controller) resume = true;
        else void tick();
    };
    return {
        start() {
            if (!stopped) return;
            stopped = false;
            unsubscribe = subscribeVisibility(visibilityChanged);
            void tick();
        },
        refresh() {
            clear();
            if (!controller) void tick();
        },
        stop() {
            stopped = true;
            clear();
            controller?.abort();
            unsubscribe?.();
        },
    };
}

import { useEffect, useRef, useState } from 'react';
import { emptyLayout, validateLayout } from '../lib/layout';

export default function useLayoutDraft(api, factoryId, layoutData, onSaved) {
    const [layout, setLayout] = useState(emptyLayout),
        [baseline, setBaseline] = useState(''),
        [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false),
        [error, setError] = useState(null),
        [notice, setNotice] = useState('');
    const [layoutScope, setLayoutScope] = useState(factoryId);
    const generation = useRef(0),
        pending = useRef(null),
        scope = useRef(factoryId);
    scope.current = factoryId;
    useEffect(() => setNotice(''), [factoryId]);
    useEffect(() => {
        generation.current += 1;
        pending.current?.abort();
        setBusy(false);
        const next = layoutData?.layout || emptyLayout();
        setLayoutScope(factoryId);
        setLayout(next);
        setBaseline(JSON.stringify(next));
        setVersion(layoutData?.version ?? 0);
        setError(null);
        return () => {
            generation.current += 1;
            pending.current?.abort();
        };
    }, [factoryId, layoutData]);
    const dirty = baseline !== '' && JSON.stringify(layout) !== baseline;
    const errors = validateLayout(layout);
    async function action(kind) {
        if (busy || !factoryId || !layoutData) return;
        const problems = validateLayout(layout);
        if (problems.length) {
            setError(new Error(problems.join(' ')));
            return;
        }
        setBusy(true);
        setError(null);
        setNotice('');
        const currentGeneration = generation.current;
        const currentFactory = factoryId;
        const controller = new AbortController();
        pending.current = controller;
        try {
            const result = await api(`/factories/${factoryId}/layout/${kind}`, {
                method: kind === 'draft' ? 'PUT' : 'POST',
                signal: controller.signal,
                body:
                    kind === 'draft'
                        ? { expected_version: version, layout }
                        : { expected_version: version },
            });
            if (
                currentGeneration !== generation.current ||
                scope.current !== currentFactory ||
                controller.signal.aborted
            )
                return;
            setLayout(result.layout);
            setBaseline(JSON.stringify(result.layout));
            setVersion(result.version);
            onSaved(result);
            setNotice(
                kind === 'draft'
                    ? 'Đã lưu bản nháp. Người xem chưa thấy thay đổi này.'
                    : 'Đã công bố mặt bằng cho người xem.',
            );
        } catch (problem) {
            if (currentGeneration === generation.current && !controller.signal.aborted)
                setError(problem);
        } finally {
            if (currentGeneration === generation.current) setBusy(false);
        }
    }
    return {
        layout: layoutScope === factoryId ? layout : emptyLayout(),
        setLayout,
        dirty: layoutScope === factoryId && dirty,
        busy,
        error,
        notice,
        version,
        errors,
        save: () => action('draft'),
        publish: () => action('publish'),
    };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyLayout } from '../lib/layout';

export default function useFactoryWorkspace(api, factoryId, editing, publishedRevision = null) {
    const [state, setState] = useState({
        factoryId: null,
        editing: false,
        layoutData: null,
        assets: [],
        errors: {},
        loading: false,
    });
    const [reloadKey, setReloadKey] = useState(0);
    const active = useRef(factoryId);
    active.current = factoryId;
    const desiredRevision = editing ? null : publishedRevision;
    useEffect(() => {
        const controller = new AbortController();
        setState({
            factoryId,
            editing,
            layoutData: null,
            assets: [],
            errors: {},
            loading: Boolean(factoryId),
        });
        if (!factoryId) return () => controller.abort();
        const opts = { signal: controller.signal };
        Promise.allSettled([
            api(`/factories/${factoryId}/layout${editing ? '?draft=1' : ''}`, opts),
            api(`/factories/${factoryId}/assets`, opts),
        ]).then((results) => {
            if (controller.signal.aborted) return;
            const [layoutResult, assetResult] = results;
            setState({
                factoryId,
                editing,
                layoutData: layoutResult.status === 'fulfilled' ? layoutResult.value : null,
                assets: assetResult.status === 'fulfilled' ? assetResult.value.assets : [],
                errors: {
                    layout: layoutResult.status === 'rejected' ? layoutResult.reason : null,
                    assets: assetResult.status === 'rejected' ? assetResult.reason : null,
                },
                loading: false,
            });
        });
        return () => controller.abort();
    }, [api, factoryId, editing, reloadKey, desiredRevision]);
    const applySaved = useCallback(
        (data) => setState((current) => ({ ...current, layoutData: data })),
        [],
    );
    const addAsset = useCallback(
        (asset) =>
            setState((current) => ({
                ...current,
                assets: [...current.assets.filter((item) => item.id !== asset.id), asset],
            })),
        [],
    );
    const scoped =
        state.factoryId === factoryId && state.editing === editing
            ? state
            : { layoutData: null, assets: [], errors: {}, loading: Boolean(factoryId) };
    return {
        ...scoped,
        layout: scoped.layoutData?.layout || emptyLayout(),
        reload: () => setReloadKey((value) => value + 1),
        applySaved,
        addAsset,
        active,
    };
}

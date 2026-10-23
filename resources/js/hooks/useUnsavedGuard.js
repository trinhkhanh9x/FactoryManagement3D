import { useCallback, useEffect } from 'react';
import { router } from '@inertiajs/react';

export default function useUnsavedGuard(dirty) {
    const confirmDiscard = useCallback(
        () => !dirty || window.confirm('Mặt bằng có thay đổi chưa lưu. Bỏ thay đổi và tiếp tục?'),
        [dirty],
    );
    useEffect(() => {
        if (!dirty) return undefined;
        const unload = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', unload);
        const remove = router.on('before', (event) => {
            if (!window.confirm('Mặt bằng có thay đổi chưa lưu. Rời trang và bỏ thay đổi?'))
                event.preventDefault();
        });
        return () => {
            window.removeEventListener('beforeunload', unload);
            remove();
        };
    }, [dirty]);
    return confirmDiscard;
}

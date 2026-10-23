import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
    createGeneration,
    disposeTree,
    floorPosition,
    gridParameters,
    visibleObjects,
} from './sceneGeometry.mjs';
import {
    fitModel,
    modelCache,
    objectGroup,
    polygonMesh,
    replacePlaceholder,
} from './rendererObjects.mjs';
import { observeSceneTheme, readSceneTheme } from './theme.mjs';
import { applySceneTheme, paintMarkers, projectLabels } from './rendererDecorations.mjs';

export function createFactoryRenderer(host, callbacks) {
    const canvas = document.createElement('canvas');
    canvas.className = 'fm3d-scene-canvas';
    const context = canvas.getContext('webgl2', {
        antialias: true,
        alpha: false,
    });
    if (!context)
        throw new Error('Trình duyệt không hỗ trợ WebGL 2. Dùng danh sách máy để xem dữ liệu.');
    const renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.prepend(canvas);
    const scene = new THREE.Scene(),
        content = new THREE.Group();
    scene.add(content);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(20, 30, 10);
    scene.add(light);
    let theme = readSceneTheme(getComputedStyle(host));
    let camera = new THREE.PerspectiveCamera(45, 1, 0.05, 10000);
    camera.position.set(20, 20, 20);
    let orbit,
        transform,
        transformHelper,
        frame = 0,
        disposed = false,
        signature = '',
        data = {},
        objects = new Map(),
        dragged = false;
    let lastView = 'perspective',
        lastFocus = null,
        lastFloor = undefined,
        lastReset = undefined;
    const guard = createGeneration(),
        cache = modelCache(),
        raycaster = new THREE.Raycaster(),
        pointer = new THREE.Vector2();
    let pointerStart = null;
    function invalidate() {
        if (!disposed && !frame) frame = requestAnimationFrame(render);
    }
    function render() {
        frame = 0;
        if (disposed) return;
        renderer.render(scene, camera);
        projectLabels(host, objects, data.layout, camera);
    }
    function themeChanged() {
        theme = readSceneTheme(getComputedStyle(host));
        applySceneTheme(scene, content, objects, theme);
        updateMarkers();
        invalidate();
    }
    function updateMarkers() {
        paintMarkers(objects, data, theme);
    }
    function bindControls(target = new THREE.Vector3()) {
        orbit?.dispose();
        if (transform) {
            scene.remove(transformHelper);
            transform.dispose();
        }
        orbit = new OrbitControls(camera, canvas);
        orbit.target.copy(target);
        orbit.enableDamping = false;
        orbit.addEventListener('change', invalidate);
        orbit.update();
        transform = new TransformControls(camera, canvas);
        transform.setMode('translate');
        transform.showY = false;
        transformHelper = transform.getHelper();
        scene.add(transformHelper);
        transform.addEventListener('change', invalidate);
        transform.addEventListener('dragging-changed', (event) => {
            orbit.enabled = !event.value;
            dragged = dragged || event.value;
        });
        transform.addEventListener('mouseUp', () => {
            const group = transform.object,
                object = data.layout.objects.find((item) => item.id === group?.userData.sceneId);
            if (object && data.editable)
                callbacks.onMove?.(
                    object.id,
                    floorPosition(
                        group.position,
                        data.layout.floors.find((floor) => floor.id === object.floor_id),
                    ),
                );
        });
    }
    function resize() {
        const width = Math.max(host.clientWidth, 1),
            height = Math.max(host.clientHeight, 1);
        renderer.setSize(width, height, false);
        if (camera.isPerspectiveCamera) camera.aspect = width / height;
        else {
            const span = camera.userData.span ?? 20;
            camera.left = (-span * width) / height;
            camera.right = (span * width) / height;
            camera.top = span;
            camera.bottom = -span;
        }
        camera.updateProjectionMatrix();
        invalidate();
    }
    function frameContent(focusId) {
        const targetObject = focusId ? objects.get(focusId) : content;
        if (!targetObject) return;
        const box = new THREE.Box3().setFromObject(targetObject);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3()),
            size = box.getSize(new THREE.Vector3());
        const distance = Math.max(size.x, size.y, size.z, 3) * 1.35;
        orbit.target.copy(center);
        camera.userData.span = distance / 1.5;
        camera.position
            .copy(center)
            .add(
                lastView === 'top'
                    ? new THREE.Vector3(0, distance, 0.001)
                    : new THREE.Vector3(distance, distance, distance),
            );
        camera.far = Math.max(10000, camera.position.distanceTo(center) + size.length() * 0.55);
        camera.lookAt(center);
        orbit.update();
        resize();
    }
    function updateControls() {
        transform.enabled = Boolean(data.editable);
        const target = data.editable ? objects.get(data.selectedId) : undefined;
        if (transform.object !== target) {
            if (target) transform.attach(target);
            else transform.detach();
        }
        transform.setTranslationSnap(data.snap > 0 ? data.snap : null);
        transformHelper.visible = Boolean(target);
    }
    function rebuild() {
        const token = guard.next();
        transform.detach();
        for (const child of [...content.children]) {
            content.remove(child);
            disposeTree(child, { textures: false });
        }
        objects = new Map();
        cache.retain(data.assets ?? []);
        for (const floor of data.layout.floors ?? [])
            if (data.floorId === null || floor.id === data.floorId) {
                const mesh = polygonMesh(
                    floor.polygon,
                    floor.elevation,
                    floor.thickness,
                    theme.floor,
                );
                mesh.userData.floor = true;
                content.add(mesh);
                const bounds = new THREE.Box3().setFromObject(mesh),
                    size = bounds.getSize(new THREE.Vector3()),
                    center = bounds.getCenter(new THREE.Vector3());
                const { span, divisions } = gridParameters(size.x, size.z);
                const grid = new THREE.GridHelper(span, divisions, theme.line, theme.line);
                grid.userData.grid = true;
                grid.material.vertexColors = false;
                grid.material.color.set(theme.line);
                grid.material.transparent = true;
                grid.material.opacity = 0.35;
                grid.position.set(center.x, floor.elevation + 0.01, center.z);
                content.add(grid);
            }
        for (const zone of data.layout.zones ?? [])
            if (data.floorId === null || zone.floor_id === data.floorId) {
                const floor = data.layout.floors.find((item) => item.id === zone.floor_id);
                const mesh = polygonMesh(
                    zone.polygon,
                    (floor?.elevation ?? 0) + 0.005,
                    0.002,
                    theme.line,
                );
                mesh.userData.zone = true;
                mesh.material.transparent = true;
                mesh.material.opacity = 0.3;
                content.add(mesh);
            }
        for (const object of visibleObjects(data.layout, data.floorId, data.showStructure)) {
            const group = objectGroup(object, data.layout.floors, theme);
            objects.set(object.id, group);
            content.add(group);
            const asset = (data.assets ?? []).find(
                (item) => String(item.id) === String(object.asset_id),
            );
            if (asset)
                cache
                    .load(asset)
                    .then((model) => {
                        if (!guard.isCurrent(token)) return;
                        replacePlaceholder(group, fitModel(model, object.dimensions));
                        invalidate();
                    })
                    .catch((error) => {
                        if (guard.isCurrent(token) && error.name !== 'AbortError')
                            callbacks.onError?.(
                                `Không tải được mô hình ${object.label || object.id}. Đang hiển thị khối thay thế.`,
                            );
                    });
        }
        updateMarkers();
        updateControls();
        invalidate();
    }
    function update(next) {
        data = {
            showStructure: true,
            snap: 0.1,
            resetKey: 0,
            ...next,
            floorId: next.floorId ?? null,
        };
        const nextSignature = JSON.stringify([
            data.layout,
            data.assets,
            data.floorId,
            data.showStructure,
        ]);
        const changed = nextSignature !== signature;
        if (changed) {
            signature = nextSignature;
            rebuild();
        }
        if (data.viewMode !== lastView) {
            lastView = data.viewMode;
            const previousTarget = orbit.target.clone();
            camera =
                lastView === 'top'
                    ? new THREE.OrthographicCamera(-20, 20, 20, -20, 0.05, 10000)
                    : new THREE.PerspectiveCamera(45, 1, 0.05, 10000);
            bindControls(previousTarget);
            updateControls();
            frameContent(data.focusId);
        }
        if (lastFloor !== data.floorId) {
            lastFloor = data.floorId;
            frameContent(null);
        }
        if (data.focusId !== lastFocus) {
            lastFocus = data.focusId;
            if (data.focusId) frameContent(data.focusId);
        }
        updateControls();
        if (data.resetKey !== lastReset) {
            lastReset = data.resetKey;
            frameContent(null);
        }
        updateMarkers();
        invalidate();
    }
    function pointerDown(event) {
        pointerStart = { x: event.clientX, y: event.clientY };
        dragged = false;
    }
    function pointerUp(event) {
        if (
            !pointerStart ||
            dragged ||
            Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5
        )
            return;
        const rect = canvas.getBoundingClientRect();
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([...objects.values()], true)[0];
        let node = hit?.object;
        while (node && !node.userData.sceneId) node = node.parent;
        callbacks.onSelect?.(node?.userData.sceneId ?? null);
    }
    function contextLost(event) {
        event.preventDefault();
        callbacks.onError?.('Ngữ cảnh WebGL bị mất. Tải lại trang hoặc sử dụng danh sách máy.');
    }
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('webglcontextlost', contextLost);
    bindControls();
    themeChanged();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const stopTheme = observeSceneTheme(themeChanged);
    return {
        update,
        dispose() {
            disposed = true;
            guard.dispose();
            cancelAnimationFrame(frame);
            observer.disconnect();
            stopTheme();
            canvas.removeEventListener('pointerdown', pointerDown);
            canvas.removeEventListener('pointerup', pointerUp);
            canvas.removeEventListener('webglcontextlost', contextLost);
            orbit.dispose();
            transform.dispose();
            disposeTree(content, { textures: false });
            cache.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            canvas.remove();
        },
    };
}

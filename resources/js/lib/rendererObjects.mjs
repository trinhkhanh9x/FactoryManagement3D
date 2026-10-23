import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    assertGeometryValues,
    disposeTree,
    physicalScale,
    safeAssetUrl,
    worldPosition,
} from './sceneGeometry.mjs';

export function polygonMesh(polygon, elevation, thickness, color) {
    if (
        !Array.isArray(polygon) ||
        polygon.length < 3 ||
        polygon.length > 100 ||
        polygon.some((point) => !Array.isArray(point) || point.length !== 2)
    )
        throw new Error('Đa giác mặt bằng cần từ 3 đến 100 đỉnh hợp lệ.');
    assertGeometryValues(polygon.flat());
    assertGeometryValues([elevation], -1100, 1100);
    assertGeometryValues([thickness], 0.0001, 100);
    const shape = new THREE.Shape();
    polygon.forEach(([x, z], index) => (index ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    shape.closePath();
    const mesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, {
            depth: thickness,
            bevelEnabled: false,
        }),
        new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            side: THREE.DoubleSide,
        }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = elevation - thickness;
    return mesh;
}
export function objectGroup(object, floors, theme) {
    assertGeometryValues([
        object.position?.x,
        object.position?.y,
        object.position?.z,
        object.rotation?.x,
        object.rotation?.y,
        object.rotation?.z,
    ]);
    assertGeometryValues(
        [object.dimensions?.width, object.dimensions?.height, object.dimensions?.depth],
        0.0001,
        10000,
    );
    const group = new THREE.Group();
    group.userData.sceneId = object.id;
    const position = worldPosition(object, floors);
    assertGeometryValues([position.x, position.y, position.z], -11000, 11000);
    group.position.set(position.x, position.y, position.z);
    group.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
    const { width, height, depth } = object.dimensions;
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
            color: theme.floor,
            roughness: 0.85,
            transparent: object.kind === 'walkway',
            opacity: object.kind === 'walkway' ? 0.45 : 1,
        }),
    );
    mesh.position.y = height / 2;
    group.add(mesh);
    const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: theme.line }),
    );
    outline.position.copy(mesh.position);
    group.add(outline);
    group.userData.placeholder = [mesh, outline];
    if (object.kind === 'machine') {
        const radius = Math.max(width, depth) * 0.65;
        const marker = new THREE.Mesh(
            new THREE.RingGeometry(radius, radius + 0.08, 48),
            new THREE.MeshBasicMaterial({
                color: theme.muted,
                side: THREE.DoubleSide,
            }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = 0.025;
        group.add(marker);
        group.userData.marker = marker;
    }
    return group;
}
export function modelCache() {
    const models = new Map();
    const loader = new GLTFLoader();
    let closed = false;
    function load(asset) {
        const url = safeAssetUrl(asset.url, window.location.origin);
        if (!models.has(url)) {
            const controller = new AbortController();
            const promise = fetch(url, {
                credentials: 'same-origin',
                signal: controller.signal,
            })
                .then((response) => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.arrayBuffer();
                })
                .then((buffer) => loader.parseAsync(buffer, ''))
                .then((gltf) => {
                    if (closed || controller.signal.aborted) {
                        disposeTree(gltf.scene);
                        throw new DOMException('Cancelled', 'AbortError');
                    }
                    return gltf.scene;
                });
            models.set(url, { controller, promise });
            promise.catch(() => {
                if (models.get(url)?.promise === promise) models.delete(url);
            });
        }
        return models.get(url).promise;
    }
    function retain(assets) {
        const urls = new Set(
            assets.map((asset) => safeAssetUrl(asset.url, window.location.origin)),
        );
        for (const [url, entry] of models)
            if (!urls.has(url)) {
                entry.controller.abort();
                entry.promise.then((root) => disposeTree(root)).catch(() => {});
                models.delete(url);
            }
    }
    return {
        load,
        retain,
        dispose() {
            closed = true;
            for (const entry of models.values()) {
                entry.controller.abort();
                entry.promise.then((root) => disposeTree(root)).catch(() => {});
            }
            models.clear();
        },
    };
}
export function fitModel(source, dimensions) {
    const clone = source.clone(true);
    clone.traverse((node) => {
        if (node.geometry) node.geometry = node.geometry.clone();
        if (node.material)
            node.material = Array.isArray(node.material)
                ? node.material.map((material) => material.clone())
                : node.material.clone();
    });
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone),
        size = box.getSize(new THREE.Vector3());
    let scale;
    try {
        scale = physicalScale(size, dimensions);
    } catch (error) {
        disposeTree(clone, { textures: false });
        throw error;
    }
    const wrapper = new THREE.Group();
    wrapper.add(clone);
    clone.position.sub(
        new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2),
    );
    wrapper.scale.setScalar(scale);
    return wrapper;
}
export function replacePlaceholder(group, model) {
    for (const item of group.userData.placeholder) {
        group.remove(item);
        disposeTree(item);
    }
    group.userData.placeholder = [];
    group.add(model);
}

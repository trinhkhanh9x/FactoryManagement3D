export function worldPosition(object, floors) {
    const floor = floors.find((item) => item.id === object.floor_id);
    return {
        ...object.position,
        y: object.position.y + (floor?.elevation ?? 0),
    };
}
export function floorPosition(position, floor) {
    return {
        x: position.x,
        y: position.y - (floor?.elevation ?? 0),
        z: position.z,
    };
}
export function visibleObjects(layout, floorId, showStructure = true) {
    return (layout?.objects ?? []).filter(
        (item) =>
            (floorId === null || item.floor_id === floorId) &&
            (showStructure || !['wall', 'door'].includes(item.kind)),
    );
}
export function assertGeometryValues(values, minimum = -10000, maximum = 10000) {
    if (!values.every((value) => Number.isFinite(value) && value >= minimum && value <= maximum))
        throw new Error('Kích thước hoặc tọa độ mặt bằng vượt giới hạn an toàn.');
}
export function gridParameters(width, depth) {
    assertGeometryValues([width, depth], 0, 20000);
    const span = Math.ceil(Math.max(width, depth, 1));
    return { span, divisions: Math.min(span, 200) };
}
export function physicalScale(size, dimensions) {
    const ratios = [
        ['x', 'width'],
        ['y', 'height'],
        ['z', 'depth'],
    ]
        .filter(([axis]) => size[axis] > 0.000001)
        .map(([axis, dimension]) => dimensions[dimension] / size[axis]);
    if (!ratios.length || ratios.some((value) => !Number.isFinite(value) || value <= 0))
        throw new Error('Mô hình không có kích thước hợp lệ.');
    return Math.min(...ratios);
}
export function disposeTree(root, { textures = true } = {}) {
    const geometries = new Set(),
        materials = new Set(),
        maps = new Set();
    root.traverse((node) => {
        if (node.geometry) geometries.add(node.geometry);
        for (const material of Array.isArray(node.material)
            ? node.material
            : node.material
              ? [node.material]
              : []) {
            materials.add(material);
            if (textures)
                for (const value of Object.values(material)) if (value?.isTexture) maps.add(value);
        }
    });
    const images = new Set([...maps].map((texture) => texture.source?.data).filter(Boolean));
    for (const resource of [...geometries, ...materials, ...maps]) resource.dispose();
    for (const image of images) if (typeof image.close === 'function') image.close();
}
export function createGeneration() {
    let generation = 0,
        disposed = false;
    return {
        next: () => ++generation,
        isCurrent: (token) => !disposed && generation === token,
        dispose: () => {
            disposed = true;
            generation++;
        },
    };
}
export function safeAssetUrl(url, origin) {
    const parsed = new URL(url, origin);
    if (
        parsed.origin !== origin ||
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
    )
        throw new Error('Đường dẫn mô hình không hợp lệ.');
    return parsed.href;
}

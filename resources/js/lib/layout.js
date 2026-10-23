export const emptyLayout = () => ({ schema_version: 1, floors: [], zones: [], objects: [] });
export const radians = (value) => (Number(value) * Math.PI) / 180;
export const degrees = (value) => (Number(value) * 180) / Math.PI;
export const entityId = (prefix) =>
    `${prefix}-${globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('')}`;
export const addEntity = (layout, collection, entity) => ({
    ...layout,
    [collection]: [...layout[collection], entity],
});
export const updateEntity = (layout, collection, id, changes) => ({
    ...layout,
    [collection]: layout[collection].map((item) =>
        item.id === id ? { ...item, ...changes } : item,
    ),
});

export function removeEntity(layout, collection, id) {
    const next = { ...layout, [collection]: layout[collection].filter((item) => item.id !== id) };
    if (collection === 'floors') {
        return {
            ...next,
            zones: next.zones.filter((item) => item.floor_id !== id),
            objects: next.objects.filter((item) => item.floor_id !== id),
        };
    }
    if (collection === 'zones')
        return {
            ...next,
            objects: next.objects.map((item) =>
                item.zone_id === id ? { ...item, zone_id: null } : item,
            ),
        };
    return next;
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, min = -10000, max = 10000) => finite(value) && value >= min && value <= max;
const validPolygon = (polygon) =>
    Array.isArray(polygon) &&
    polygon.length >= 3 &&
    polygon.length <= 100 &&
    polygon.every(
        (point) =>
            Array.isArray(point) && point.length === 2 && point.every((value) => bounded(value)),
    );

export function validateLayout(layout) {
    const issues = [];
    if (!layout || layout.schema_version !== 1) return ['Phiên bản mặt bằng không hợp lệ.'];
    if (!['floors', 'zones', 'objects'].every((key) => Array.isArray(layout[key])))
        return ['Danh sách mặt bằng không hợp lệ.'];
    if (layout.floors.length > 50 || layout.zones.length > 1000 || layout.objects.length > 10000)
        issues.push('Mặt bằng vượt giới hạn 50 tầng, 1.000 khu vực hoặc 10.000 đối tượng.');
    const ids = [...layout.floors, ...layout.zones, ...layout.objects].map((item) => item.id);
    if (new Set(ids).size !== ids.length) issues.push('Mã đối tượng bị trùng.');
    const floorIds = new Set(layout.floors.map((floor) => floor.id));
    layout.floors.forEach((floor) => {
        if (
            !floor.name?.trim() ||
            !bounded(floor.elevation, -1000, 1000) ||
            !finite(floor.thickness) ||
            floor.thickness <= 0 ||
            floor.thickness > 100 ||
            !validPolygon(floor.polygon)
        )
            issues.push(
                `Tầng ${floor.name || floor.id}: tên, độ dày, cao độ hoặc đa giác không hợp lệ. Cao độ trong ±1.000 m; độ dày tối đa 100 m; từ 3–100 đỉnh trong ±10.000 m.`,
            );
    });
    layout.zones.forEach((zone) => {
        if (!zone.name?.trim() || !floorIds.has(zone.floor_id) || !validPolygon(zone.polygon))
            issues.push(`Khu vực ${zone.name || zone.id}: tầng hoặc đa giác không hợp lệ.`);
    });
    const machines = new Set();
    layout.objects.forEach((object) => {
        if (!floorIds.has(object.floor_id))
            issues.push(`Đối tượng ${object.label || object.id} chưa có tầng hợp lệ.`);
        if (
            object.zone_id &&
            !layout.zones.some(
                (zone) => zone.id === object.zone_id && zone.floor_id === object.floor_id,
            )
        )
            issues.push('Khu vực không thuộc cùng tầng.');
        if (
            !Object.values(object.position || {}).every((value) => bounded(value)) ||
            Object.keys(object.position || {}).length !== 3 ||
            !Object.values(object.rotation || {}).every((value) => bounded(value)) ||
            Object.keys(object.rotation || {}).length !== 3
        )
            issues.push('Tọa độ và góc quay phải là số hữu hạn hợp lệ trong ±10.000.');
        if (
            Object.keys(object.dimensions || {}).length !== 3 ||
            !Object.values(object.dimensions || {}).every((value) => bounded(value, 0.0001, 10000))
        )
            issues.push('Kích thước phải là số dương hữu hạn từ 0,0001 đến 10.000 m.');
        if (object.kind === 'machine') {
            if (!object.workstation_id || machines.has(object.workstation_id))
                issues.push(
                    'Mỗi máy phải liên kết với một trạm và chỉ có một vị trí, không trùng.',
                );
            machines.add(object.workstation_id);
        }
    });
    return issues;
}

export function filterStations(stations, search = '', state = '', lineId = '') {
    const query = search.trim().toLocaleLowerCase('vi');
    return stations.filter((station) => {
        const text = [
            station.code,
            station.name,
            ...(station.active_operations || []).flatMap((operation) => [
                operation.order_no,
                operation.batch_number,
                operation.lot_number,
            ]),
            station.last_operation?.order_no,
        ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('vi');
        return (
            (!query || text.includes(query)) &&
            (!state || (station.state || 'UNKNOWN') === state) &&
            (!lineId || String(station.line_id) === String(lineId))
        );
    });
}

export const orderTone = (status) =>
    ({
        PENDING: 'neutral',
        ACCEPTED: 'info',
        IN_PROGRESS: 'active',
        BLOCKED: 'danger',
        DONE: 'success',
        COMPLETED: 'success',
        CANCELLED: 'ghost',
    })[status] || 'neutral';
export const orderLabel = (status) =>
    ({
        PENDING: 'Chờ xử lý',
        ACCEPTED: 'Đã duyệt',
        IN_PROGRESS: 'Đang thực hiện',
        BLOCKED: 'Bị chặn',
        DONE: 'Hoàn thành',
        COMPLETED: 'Hoàn thành',
        CANCELLED: 'Đã hủy',
    })[status] ||
    status ||
    'Chưa có dữ liệu';

export function formatTime(value, timezone = 'Asia/Ho_Chi_Minh') {
    if (!value || Number.isNaN(Date.parse(value))) return 'Chưa có dữ liệu';
    try {
        return new Intl.DateTimeFormat('vi-VN', {
            dateStyle: 'short',
            timeStyle: 'medium',
            timeZone: timezone,
        }).format(new Date(value));
    } catch {
        return new Date(value).toLocaleString('vi-VN');
    }
}

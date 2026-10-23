import { Color, Vector3 } from 'three';
import { stationState } from './theme.mjs';

export function projectLabels(host, objects, layout, camera) {
    const width = host.clientWidth,
        height = host.clientHeight;
    for (const [id, group] of objects) {
        const label = host.querySelector(`[data-scene-label="${CSS.escape(id)}"]`);
        if (!label) continue;
        const object = layout.objects.find((item) => item.id === id);
        const position = group
            .localToWorld(new Vector3(0, object.dimensions.height + 0.15, 0))
            .project(camera);
        label.style.left = `${((position.x + 1) * width) / 2}px`;
        label.style.top = `${((1 - position.y) * height) / 2}px`;
        label.hidden =
            position.z < -1 ||
            position.z > 1 ||
            Math.abs(position.x) > 1.2 ||
            Math.abs(position.y) > 1.2;
    }
}
export function applySceneTheme(scene, content, objects, theme) {
    scene.background = new Color(theme.background);
    content.children
        .filter((item) => item.userData.floor)
        .forEach((item) => item.material.color.set(theme.floor));
    content.children
        .filter((item) => item.userData.grid || item.userData.zone)
        .forEach((item) => item.material.color.set(theme.line));
    for (const group of objects.values())
        for (const item of group.userData.placeholder ?? [])
            item.material.color.set(item.isMesh ? theme.floor : theme.line);
}
export function paintMarkers(objects, data, theme) {
    const stations = new Map((data.stations ?? []).map((station) => [String(station.id), station]));
    for (const object of data.layout?.objects ?? []) {
        const group = objects.get(object.id),
            marker = group?.userData.marker;
        if (marker) {
            const state = stationState(stations.get(String(object.workstation_id))?.state);
            marker.material.color.set(
                object.id === data.selectedId ? theme.accent : theme[state.token],
            );
            marker.material.wireframe = state.pattern;
        }
    }
}

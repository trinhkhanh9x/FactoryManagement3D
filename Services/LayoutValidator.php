<?php

namespace Modules\FactoryManagement3D\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Modules\FactoryManagement3D\Models\Factory;

class LayoutValidator
{
    public function validate(array $layout, Factory $factory): array
    {
        Validator::make($layout, [
            'schema_version' => 'required|integer|in:1',
            'floors' => 'present|array|max:50', 'zones' => 'present|array|max:1000', 'objects' => 'present|array|max:10000',
            'floors.*.id' => 'required|string|max:100|distinct', 'floors.*.name' => 'required|string|max:200',
            'floors.*.elevation' => 'required|numeric|between:-1000,1000',
            'floors.*.thickness' => 'required|numeric|gt:0|lte:100', 'floors.*.verified' => 'required|boolean',
            'zones.*.id' => 'required|string|max:100|distinct', 'zones.*.name' => 'required|string|max:200',
            'zones.*.floor_id' => 'required|string|max:100',
            'objects.*.id' => 'required|string|max:100|distinct',
            'objects.*.kind' => 'required|in:machine,wall,door,walkway', 'objects.*.label' => 'required|string|max:200',
            'objects.*.floor_id' => 'required|string|max:100', 'objects.*.zone_id' => 'nullable|string|max:100',
            'objects.*.workstation_id' => 'nullable|integer|min:1', 'objects.*.asset_id' => 'nullable|integer|min:1',
            'objects.*.position' => 'required|array:x,y,z', 'objects.*.rotation' => 'required|array:x,y,z',
            'objects.*.dimensions' => 'required|array:width,height,depth',
            'objects.*.verified_position' => 'required|boolean', 'objects.*.verified_geometry' => 'required|boolean',
        ])->validate();
        foreach (['floors', 'zones', 'objects'] as $collection) {
            $this->check(array_is_list($layout[$collection]), 'Danh sách mặt bằng phải là array tuần tự.');
        }
        $floors = array_column($layout['floors'], 'id');
        $zones = array_column($layout['zones'], null, 'id');
        $stationIds = app(FactoryAccess::class)->stations($factory)->pluck('id')->all();
        $assetIds = DB::table('fm3d_assets')->where('factory_id', $factory->id)->pluck('id')->all();
        foreach ($layout['floors'] as $floor) {
            $this->polygon($floor['polygon'] ?? null);
        }
        foreach ($layout['zones'] as $zone) {
            $this->check(in_array($zone['floor_id'], $floors, true), 'Khu vực tham chiếu tầng không hợp lệ.');
            $this->polygon($zone['polygon'] ?? null);
        }
        $used = [];
        foreach ($layout['objects'] as $object) {
            $this->check(in_array($object['floor_id'], $floors, true), 'Đối tượng tham chiếu tầng không hợp lệ.');
            $zone = $object['zone_id'] ?? null;
            $this->check($zone === null || (($zones[$zone]['floor_id'] ?? null) === $object['floor_id']), 'Khu vực không thuộc tầng.');
            foreach (['position', 'rotation', 'dimensions'] as $field) {
                $keys = $field === 'dimensions' ? ['width', 'height', 'depth'] : ['x', 'y', 'z'];
                foreach ($keys as $key) {
                    $this->number($object[$field][$key] ?? null, $field === 'dimensions' ? 0.0001 : -10000, 10000);
                }
            }
            $station = $object['workstation_id'] ?? null;
            $asset = $object['asset_id'] ?? null;
            $this->check($asset === null || in_array($asset, $assetIds, true), 'Mô hình không thuộc xưởng.');
            if ($object['kind'] === 'machine') {
                $this->check($station !== null && in_array($station, $stationIds, true) && ! in_array($station, $used, true), 'Máy không thuộc xưởng hoặc đã được bố trí.');
                $used[] = $station;
            } else {
                $this->check($station === null, 'Chỉ đối tượng máy được liên kết máy MES.');
            }
        }

        // Persist validated scene fields with canonical scalar types. Laravel
        // numeric/boolean rules also accept numeric strings, including "0".
        return ['schema_version' => 1, 'floors' => array_map(fn ($v) => [
            ...$this->only($v, ['id', 'name', 'elevation', 'thickness', 'polygon', 'verified']),
            'elevation' => (float) $v['elevation'], 'thickness' => (float) $v['thickness'], 'verified' => (bool) $v['verified'],
        ], $layout['floors']),
            'zones' => array_map(fn ($v) => $this->only($v, ['id', 'name', 'floor_id', 'polygon']), $layout['zones']),
            'objects' => array_map(fn ($v) => [
                ...$this->only($v, ['id', 'kind', 'label', 'floor_id', 'zone_id', 'workstation_id', 'asset_id', 'position', 'rotation', 'dimensions', 'verified_position', 'verified_geometry']),
                'verified_position' => (bool) $v['verified_position'], 'verified_geometry' => (bool) $v['verified_geometry'],
            ], $layout['objects'])];
    }

    private function only(array $value, array $keys): array
    {
        return array_intersect_key($value, array_flip($keys));
    }

    private function number(mixed $value, float $min, float $max): void
    {
        $this->check((is_int($value) || is_float($value)) && is_finite((float) $value) && $value >= $min && $value <= $max, 'Tọa độ/kích thước không hợp lệ.');
    }

    private function polygon(mixed $polygon): void
    {
        $this->check(is_array($polygon) && count($polygon) >= 3 && count($polygon) <= 100, 'Đa giác cần từ 3 đến 100 đỉnh.');
        $this->check(array_is_list($polygon), 'Danh sách đỉnh không hợp lệ.');
        foreach ($polygon as $point) {
            $this->check(is_array($point) && array_is_list($point) && count($point) === 2, 'Đỉnh đa giác không hợp lệ.');
            $this->number($point[0], -10000, 10000);
            $this->number($point[1], -10000, 10000);
        }
        $area = 0;
        $count = count($polygon);
        foreach ($polygon as $i => $point) {
            $next = $polygon[($i + 1) % $count];
            $this->check($point !== $next, 'Đa giác có đỉnh trùng liên tiếp.');
            $area += $point[0] * $next[1] - $next[0] * $point[1];
        }
        $this->check(abs($area) > 0.000001, 'Đa giác không có diện tích.');
        for ($i = 0; $i < $count; $i++) {
            for ($j = $i + 1; $j < $count; $j++) {
                if ($j === $i + 1 || ($i === 0 && $j === $count - 1)) {
                    continue;
                }
                $this->check(! $this->intersects($polygon[$i], $polygon[($i + 1) % $count], $polygon[$j], $polygon[($j + 1) % $count]), 'Đa giác tự cắt.');
            }
        }
    }

    private function intersects(array $a, array $b, array $c, array $d): bool
    {
        $cross = fn ($p, $q, $r) => ($q[0] - $p[0]) * ($r[1] - $p[1]) - ($q[1] - $p[1]) * ($r[0] - $p[0]);

        return $cross($a, $b, $c) * $cross($a, $b, $d) <= 0 && $cross($c, $d, $a) * $cross($c, $d, $b) <= 0
            && max(min($a[0], $b[0]), min($c[0], $d[0])) <= min(max($a[0], $b[0]), max($c[0], $d[0]))
            && max(min($a[1], $b[1]), min($c[1], $d[1])) <= min(max($a[1], $b[1]), max($c[1], $d[1]));
    }

    private function check(bool $condition, string $message): void
    {
        if (! $condition) {
            throw ValidationException::withMessages(['layout' => $message]);
        }
    }
}

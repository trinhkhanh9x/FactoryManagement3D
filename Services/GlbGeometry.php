<?php

namespace Modules\FactoryManagement3D\Services;

use Illuminate\Validation\ValidationException;

/** Bounds decoded allocations as well as compressed/container file size. */
class GlbGeometry
{
    public function validate(array $json): int
    {
        $this->accessors($json);
        $meshes = [];
        foreach ($json['meshes'] ?? [] as $mesh) {
            $triangles = 0;
            $this->check(isset($mesh['primitives']) && is_array($mesh['primitives']) && array_is_list($mesh['primitives']) && count($mesh['primitives']) <= 1000);
            foreach ($mesh['primitives'] as $primitive) {
                $this->check(is_array($primitive) && is_array($primitive['attributes'] ?? null));
                $position = $this->reference($json['accessors'] ?? [], $primitive['attributes']['POSITION'] ?? null);
                $this->check($position['type'] === 'VEC3' && $position['componentType'] === 5126);
                foreach ($primitive['attributes'] as $reference) {
                    $attribute = $this->reference($json['accessors'], $reference);
                    $this->check($attribute['count'] === $position['count']);
                }
                $targets = $primitive['targets'] ?? [];
                $this->check(is_array($targets) && array_is_list($targets) && count($targets) <= 100);
                foreach ($targets as $target) {
                    $this->check(is_array($target));
                    foreach ($target as $reference) {
                        $this->check($this->reference($json['accessors'], $reference)['count'] === $position['count']);
                    }
                }
                $mode = $primitive['mode'] ?? 4;
                $this->check(in_array($mode, [4, 5, 6], true));
                $index = isset($primitive['indices']) ? $this->reference($json['accessors'], $primitive['indices']) : $position;
                if (isset($primitive['indices'])) {
                    $this->check($index['type'] === 'SCALAR' && in_array($index['componentType'], [5121, 5123, 5125], true));
                }
                $count = $index['count'];
                $this->check($count >= 3 && ($mode !== 4 || $count % 3 === 0));
                $triangles += $mode === 4 ? intdiv($count, 3) : $count - 2;
            }
            $meshes[] = $triangles;
        }
        $uniqueTriangles = array_sum($meshes);
        $this->check($uniqueTriangles <= 250000);
        $nodes = $json['nodes'] ?? [];
        $parents = [];
        foreach ($nodes as $id => $node) {
            if (isset($node['mesh'])) {
                $this->reference($meshes, $node['mesh']);
            }
            $children = $node['children'] ?? [];
            $this->check(is_array($children) && array_is_list($children));
            foreach ($children as $child) {
                $this->reference($nodes, $child);
                $this->check(! isset($parents[$child]));
                $parents[$child] = $id;
            }
        }
        $cost = [];
        foreach (array_keys($nodes) as $id) {
            $cost[$id] = $this->nodeCost($id, $nodes, $meshes, [], 0);
        }
        $instances = 0;
        foreach ($nodes as $node) {
            $instances += isset($node['mesh']) ? $meshes[$node['mesh']] : 0;
        }
        $this->check($instances <= 250000);
        $sceneCost = 0;
        $expandedNodes = 0;
        foreach ($json['scenes'] ?? [] as $scene) {
            $roots = $scene['nodes'] ?? [];
            $this->check(is_array($roots) && array_is_list($roots));
            foreach ($roots as $root) {
                $this->check(is_int($root));
            }
            $this->check(count(array_unique($roots)) === count($roots));
            foreach ($roots as $root) {
                $this->reference($nodes, $root);
                $sceneCost += $cost[$root];
                $this->check($sceneCost <= 250000);
                $expandedNodes += $this->nodeCount($root, $nodes);
                $this->check($expandedNodes <= 20000);
            }
        }

        return max($uniqueTriangles, $instances, $sceneCost);
    }

    private function nodeCount(int $id, array $nodes): int
    {
        // Cycles and depth were checked by nodeCost before this traversal.
        $count = 1;
        foreach ($nodes[$id]['children'] ?? [] as $child) {
            $count += $this->nodeCount($child, $nodes);
            $this->check($count <= 20000);
        }

        return $count;
    }

    private function accessors(array $json): void
    {
        $decoded = 0;
        foreach ($json['accessors'] ?? [] as $accessor) {
            $this->check(! isset($accessor['sparse']));
            $view = $this->reference($json['bufferViews'] ?? [], $accessor['bufferView'] ?? null);
            $components = ['SCALAR' => 1, 'VEC2' => 2, 'VEC3' => 3, 'VEC4' => 4, 'MAT2' => 4, 'MAT3' => 9, 'MAT4' => 16];
            $sizes = [5120 => 1, 5121 => 1, 5122 => 2, 5123 => 2, 5125 => 4, 5126 => 4];
            $this->check(is_string($accessor['type'] ?? null) && is_int($accessor['componentType'] ?? null));
            $componentCount = $components[$accessor['type'] ?? ''] ?? 0;
            $size = $sizes[$accessor['componentType'] ?? 0] ?? 0;
            $element = $componentCount * $size;
            $count = $accessor['count'] ?? null;
            $stride = $view['byteStride'] ?? $element;
            $offset = $accessor['byteOffset'] ?? 0;
            $this->check($element > 0 && is_int($count) && $count > 0 && $count <= 1000000
                && is_int($stride) && $stride >= $element && $stride <= 252 && is_int($offset) && $offset >= 0
                && $offset % $size === 0 && (($view['byteOffset'] ?? 0) + $offset) % $size === 0
                && $offset + ($count - 1) * $stride + $element <= $view['byteLength']);
            $decoded += $count * $componentCount * max(4, $size);
            $this->check($decoded <= 64 * 1024 * 1024);
        }
    }

    private function nodeCost(int $id, array $nodes, array $meshes, array $path, int $depth): int
    {
        $this->check($depth <= 64 && ! isset($path[$id]));
        $path[$id] = true;
        $node = $nodes[$id];
        $sum = isset($node['mesh']) ? $meshes[$node['mesh']] : 0;
        foreach ($node['children'] ?? [] as $child) {
            $sum += $this->nodeCost($child, $nodes, $meshes, $path, $depth + 1);
            $this->check($sum <= 250000);
        }

        return $sum;
    }

    private function reference(array $values, mixed $index): mixed
    {
        $this->check(is_int($index) && $index >= 0 && array_key_exists($index, $values));

        return $values[$index];
    }

    private function check(bool $ok): void
    {
        if (! $ok) {
            throw ValidationException::withMessages(['model' => 'Cấu trúc hình học GLB không hợp lệ hoặc vượt giới hạn giải mã (64 MiB, 250.000 tam giác, 64 tầng/20.000 node mở rộng). Không hỗ trợ accessor sparse/viewless.']);
        }
    }
}

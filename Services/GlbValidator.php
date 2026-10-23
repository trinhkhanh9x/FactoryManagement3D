<?php

namespace Modules\FactoryManagement3D\Services;

use Illuminate\Validation\ValidationException;

/** Validates bytes before storing or exposing a model to the browser loader. */
class GlbValidator
{
    public const MAX_BYTES = 20 * 1024 * 1024;

    public function validate(string $bytes): array
    {
        $this->require(strlen($bytes) >= 20 && strlen($bytes) <= self::MAX_BYTES, 'GLB phải nhỏ hơn hoặc bằng 20 MiB.');
        $header = unpack('Vversion/Vlength', substr($bytes, 4, 8));
        $this->require(substr($bytes, 0, 4) === 'glTF' && $header['version'] === 2 && $header['length'] === strlen($bytes), 'GLB 2 không hợp lệ.');
        [$json, $binary] = $this->chunks($bytes);
        $this->require(($json['asset']['version'] ?? null) === '2.0', 'Yêu cầu glTF 2.0.');
        foreach (['buffers', 'bufferViews', 'accessors', 'images', 'meshes', 'nodes', 'scenes', 'textures', 'materials', 'skins', 'animations'] as $key) {
            $list = $json[$key] ?? [];
            $this->require(is_array($list) && array_is_list($list) && count($list) <= 10000, 'Danh sách GLB không hợp lệ.');
            foreach ($list as $item) {
                $this->require(is_array($item), 'Phần tử GLB không hợp lệ.');
            }
        }
        $this->inspectTree($json);
        foreach (['extensionsUsed', 'extensionsRequired'] as $key) {
            $list = $json[$key] ?? [];
            $this->require(is_array($list) && array_is_list($list) && count($list) <= 100, 'Danh sách extension không hợp lệ.');
            foreach ($list as $extension) {
                $this->require(is_string($extension), 'Tên extension không hợp lệ.');
            }
        }
        foreach ([...($json['extensionsUsed'] ?? []), ...($json['extensionsRequired'] ?? [])] as $extension) {
            $this->require(! in_array($extension, ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu', 'EXT_mesh_gpu_instancing'], true), 'Không hỗ trợ mô hình nén/instancing cần xử lý bổ sung.');
        }
        $buffers = $json['buffers'] ?? [];
        $this->require(count($buffers) <= 1, 'GLB chỉ được có một buffer nhúng.');
        if ($buffers !== []) {
            $length = $buffers[0]['byteLength'] ?? -1;
            $this->require(is_int($length) && $length >= 0 && $length <= strlen($binary) && strlen($binary) - $length <= 3, 'Độ dài buffer không hợp lệ.');
        }
        foreach ($json['bufferViews'] ?? [] as $view) {
            $this->view($view, $binary);
        }
        $triangles = (new GlbGeometry)->validate($json);
        $this->images($json, $binary);

        return ['triangles' => $triangles, 'size_bytes' => strlen($bytes), 'checksum' => hash('sha256', $bytes)];
    }

    private function chunks(string $bytes): array
    {
        $offset = 12;
        $json = null;
        $binary = '';
        while ($offset < strlen($bytes)) {
            $this->require($offset + 8 <= strlen($bytes), 'GLB bị thiếu chunk.');
            $chunk = unpack('Vlength/Vtype', substr($bytes, $offset, 8));
            $offset += 8;
            $this->require($chunk['length'] % 4 === 0 && $offset + $chunk['length'] <= strlen($bytes), 'Chunk GLB không hợp lệ.');
            $data = substr($bytes, $offset, $chunk['length']);
            if ($chunk['type'] === 0x4E4F534A && $json === null && $offset === 20) {
                try {
                    $json = json_decode($data, true, 64, JSON_THROW_ON_ERROR);
                } catch (\JsonException) {
                    $this->require(false, 'JSON GLB không hợp lệ.');
                }
                $this->require(is_array($json), 'GLB thiếu JSON object.');
            } elseif ($chunk['type'] === 0x004E4942 && $binary === '' && $json !== null) {
                $binary = $data;
            } else {
                $this->require(false, 'Cấu trúc chunk GLB không hỗ trợ.');
            }
            $offset += $chunk['length'];
        }
        $this->require(is_array($json), 'GLB thiếu JSON.');

        return [$json, $binary];
    }

    private function inspectTree(array $node): void
    {
        foreach ($node as $key => $value) {
            $this->require($key !== 'uri', 'GLB phải tự chứa tài nguyên, không chứa URI.');
            if ($key === 'extensions' && is_array($value)) {
                foreach (array_keys($value) as $extension) {
                    $this->require(! in_array($extension, ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu', 'EXT_mesh_gpu_instancing'], true), 'Extension nén/instancing không được hỗ trợ.');
                }
            }
            if (is_array($value)) {
                $this->inspectTree($value);
            }
        }
    }

    private function view(array $view, string $binary): string
    {
        $offset = $view['byteOffset'] ?? 0;
        $length = $view['byteLength'] ?? -1;
        $this->require(($view['buffer'] ?? null) === 0 && is_int($offset) && is_int($length)
            && $offset >= 0 && $length > 0 && $offset + $length <= strlen($binary), 'BufferView vượt ngoài dữ liệu.');

        return substr($binary, $offset, $length);
    }

    private function images(array $json, string $binary): void
    {
        $images = $json['images'] ?? [];
        $this->require(count($images) <= 64, 'GLB vượt 64 ảnh texture.');
        $decoded = 0;
        foreach ($images as $image) {
            $reference = $image['bufferView'] ?? null;
            $this->require(is_int($reference) && $reference >= 0, 'Texture thiếu bufferView hợp lệ.');
            $view = $json['bufferViews'][$reference] ?? null;
            $this->require(is_array($view) && in_array($image['mimeType'] ?? '', ['image/png', 'image/jpeg', 'image/webp'], true), 'Texture phải là PNG, JPEG hoặc WebP nhúng.');
            $bytes = $this->view($view, $binary);
            $size = @getimagesizefromstring($bytes);
            $this->require($size !== false && $size[0] > 0 && $size[1] > 0 && $size[0] <= 4096 && $size[1] <= 4096, 'Texture không hợp lệ hoặc vượt 4096 pixel.');
            $decoded += $size[0] * $size[1] * 4;
            $this->require($decoded <= 128 * 1024 * 1024, 'Texture vượt tổng bộ nhớ giải mã 128 MiB.');
        }
    }

    private function require(bool $condition, string $message): void
    {
        if (! $condition) {
            throw ValidationException::withMessages(['model' => $message]);
        }
    }
}

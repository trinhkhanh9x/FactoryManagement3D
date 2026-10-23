<?php

namespace Modules\FactoryManagement3D\Tests;

use Illuminate\Validation\ValidationException;
use Modules\FactoryManagement3D\Services\GlbValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class GlbValidatorTest extends TestCase
{
    public static function glb(array $json, string $binary = ''): string
    {
        $data = json_encode($json, JSON_THROW_ON_ERROR);
        $data .= str_repeat(' ', (4 - strlen($data) % 4) % 4);
        $chunk = pack('VV', strlen($data), 0x4E4F534A).$data;
        if ($binary !== '') {
            $binary .= str_repeat("\0", (4 - strlen($binary) % 4) % 4);
            $chunk .= pack('VV', strlen($binary), 0x004E4942).$binary;
        }

        return 'glTF'.pack('VV', 2, 12 + strlen($chunk)).$chunk;
    }

    public function test_counts_geometry_without_requiring_external_decoder(): void
    {
        $json = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => 36]],
            'bufferViews' => [['buffer' => 0, 'byteLength' => 36]],
            'accessors' => [['bufferView' => 0, 'componentType' => 5126, 'count' => 3, 'type' => 'VEC3']],
            'meshes' => [['primitives' => [['attributes' => ['POSITION' => 0]]]]]];
        $this->assertSame(1, (new GlbValidator)->validate(self::glb($json, str_repeat("\0", 36)))['triangles']);
    }

    public function test_rejects_external_uri_even_when_optional(): void
    {
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb(['asset' => ['version' => '2.0'], 'images' => [['uri' => 'https://example.test/x.png']]]));
    }

    public function test_rejects_compressed_extension_and_truncated_data(): void
    {
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb(['asset' => ['version' => '2.0'], 'extensionsUsed' => ['KHR_draco_mesh_compression']]));
    }

    public function test_rejects_invalid_container(): void
    {
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate('glTF'.pack('VV', 2, 123));
    }

    public function test_rejects_actual_oversized_embedded_texture(): void
    {
        $png = "\x89PNG\r\n\x1a\n".pack('N', 13).'IHDR'.pack('NN', 5000, 1).str_repeat("\0", 9);
        $json = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => strlen($png)]],
            'bufferViews' => [['buffer' => 0, 'byteLength' => strlen($png)]],
            'images' => [['bufferView' => 0, 'mimeType' => 'image/png']]];
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb($json, $png));
    }

    public function test_rejects_viewless_position_even_when_indices_are_small(): void
    {
        $json = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => 6]],
            'bufferViews' => [['buffer' => 0, 'byteLength' => 6]],
            'accessors' => [['bufferView' => 0, 'componentType' => 5123, 'count' => 3, 'type' => 'SCALAR'],
                ['componentType' => 5126, 'count' => 1000000000, 'type' => 'VEC3']],
            'meshes' => [['primitives' => [['indices' => 0, 'attributes' => ['POSITION' => 1]]]]]];
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb($json, str_repeat("\0", 6)));
    }

    public function test_rejects_node_cycles_and_gpu_instancing(): void
    {
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb(['asset' => ['version' => '2.0'], 'nodes' => [['children' => [0]]]]));
    }

    public function test_rejects_instancing_extension(): void
    {
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb(['asset' => ['version' => '2.0'], 'extensionsUsed' => ['EXT_mesh_gpu_instancing']]));
    }

    public function test_rejects_aggregate_texture_decode_budget(): void
    {
        // PNG headers carry dimensions even before browser decompression.
        $png = "\x89PNG\r\n\x1a\n".pack('N', 13).'IHDR'.pack('NN', 4096, 4096).str_repeat("\0", 9);
        $json = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => strlen($png)]],
            'bufferViews' => [['buffer' => 0, 'byteLength' => strlen($png)]],
            'images' => array_fill(0, 3, ['bufferView' => 0, 'mimeType' => 'image/png'])];
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb($json, $png));
    }

    public function test_rejects_malformed_extension_list_without_server_error(): void
    {
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb(['asset' => ['version' => '2.0'], 'extensionsUsed' => 'invalid']));
    }

    public function test_counts_repeated_mesh_nodes_and_valid_scene_tree(): void
    {
        $json = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => 36]],
            'bufferViews' => [['buffer' => 0, 'byteLength' => 36]],
            'accessors' => [['bufferView' => 0, 'componentType' => 5126, 'count' => 3, 'type' => 'VEC3']],
            'meshes' => [['primitives' => [['attributes' => ['POSITION' => 0]]]]],
            'nodes' => [['children' => [1, 2]], ['mesh' => 0], ['mesh' => 0]], 'scenes' => [['nodes' => [0]]]];
        $this->assertSame(2, (new GlbValidator)->validate(self::glb($json, str_repeat("\0", 36)))['triangles']);
    }

    public function test_rejects_aggregate_accessor_allocation_even_with_shared_buffer(): void
    {
        $json = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => 12000000]],
            'bufferViews' => [['buffer' => 0, 'byteLength' => 12000000]],
            'accessors' => array_fill(0, 6, ['bufferView' => 0, 'componentType' => 5126, 'count' => 1000000, 'type' => 'VEC3'])];
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb($json, str_repeat("\0", 12000000)));
    }

    public function test_accepts_real_embedded_png_and_returns_checksum(): void
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTKcAAAAASUVORK5CYII=');
        $json = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => strlen($png)]],
            'bufferViews' => [['buffer' => 0, 'byteLength' => strlen($png)]], 'images' => [['bufferView' => 0, 'mimeType' => 'image/png']]];
        $glb = self::glb($json, $png);
        $this->assertSame(hash('sha256', $glb), (new GlbValidator)->validate($glb)['checksum']);
    }

    public static function malformedModels(): array
    {
        $base = ['asset' => ['version' => '2.0'], 'buffers' => [['byteLength' => 36]], 'bufferViews' => [['buffer' => 0, 'byteLength' => 36]]];

        return [
            'accessor type array' => [[...$base, 'accessors' => [['bufferView' => 0, 'componentType' => 5126, 'count' => 3, 'type' => []]]]],
            'component array' => [[...$base, 'accessors' => [['bufferView' => 0, 'componentType' => [], 'count' => 3, 'type' => 'VEC3']]]],
            'image ref array' => [[...$base, 'images' => [['bufferView' => [], 'mimeType' => 'image/png']]]],
            'mesh scalar' => [[...$base, 'meshes' => [['primitives' => 'invalid']]]],
            'node ref array' => [[...$base, 'nodes' => [['children' => [[]]]]]],
            'root ref array' => [[...$base, 'scenes' => [['nodes' => [[]]]]]],
        ];
    }

    #[DataProvider('malformedModels')]
    public function test_malformed_model_returns_validation_error(array $json): void
    {
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb($json, str_repeat("\0", 36)));
    }

    public function test_rejects_zero_mesh_node_expansion_across_scenes(): void
    {
        $json = ['asset' => ['version' => '2.0'], 'nodes' => array_fill(0, 200, []),
            'scenes' => array_fill(0, 101, ['nodes' => range(0, 199)])];
        $this->expectException(ValidationException::class);
        (new GlbValidator)->validate(self::glb($json));
    }
}

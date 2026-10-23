<?php

namespace Modules\FactoryManagement3D\Http;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Modules\FactoryManagement3D\Services\FactoryAccess;
use Modules\FactoryManagement3D\Services\GlbValidator;

class AssetController
{
    public function __construct(private FactoryAccess $access, private GlbValidator $validator) {}

    public function index(Request $request, int $factory)
    {
        $this->access->factory($request->user(), $factory);

        return FactoryController::success(['assets' => DB::table('fm3d_assets')->where('factory_id', $factory)->orderBy('name')->get()->map(fn ($a) => $this->dto($a))->all()]);
    }

    public function upload(Request $request, int $factory)
    {
        $record = $this->access->factory($request->user(), $factory, true);
        $request->validate(['model' => 'required|file|max:20480']);
        $file = $request->file('model');
        abort_unless(strtolower($file->getClientOriginalExtension()) === 'glb', 422, 'Chỉ chấp nhận file GLB.');
        $bytes = file_get_contents($file->getRealPath());
        $metadata = $this->validator->validate($bytes);
        $path = 'factory-management-3d/'.$record->id.'/'.Str::uuid().'.glb';
        abort_unless(Storage::disk('local')->put($path, $bytes), 500, 'Không lưu được mô hình.');
        try {
            $id = DB::transaction(function () use ($request, $record, $file, $path, $metadata) {
                $id = DB::table('fm3d_assets')->insertGetId(['factory_id' => $record->id,
                    'name' => mb_substr(basename($file->getClientOriginalName()), 0, 200), 'path' => $path,
                    ...$metadata, 'uploaded_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now()]);
                $this->access->audit($record, $request->user(), 'asset.uploaded', ['asset_id' => $id]);

                return $id;
            });
        } catch (\Throwable $e) {
            Storage::disk('local')->delete($path);
            throw $e;
        }

        return FactoryController::success($this->dto(DB::table('fm3d_assets')->find($id)), 201);
    }

    public function show(Request $request, int $asset)
    {
        $row = DB::table('fm3d_assets')->find($asset);
        abort_unless($row, 404);
        $this->access->factory($request->user(), $row->factory_id);
        abort_unless(Storage::disk('local')->exists($row->path), 404, 'Không tìm thấy file mô hình.');

        return Storage::disk('local')->response($row->path, $row->name, [
            'Content-Type' => 'model/gltf-binary', 'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store', 'Content-Security-Policy' => "default-src 'none'",
        ]);
    }

    private function dto(object $asset): array
    {
        return ['id' => $asset->id, 'name' => $asset->name, 'url' => url('/modules/factory-management-3d/assets/'.$asset->id),
            'size_bytes' => $asset->size_bytes, 'triangles' => $asset->triangles];
    }
}

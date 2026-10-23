<?php

namespace Modules\FactoryManagement3D\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Modules\FactoryManagement3D\Models\Factory;

class LayoutStore
{
    public static function empty(): array
    {
        return ['schema_version' => 1, 'floors' => [], 'zones' => [], 'objects' => []];
    }

    public function __construct(private FactoryAccess $access, private LayoutValidator $validator) {}

    public function read(Factory $factory, User $user, bool $draft = false): array
    {
        abort_if($draft && ! $this->access->canEdit($user, $factory), 403);
        $row = DB::table('fm3d_layouts')->where('factory_id', $factory->id)->first();

        return ['factory' => $this->access->dto($factory, $user), 'version' => $row?->version ?? 0,
            'published_version' => $row?->published_version,
            'layout' => $row && ($value = $draft ? $row->draft : $row->published) ? json_decode($value, true, 64, JSON_THROW_ON_ERROR) : self::empty(),
            'can_edit' => $this->access->canEdit($user, $factory)];
    }

    public function write(Factory $factory, User $user, int $expected, ?array $layout, bool $publish): array
    {
        DB::transaction(function () use ($factory, $user, $expected, $layout, $publish) {
            // Factory exists before first layout; locking it also serializes first insert.
            Factory::whereKey($factory->id)->lockForUpdate()->firstOrFail();
            $row = DB::table('fm3d_layouts')->where('factory_id', $factory->id)->lockForUpdate()->first();
            $version = $row?->version ?? 0;
            abort_if($version !== $expected, 409, 'Mặt bằng đã thay đổi. Hãy tải lại trước khi lưu.');
            abort_if($publish && $row === null, 422, 'Cần lưu bản nháp trước khi công bố.');
            $validated = $this->validator->validate($publish ? json_decode($row->draft, true, 64, JSON_THROW_ON_ERROR) : $layout, $factory);
            $encoded = json_encode($validated, JSON_THROW_ON_ERROR);
            $values = ['version' => $version + 1, 'updated_at' => now()];
            $values[$publish ? 'published' : 'draft'] = $encoded;
            if ($publish) {
                $values['published_version'] = $version + 1;
            }
            if ($row) {
                $changed = DB::table('fm3d_layouts')->where('id', $row->id)->where('version', $expected)->update($values);
                abort_unless($changed === 1, 409);
            } else {
                DB::table('fm3d_layouts')->insert([...$values, 'factory_id' => $factory->id, 'created_at' => now()]);
            }
            $this->access->audit($factory, $user, $publish ? 'layout.published' : 'layout.saved', ['version' => $version + 1]);
        });

        return $this->read($factory, $user, true);
    }
}

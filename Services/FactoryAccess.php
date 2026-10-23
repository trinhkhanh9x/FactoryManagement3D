<?php

namespace Modules\FactoryManagement3D\Services;

use App\Models\Line;
use App\Models\User;
use App\Models\Workstation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\FactoryManagement3D\Models\Factory;

class FactoryAccess
{
    public function query(User $user): Builder
    {
        $query = Factory::query()->where('tenant_id', $user->tenant_id);
        if (! $user->hasRole('Admin')) {
            $query->whereIn('id', DB::table('fm3d_members')->where('user_id', $user->id)->select('factory_id'));
        }

        return $query;
    }

    public function factory(User $user, int $id, bool $edit = false): Factory
    {
        $factory = $this->query($user)->findOrFail($id);
        abort_if($edit && ! $this->canEdit($user, $factory), 403);

        return $factory;
    }

    public function admin(User $user): void
    {
        abort_unless($user->hasRole('Admin'), 403);
    }

    public function canEdit(User $user, Factory $factory): bool
    {
        return $user->hasRole('Admin') || DB::table('fm3d_members')->where('factory_id', $factory->id)
            ->where('user_id', $user->id)->where('can_edit_layout', true)->exists();
    }

    public function lineIds(Factory $factory): array
    {
        return Line::withoutGlobalScopes()->where('tenant_id', $factory->tenant_id)->whereNull('deleted_at')
            ->whereIn('id', DB::table('fm3d_lines')->where('factory_id', $factory->id)->select('line_id'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    public function stations(Factory $factory): Builder
    {
        return Workstation::query()->whereIn('line_id', $this->lineIds($factory));
    }

    public function dto(Factory $factory, User $user): array
    {
        $lines = $this->lineIds($factory);

        return [...$factory->only(['id', 'code', 'name', 'timezone', 'is_active']), 'line_ids' => $lines,
            'can_edit' => $this->canEdit($user, $factory),
            'workstation_count' => Workstation::query()->whereIn('line_id', $lines)->count()];
    }

    public function catalogDtos(Collection $factories, User $user): array
    {
        $ids = $factories->pluck('id')->all();
        $links = DB::table('fm3d_lines as fl')->join('lines as l', 'l.id', '=', 'fl.line_id')
            ->whereIn('fl.factory_id', $ids)->where('l.tenant_id', $user->tenant_id)->whereNull('l.deleted_at')
            ->get(['fl.factory_id', 'fl.line_id']);
        $groups = $links->groupBy('factory_id');
        $counts = Workstation::query()->whereIn('line_id', $links->pluck('line_id'))
            ->select('line_id')->selectRaw('COUNT(*) as total')->groupBy('line_id')->pluck('total', 'line_id');
        $admin = $user->hasRole('Admin');
        $editable = $admin ? collect() : DB::table('fm3d_members')->whereIn('factory_id', $ids)
            ->where('user_id', $user->id)->where('can_edit_layout', true)->pluck('factory_id');

        return $factories->map(function ($factory) use ($groups, $counts, $admin, $editable) {
            $lines = $groups->get($factory->id, collect())->pluck('line_id')->map(fn ($id) => (int) $id)->all();

            return [...$factory->only(['id', 'code', 'name', 'timezone', 'is_active']), 'line_ids' => $lines,
                'can_edit' => $admin || $editable->contains($factory->id),
                'workstation_count' => array_sum(array_map(fn ($line) => (int) $counts->get($line, 0), $lines))];
        })->all();
    }

    public function audit(Factory $factory, User $user, string $action, array $details = []): void
    {
        DB::table('fm3d_audits')->insert(['factory_id' => $factory->id, 'user_id' => $user->id,
            'action' => $action, 'details' => json_encode($details, JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }
}

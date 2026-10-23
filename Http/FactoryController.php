<?php

namespace Modules\FactoryManagement3D\Http;

use App\Models\Line;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Modules\FactoryManagement3D\Models\Factory;
use Modules\FactoryManagement3D\Services\FactoryAccess;

class FactoryController
{
    public function __construct(private FactoryAccess $access) {}

    public static function success(mixed $data, int $status = 200)
    {
        return response()->json(['success' => true, 'data' => $data, 'error' => null, 'meta' => (object) []], $status);
    }

    public function index(Request $request)
    {
        if ($request->route('factory') !== null) {
            $this->access->factory($request->user(), (int) $request->route('factory'));
        }

        return Inertia::render('FactoryManagement3D/Workspace', [
            'basePath' => '/modules/factory-management-3d', 'csrf_token' => csrf_token(),
            'initialFactoryId' => $request->route('factory') !== null ? (int) $request->route('factory') : null,
        ]);
    }

    public function catalog(Request $request)
    {
        $user = $request->user();
        $admin = $user->hasRole('Admin');
        $factories = $this->access->query($user)->orderBy('name')->get();
        $links = DB::table('fm3d_lines')->whereIn('factory_id', $factories->pluck('id'))->pluck('factory_id', 'line_id');
        $lines = Line::withoutGlobalScopes()->where('tenant_id', $user->tenant_id)->whereNull('deleted_at');
        if (! $admin) {
            $lines->whereIn('id', $links->keys());
        }
        $users = $admin ? User::withoutGlobalScopes()->where('tenant_id', $user->tenant_id)->whereNull('deleted_at')
            ->role(['Admin', 'Supervisor'])->orderBy('name')->get(['id', 'name'])->toArray() : [];

        return self::success(['factories' => $this->access->catalogDtos($factories, $user),
            'lines' => $lines->orderBy('name')->get(['id', 'code', 'name'])->map(fn ($l) => [...$l->only(['id', 'code', 'name']), 'factory_id' => $links->get($l->id)])->all(),
            'users' => $users, 'is_admin' => $admin]);
    }

    public function save(Request $request, ?int $factory = null)
    {
        $user = $request->user();
        $this->access->admin($user);
        $existing = $factory ? $this->access->factory($user, $factory, true) : null;
        $data = $request->validate(['code' => 'required|string|max:80', 'name' => 'required|string|max:200',
            'timezone' => 'required|timezone:all', 'is_active' => 'required|boolean',
            'line_ids' => 'present|array|max:1000', 'line_ids.*' => 'integer|min:1|distinct']);
        $this->validateLines($data['line_ids'], $user, $existing);
        $duplicate = Factory::where('tenant_id', $user->tenant_id)->where('code', $data['code']);
        if ($existing) {
            $duplicate->whereKeyNot($existing->id);
        }
        if ($duplicate->exists()) {
            throw ValidationException::withMessages(['code' => 'Mã xưởng đã tồn tại.']);
        }
        try {
            $saved = DB::transaction(function () use ($existing, $data, $user) {
                if ($existing) {
                    Factory::whereKey($existing->id)->lockForUpdate()->firstOrFail();
                    $this->assertRemovedLinesUnplaced($existing, $data['line_ids']);
                }
                $saved = $existing ?? new Factory(['tenant_id' => $user->tenant_id]);
                $saved->fill(array_diff_key($data, ['line_ids' => true]))->save();
                DB::table('fm3d_lines')->where('factory_id', $saved->id)->delete();
                foreach ($data['line_ids'] as $line) {
                    DB::table('fm3d_lines')->insert(['factory_id' => $saved->id, 'line_id' => $line]);
                }
                $this->access->audit($saved, $user, $existing ? 'factory.updated' : 'factory.created', ['line_ids' => $data['line_ids']]);

                return $saved;
            });
        } catch (QueryException $e) {
            if (in_array($e->getCode(), ['23000', '23505'], true)) {
                $message = str_contains($e->getMessage(), 'fm3d_factories')
                    ? 'Mã xưởng đã được sử dụng bởi một thay đổi khác. Hãy tải lại.'
                    : 'Dây chuyền đã được gán bởi một thay đổi khác. Hãy tải lại.';
                abort(409, $message);
            }
            throw $e;
        }

        return self::success($this->access->dto($saved, $user), $existing ? 200 : 201);
    }

    private function validateLines(array $ids, User $user, ?Factory $factory): void
    {
        $valid = Line::withoutGlobalScopes()->whereNull('deleted_at')->where('tenant_id', $user->tenant_id)->whereIn('id', $ids)->count();
        $used = DB::table('fm3d_lines')->whereIn('line_id', $ids);
        if ($factory) {
            $used->where('factory_id', '!=', $factory->id);
        }
        if ($valid !== count($ids) || $used->exists()) {
            throw ValidationException::withMessages(['line_ids' => 'Dây chuyền không hợp lệ hoặc đã thuộc xưởng khác.']);
        }
    }

    private function assertRemovedLinesUnplaced(Factory $factory, array $ids): void
    {
        $stations = $this->access->stations($factory)->whereNotIn('line_id', $ids)->pluck('id')->all();
        $row = DB::table('fm3d_layouts')->where('factory_id', $factory->id)->first();
        foreach ([$row?->draft, $row?->published] as $json) {
            foreach ((json_decode($json ?? '{}', true)['objects'] ?? []) as $object) {
                if (in_array($object['workstation_id'] ?? null, $stations, true)) {
                    throw ValidationException::withMessages(['line_ids' => 'Cần gỡ máy khỏi bản nháp và công bố trước khi chuyển dây chuyền.']);
                }
            }
        }
    }

    public function members(Request $request, int $factory)
    {
        $user = $request->user();
        $this->access->admin($user);
        $record = $this->access->factory($user, $factory);
        if ($request->isMethod('put')) {
            $data = $request->validate(['members' => 'present|array|max:1000', 'members.*.user_id' => 'required|integer|min:1|distinct',
                'members.*.can_edit_layout' => 'required|boolean']);
            $ids = array_column($data['members'], 'user_id');
            $valid = User::withoutGlobalScopes()->whereNull('deleted_at')->where('tenant_id', $user->tenant_id)
                ->role(['Admin', 'Supervisor'])->whereIn('id', $ids)->count();
            if ($valid !== count($ids)) {
                throw ValidationException::withMessages(['members' => 'Người dùng phải cùng tenant và có vai trò Admin/Supervisor.']);
            }
            DB::transaction(function () use ($record, $data, $user) {
                Factory::whereKey($record->id)->lockForUpdate()->firstOrFail();
                DB::table('fm3d_members')->where('factory_id', $record->id)->delete();
                foreach ($data['members'] as $member) {
                    DB::table('fm3d_members')->insert(['factory_id' => $record->id, 'user_id' => $member['user_id'], 'can_edit_layout' => $member['can_edit_layout']]);
                }
                $this->access->audit($record, $user, 'members.updated', $data);
            });
        }

        return self::success(['members' => DB::table('fm3d_members')->where('factory_id', $factory)
            ->get(['user_id', 'can_edit_layout'])->map(fn ($m) => ['user_id' => $m->user_id, 'can_edit_layout' => (bool) $m->can_edit_layout])->all()]);
    }
}

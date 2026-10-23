<?php

namespace Modules\FactoryManagement3D\Tests;

use App\Models\Batch;
use App\Models\BatchStep;
use App\Models\Issue;
use App\Models\Line;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WorkOrder;
use App\Models\Workstation;
use App\Models\WorkstationState;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Modules\FactoryManagement3D\Models\Factory as FactoryRecord;
use Modules\FactoryManagement3D\Providers\FactoryManagement3DServiceProvider;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class FactoryApiTest extends TestCase
{
    use RefreshDatabase;

    private string $base = '/modules/factory-management-3d';

    protected function setUp(): void
    {
        parent::setUp();
        (require __DIR__.'/../database/migrations/2026_10_19_000001_create_fm3d_tables.php')->up();
        DB::table('system_settings')->updateOrInsert(['key' => 'modules_enabled'], ['value' => '["FactoryManagement3D"]']);
        $this->app->register(FactoryManagement3DServiceProvider::class);
        foreach (['Admin', 'Supervisor', 'Operator'] as $role) {
            Role::findOrCreate($role, 'web');
        }
    }

    private function actor(string $role = 'Admin', ?int $tenant = null): User
    {
        $user = User::factory()->create(['tenant_id' => $tenant]);
        $user->assignRole($role);

        return $user;
    }

    private function factory(array $extra = []): int
    {
        return $this->postJson($this->base.'/factories', [...['code' => 'F-1', 'name' => 'Xưởng 🏭', 'timezone' => 'Asia/Ho_Chi_Minh', 'is_active' => true, 'line_ids' => []], ...$extra])
            ->assertSuccessful()->json('data.id');
    }

    public function test_catalog_does_not_expose_sensitive_users_or_null_tenant_escape(): void
    {
        $this->actingAs($this->actor());
        $this->factory();
        $data = $this->getJson($this->base.'/catalog')->assertOk()->json('data');
        $this->assertCount(1, $data['factories']);
        $this->assertSame(['id', 'name'], array_keys($data['users'][0]));
        $this->assertFalse(array_key_exists('email', $data['users'][0]));
    }

    public function test_supervisor_requires_assignment_and_separate_edit_permission(): void
    {
        $this->actingAs($this->actor());
        $id = $this->factory();
        $sup = $this->actor('Supervisor');
        $this->actingAs($sup)->getJson("$this->base/factories/$id/layout")->assertNotFound();
        DB::table('fm3d_members')->insert(['factory_id' => $id, 'user_id' => $sup->id, 'can_edit_layout' => false]);
        $this->getJson("$this->base/factories/$id/layout")->assertOk();
        $this->getJson("$this->base/factories/$id/layout?draft=1")->assertForbidden();
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 0, 'layout' => self::emptyLayout()])->assertForbidden();
        $this->getJson("$this->base/factories/$id/members")->assertForbidden();
    }

    public static function emptyLayout(): array
    {
        return ['schema_version' => 1, 'floors' => [], 'zones' => [], 'objects' => []];
    }

    public function test_cas_and_published_copy_preserve_last_published_layout(): void
    {
        $this->actingAs($this->actor());
        $id = $this->factory();
        $layout = self::emptyLayout();
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 0, 'layout' => $layout])->assertOk()->assertJsonPath('data.version', 1);
        $this->postJson("$this->base/factories/$id/layout/publish", ['expected_version' => 0])->assertConflict();
        $this->postJson("$this->base/factories/$id/layout/publish", ['expected_version' => 1])->assertOk();
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 2, 'layout' => $layout])->assertOk();
        $this->getJson("$this->base/factories/$id/layout")->assertOk()->assertJsonPath('data.published_version', 2);
    }

    public function test_snapshot_includes_untagged_station_without_inventing_state(): void
    {
        $this->actingAs($this->actor());
        $line = Line::factory()->create();
        $station = Workstation::factory()->create(['line_id' => $line->id]);
        $id = $this->factory(['line_ids' => [$line->id]]);
        $this->getJson("$this->base/factories/$id/snapshot")->assertOk()
            ->assertJsonPath('data.stations.0.id', $station->id)
            ->assertJsonPath('data.stations.0.state', 'UNKNOWN')
            ->assertJsonPath('data.stations.0.active_operations', []);
    }

    public function test_cached_routes_deny_disabled_module_and_operator(): void
    {
        $this->actingAs($this->actor('Operator'))->getJson($this->base.'/catalog')->assertForbidden();
        $this->actingAs($this->actor());
        DB::table('system_settings')->where('key', 'modules_enabled')->update(['value' => '[]']);
        $this->getJson($this->base.'/catalog')->assertNotFound();
    }

    public function test_rejects_unbounded_and_invalid_layout(): void
    {
        $this->actingAs($this->actor());
        $id = $this->factory();
        $layout = self::emptyLayout();
        $layout['floors'] = [['id' => 'f', 'name' => '', 'elevation' => 0, 'thickness' => 1, 'polygon' => [[0, 0], [1, 1], [0, 1], [1, 0]], 'verified' => false]];
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 0, 'layout' => $layout])->assertUnprocessable();
    }

    public function test_tenant_and_null_tenant_are_exact_boundaries(): void
    {
        $tenant = Tenant::factory()->create();
        $foreign = $this->actor('Admin', $tenant->id);
        $this->actingAs($foreign);
        $line = Line::factory()->create(['tenant_id' => $tenant->id]);
        $foreignFactory = $this->factory(['line_ids' => [$line->id]]);
        $local = $this->actor();
        // Creating under authenticated tenant stamps tenant by core trait; reset
        // explicitly to test a legacy NULL tenant account.
        DB::table('users')->where('id', $local->id)->update(['tenant_id' => null]);
        $local->refresh();
        $this->actingAs($local);
        $this->getJson($this->base.'/catalog')->assertOk()->assertJsonCount(0, 'data.factories')->assertJsonCount(0, 'data.lines');
        foreach (['layout', 'snapshot', 'assets', 'members', 'workstations'] as $endpoint) {
            $this->getJson("$this->base/factories/$foreignFactory/$endpoint")->assertNotFound();
        }
        $this->factory(['code' => 'LOCAL']);
        $this->postJson($this->base.'/factories', ['code' => 'BAD', 'name' => 'Bad', 'timezone' => 'UTC', 'is_active' => true, 'line_ids' => [$line->id]])->assertUnprocessable();
    }

    public function test_unique_line_assignment_and_member_validation(): void
    {
        $this->actingAs($admin = $this->actor());
        $line = Line::factory()->create();
        $id = $this->factory(['line_ids' => [$line->id]]);
        $this->postJson($this->base.'/factories', ['code' => 'F2', 'name' => 'F2', 'timezone' => 'UTC', 'is_active' => true, 'line_ids' => [$line->id]])->assertUnprocessable();
        $operator = $this->actor('Operator');
        $this->putJson("$this->base/factories/$id/members", ['members' => [['user_id' => $operator->id, 'can_edit_layout' => true]]])->assertUnprocessable();
        $sup = $this->actor('Supervisor');
        $this->putJson("$this->base/factories/$id/members", ['members' => [['user_id' => $sup->id, 'can_edit_layout' => true]]])->assertOk();
        $this->actingAs($sup)->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 0, 'layout' => self::emptyLayout()])->assertOk();
        $this->actingAs($admin)->putJson("$this->base/factories/$id/members", ['members' => []])->assertOk();
        $this->actingAs($sup)->getJson("$this->base/factories/$id/layout")->assertNotFound();
    }

    public function test_private_asset_authorization_and_invalid_upload(): void
    {
        Storage::fake('local');
        $this->actingAs($admin = $this->actor());
        $id = $this->factory();
        $valid = UploadedFile::fake()->createWithContent('machine.glb', GlbValidatorTest::glb(['asset' => ['version' => '2.0']]));
        $asset = $this->postJson("$this->base/factories/$id/assets", ['model' => $valid])->assertCreated()->json('data');
        $this->get($asset['url'])->assertOk()->assertHeader('Content-Type', 'model/gltf-binary');
        $this->actingAs($this->actor('Supervisor'))->getJson($asset['url'])->assertNotFound();
        $this->actingAs($admin)->postJson("$this->base/factories/$id/assets", ['model' => UploadedFile::fake()->createWithContent('bad.glb', 'not a glb')])->assertUnprocessable();
        $this->getJson("$this->base/factories/$id/assets")->assertOk()->assertJsonCount(1, 'data.assets');
    }

    private static function machineLayout(int $station): array
    {
        return ['schema_version' => 1, 'floors' => [['id' => 'f', 'name' => 'Tầng 1', 'elevation' => 0, 'thickness' => 0.2,
            'polygon' => [[0, 0], [10, 0], [10, 10], [0, 10]], 'verified' => false]], 'zones' => [],
            'objects' => [['id' => 'm', 'kind' => 'machine', 'label' => 'CNC', 'floor_id' => 'f', 'zone_id' => null,
                'workstation_id' => $station, 'asset_id' => null, 'position' => ['x' => 1, 'y' => 0, 'z' => 1],
                'rotation' => ['x' => 0, 'y' => 0, 'z' => 0], 'dimensions' => ['width' => 1, 'height' => 1, 'depth' => 1],
                'verified_position' => false, 'verified_geometry' => false]]];
    }

    public function test_layout_references_dimensions_and_line_move_safety(): void
    {
        $this->actingAs($this->actor());
        $line = Line::factory()->create();
        $station = Workstation::factory()->create(['line_id' => $line->id]);
        $id = $this->factory(['line_ids' => [$line->id]]);
        $layout = self::machineLayout($station->id);
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 0, 'layout' => $layout])->assertOk();
        $bad = $layout;
        $bad['objects'][0]['dimensions']['width'] = 0;
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 1, 'layout' => $bad])->assertUnprocessable();
        $bad = $layout;
        $bad['objects'][] = [...$layout['objects'][0], 'id' => 'dup'];
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 1, 'layout' => $bad])->assertUnprocessable();
        $this->patchJson("$this->base/factories/$id", ['code' => 'F-1', 'name' => 'F', 'timezone' => 'UTC', 'is_active' => true, 'line_ids' => []])->assertUnprocessable();
        $other = Workstation::factory()->create(['line_id' => Line::factory()->create()->id]);
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 1, 'layout' => self::machineLayout($other->id)])->assertUnprocessable();
        $this->assertDatabaseCount('fm3d_audits', 2);
    }

    public function test_multiple_active_operations_core_totals_and_partial_scope(): void
    {
        $this->actingAs($this->actor());
        $line = Line::factory()->create();
        $otherLine = Line::factory()->create();
        $station = Workstation::factory()->create(['line_id' => $line->id]);
        $otherStation = Workstation::factory()->create(['line_id' => $otherLine->id]);
        $id = $this->factory(['line_ids' => [$line->id]]);
        $order = WorkOrder::factory()->create(['line_id' => $line->id, 'planned_qty' => 100, 'produced_qty' => 30, 'due_date' => now()->subDay()]);
        $batch = Batch::factory()->create(['work_order_id' => $order->id]);
        BatchStep::factory()->count(2)->inProgress()->create(['batch_id' => $batch->id, 'workstation_id' => $station->id, 'passed_qty' => 40]);
        BatchStep::factory()->inProgress()->create(['batch_id' => $batch->id, 'workstation_id' => $otherStation->id, 'name' => 'PRIVATE-OTHER-STATION']);
        WorkstationState::create(['workstation_id' => $station->id, 'state' => 'STOPPED', 'source' => 'operator', 'started_at' => now()->subHour()]);
        $response = $this->getJson("$this->base/factories/$id/snapshot")->assertOk()
            ->assertJsonPath('data.stations.0.state', 'STOPPED')->assertJsonCount(2, 'data.stations.0.active_operations')
            ->assertJsonPath('data.orders.0.produced_qty', 30)->assertJsonPath('data.orders.0.partial_scope', true)
            ->assertJsonPath('data.orders.0.is_overdue', true);
        $this->assertStringNotContainsString('PRIVATE-OTHER-STATION', $response->getContent());
        $this->getJson("$this->base/factories/$id/orders/$order->id")->assertOk()->assertJsonCount(2, 'data.operations');
    }

    public function test_deep_link_and_station_catalog_and_factory_update(): void
    {
        $this->actingAs($this->actor());
        $id = $this->factory();
        $headers = ['X-Inertia' => 'true', 'X-Inertia-Version' => (string) app(\App\Http\Middleware\HandleInertiaRequests::class)->version(request())];
        $this->get("$this->base/factories/$id", $headers)
            ->assertOk()->assertJsonPath('component', 'FactoryManagement3D/Workspace')->assertJsonPath('props.initialFactoryId', $id);
        $this->get("$this->base", $headers)->assertOk()->assertJsonPath('props.initialFactoryId', null);
        $this->getJson("$this->base/factories/$id/workstations")->assertOk()->assertJsonPath('data.workstations', []);
        $this->patchJson("$this->base/factories/$id", ['code' => 'NEW', 'name' => 'Đổi tên', 'timezone' => 'UTC', 'is_active' => false, 'line_ids' => []])
            ->assertOk()->assertJsonPath('data.code', 'NEW')->assertJsonPath('data.is_active', false);
        $this->getJson("$this->base/factories/999999/layout")->assertNotFound()->assertJsonPath('success', false);
    }

    public function test_snapshot_bounds_historical_context_and_order_detail_pagination(): void
    {
        $this->actingAs($this->actor());
        $line = Line::factory()->create();
        $station = Workstation::factory()->create(['line_id' => $line->id]);
        $id = $this->factory(['line_ids' => [$line->id]]);
        $order = WorkOrder::factory()->done()->create(['line_id' => $line->id]);
        $batch = Batch::factory()->create(['work_order_id' => $order->id]);
        $rows = [];
        for ($i = 1; $i <= 205; $i++) {
            $rows[] = ['batch_id' => $batch->id, 'step_number' => $i, 'name' => 'Historical '.$i, 'workstation_id' => $station->id,
                'status' => 'DONE', 'completed_at' => now()->subMinutes(205 - $i), 'created_at' => now(), 'updated_at' => now()];
        }
        DB::table('batch_steps')->insert($rows);
        $this->getJson("$this->base/factories/$id/snapshot")->assertOk()->assertJsonCount(0, 'data.orders')
            ->assertJsonPath('data.stations.0.last_operation.step_name', 'Historical 205');
        $page = $this->getJson("$this->base/factories/$id/orders/$order->id")->assertOk()->assertJsonCount(200, 'data.operations')->json('data');
        $this->assertNotNull($page['next_cursor']);
        $this->getJson("$this->base/factories/$id/orders/$order->id?after_step_id=".$page['next_cursor'])
            ->assertOk()->assertJsonCount(5, 'data.operations')->assertJsonPath('data.next_cursor', null);
    }

    public function test_open_issues_and_timezone_due_date_boundary(): void
    {
        $this->travelTo(\Carbon\Carbon::parse('2026-10-19 18:00:00', 'UTC'));
        $this->actingAs($this->actor());
        $line = Line::factory()->create();
        $station = Workstation::factory()->create(['line_id' => $line->id]);
        $id = $this->factory(['line_ids' => [$line->id], 'timezone' => 'Asia/Ho_Chi_Minh']);
        $order = WorkOrder::factory()->create(['line_id' => $line->id, 'due_date' => '2026-10-19']);
        $batch = Batch::factory()->create(['work_order_id' => $order->id]);
        $step = BatchStep::factory()->inProgress()->create(['batch_id' => $batch->id, 'workstation_id' => $station->id]);
        Issue::factory()->create(['work_order_id' => $order->id, 'batch_step_id' => $step->id, 'title' => 'Kiểm tra dao']);
        $this->getJson("$this->base/factories/$id/snapshot")->assertOk()->assertJsonPath('data.summary.open_issues', 1)
            ->assertJsonPath('data.stations.0.issues.0.title', 'Kiểm tra dao')->assertJsonPath('data.orders.0.is_overdue', true);
        $this->travelBack();
    }

    public static function localOrCrossLine(): array
    {
        return ['local line' => [false], 'cross line' => [true]];
    }

    #[DataProvider('localOrCrossLine')]
    public function test_order_keeps_its_last_local_station_after_another_order_uses_it(bool $crossLine): void
    {
        $this->actingAs($this->actor());
        $line = Line::factory()->create();
        $station = Workstation::factory()->create(['line_id' => $line->id]);
        $id = $this->factory(['line_ids' => [$line->id]]);
        $orderA = WorkOrder::factory()->create(['line_id' => $crossLine ? Line::factory()->create()->id : $line->id]);
        $orderB = WorkOrder::factory()->create(['line_id' => $line->id]);
        foreach ([[$orderA, now()->subHour()], [$orderB, now()]] as [$order, $completed]) {
            $batch = Batch::factory()->create(['work_order_id' => $order->id]);
            BatchStep::factory()->done()->create(['batch_id' => $batch->id, 'workstation_id' => $station->id, 'completed_at' => $completed]);
        }
        $orders = $this->getJson("$this->base/factories/$id/snapshot")->assertOk()->json('data.orders');
        $this->assertSame($station->id, collect($orders)->firstWhere('id', $orderA->id)['last_station_id'] ?? null);
        $this->getJson("$this->base/factories/$id/orders/$orderA->id")->assertOk()->assertJsonPath('data.last_station_id', $station->id);
    }

    public static function nullableTenants(): array
    {
        return ['legacy null tenant' => [false], 'assigned tenant' => [true]];
    }

    #[DataProvider('nullableTenants')]
    public function test_database_enforces_factory_code_uniqueness_even_when_application_check_is_bypassed(bool $assigned): void
    {
        $tenantId = $assigned ? Tenant::factory()->create()->id : null;
        $data = ['tenant_id' => $tenantId, 'code' => 'SAME', 'name' => 'Test', 'timezone' => 'UTC'];
        FactoryRecord::create($data);
        FactoryRecord::create([...$data, 'tenant_id' => Tenant::factory()->create()->id]);
        $this->expectException(QueryException::class);
        FactoryRecord::create($data);
    }

    public function test_catalog_query_count_does_not_grow_per_factory(): void
    {
        $this->actingAs($this->actor());
        $this->factory();
        DB::enableQueryLog();
        $this->getJson($this->base.'/catalog')->assertOk();
        $small = collect(DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'fm3d_'))->count();
        for ($i = 0; $i < 12; $i++) {
            FactoryRecord::create(['code' => 'EXTRA-'.$i, 'name' => 'Extra', 'timezone' => 'UTC']);
        }
        DB::flushQueryLog();
        $this->getJson($this->base.'/catalog')->assertOk()->assertJsonCount(13, 'data.factories');
        $large = collect(DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'fm3d_'))->count();
        DB::disableQueryLog();
        $this->assertLessThanOrEqual($small + 1, $large);
    }

    public function test_layout_canonicalizes_accepted_numeric_and_boolean_strings(): void
    {
        $this->actingAs($this->actor());
        $line = Line::factory()->create();
        $station = Workstation::factory()->create(['line_id' => $line->id]);
        $id = $this->factory(['line_ids' => [$line->id]]);
        $layout = self::machineLayout($station->id);
        $layout['floors'][0]['elevation'] = '2.5';
        $layout['floors'][0]['thickness'] = '0.25';
        $layout['floors'][0]['verified'] = '0';
        $layout['objects'][0]['verified_position'] = '0';
        $layout['objects'][0]['verified_geometry'] = '1';
        $this->putJson("$this->base/factories/$id/layout/draft", ['expected_version' => 0, 'layout' => $layout])
            ->assertOk()->assertJsonPath('data.layout.floors.0.elevation', 2.5)
            ->assertJsonPath('data.layout.floors.0.thickness', 0.25)->assertJsonPath('data.layout.floors.0.verified', false)
            ->assertJsonPath('data.layout.objects.0.verified_position', false)->assertJsonPath('data.layout.objects.0.verified_geometry', true);
        $stored = json_decode(DB::table('fm3d_layouts')->where('factory_id', $id)->value('draft'), true);
        $this->assertSame(2.5, $stored['floors'][0]['elevation']);
        $this->assertFalse($stored['objects'][0]['verified_position']);
        $this->postJson("$this->base/factories/$id/layout/publish", ['expected_version' => 1])->assertOk();
        $this->getJson("$this->base/factories/$id/layout")->assertOk()->assertJsonPath('data.layout.floors.0.elevation', 2.5)
            ->assertJsonPath('data.layout.floors.0.verified', false)->assertJsonPath('data.layout.objects.0.verified_geometry', true);
    }
}

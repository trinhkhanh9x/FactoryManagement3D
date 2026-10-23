<?php

$app = require __DIR__.'/test-app.php';
$db = $app['config']['database.connections.sqlite.database'];
Illuminate\Support\Facades\DB::purge('sqlite');
if (is_file($db)) {
    unlink($db);
}
touch($db);
Illuminate\Support\Facades\DB::purge('sqlite');
$app->make(Illuminate\Contracts\Console\Kernel::class)->call('migrate', ['--force' => true]);
if (! Illuminate\Support\Facades\Schema::hasTable('fm3d_factories')) {
    (require __DIR__.'/../database/migrations/2026_10_19_000001_create_fm3d_tables.php')->up();
}
use App\Models\Batch;
use App\Models\BatchStep;
use App\Models\Line;
use App\Models\User;
use App\Models\WorkOrder;
use App\Models\Workstation;
use App\Models\WorkstationState;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;

DB::table('system_settings')->updateOrInsert(['key' => 'modules_enabled'], ['value' => '["FactoryManagement3D"]']);
DB::table('system_settings')->updateOrInsert(['key' => 'plant_timezone'], ['value' => 'Asia/Ho_Chi_Minh']);
foreach (['Admin', 'Supervisor', 'Operator'] as $role) {
    Role::findOrCreate($role, 'web');
}
foreach (['admin' => 'Admin', 'supervisor' => 'Supervisor', 'operator' => 'Operator'] as $actor => $role) {
    $user = User::factory()->create(['name' => 'E2E '.$role, 'email' => $actor.'@fm3d.test', 'tenant_id' => null]);
    $user->assignRole($role);
    $actors[$actor] = $user->id;
}
foreach (['A', 'B', 'C'] as $suffix) {
    $line = Line::factory()->create(['code' => 'E2E-LINE-'.$suffix, 'name' => 'E2E Line '.$suffix, 'tenant_id' => null]);
    $lines[$suffix] = $line->id;
}
foreach (['A1', 'A2', 'A3', 'B1'] as $code) {
    $station = Workstation::factory()->create(['code' => 'E2E-'.$code, 'name' => 'E2E Machine '.$code, 'line_id' => $lines[$code[0]]]);
    $stations[$code] = $station->id;
}
$now = now();
foreach (['A', 'B'] as $suffix) {
    $id = DB::table('fm3d_factories')->insertGetId(['tenant_id' => null, 'code' => 'E2E-'.$suffix, 'name' => 'E2E Factory '.$suffix, 'timezone' => 'Asia/Ho_Chi_Minh', 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
    $factories[$suffix] = $id;
    DB::table('fm3d_lines')->insert(['factory_id' => $id, 'line_id' => $lines[$suffix]]);
}
DB::table('fm3d_members')->insert(['factory_id' => $factories['A'], 'user_id' => $actors['supervisor'], 'can_edit_layout' => false]);
$order = WorkOrder::factory()->inProgress()->create(['order_no' => 'E2E-WO-100', 'line_id' => $lines['A'], 'planned_qty' => 100, 'produced_qty' => 30, 'due_date' => now()->subDay(), 'tenant_id' => null]);
$batch = Batch::factory()->create(['work_order_id' => $order->id]);
BatchStep::factory()->inProgress()->create(['batch_id' => $batch->id, 'workstation_id' => $stations['A1'], 'name' => 'E2E TURN', 'passed_qty' => 40]);
BatchStep::factory()->inProgress()->create(['batch_id' => $batch->id, 'workstation_id' => $stations['A1'], 'name' => 'E2E INSPECT', 'passed_qty' => 40]);
BatchStep::factory()->inProgress()->create(['batch_id' => $batch->id, 'workstation_id' => $stations['B1'], 'name' => 'PRIVATE-B-OPERATION']);
WorkstationState::create(['workstation_id' => $stations['A1'], 'state' => 'STOPPED', 'source' => 'operator', 'started_at' => now()->subHour()]);
foreach (['A', 'B'] as $suffix) {
    $floor = ['id' => 'ground', 'name' => 'E2E Ground', 'elevation' => 0, 'thickness' => 0.2, 'polygon' => [[0, 0], [30, 0], [30, 20], [0, 20]], 'verified' => false];
    $upper = [...$floor, 'id' => 'upper', 'name' => 'E2E Upper', 'elevation' => 5];
    $code = $suffix.'1';
    $machine = ['id' => 'machine-'.$code, 'kind' => 'machine', 'label' => 'E2E '.$code, 'floor_id' => 'ground', 'zone_id' => null, 'workstation_id' => $stations[$code], 'asset_id' => null, 'position' => ['x' => 5, 'y' => 0, 'z' => 5], 'rotation' => ['x' => 0, 'y' => 30, 'z' => 0], 'dimensions' => ['width' => 2, 'height' => 3, 'depth' => 4], 'verified_position' => false, 'verified_geometry' => false];
    $layout = ['schema_version' => 1, 'floors' => [$floor, $upper], 'zones' => [], 'objects' => [$machine]];
    DB::table('fm3d_layouts')->insert(['factory_id' => $factories[$suffix], 'version' => 1, 'published_version' => 1, 'draft' => json_encode($layout), 'published' => json_encode($layout), 'created_at' => $now, 'updated_at' => $now]);
}
$files = new Illuminate\Filesystem\Filesystem;
foreach (['build', 'fonts', 'images'] as $dir) {
    if (is_dir($backend.'/public/'.$dir)) {
        $files->copyDirectory($backend.'/public/'.$dir, $testRoot.'/public/'.$dir);
    }
}
foreach (glob($backend.'/public/*') as $file) {
    if (is_file($file) && pathinfo($file, PATHINFO_EXTENSION) !== 'php') {
        copy($file, $testRoot.'/public/'.basename($file));
    }
}
$app->make(App\Services\ModuleManager::class)->publishAssets('FactoryManagement3D');
file_put_contents($testRoot.'/storage/installed', 'e2e-test-only');
// One real glTF triangle (binary positions) exercises protected loading without external assets.
$binary = pack('f*', 0, 0, 0, 1, 0, 0, 0, 1, 0);
$json = json_encode(['asset' => ['version' => '2.0'], 'scene' => 0, 'scenes' => [['nodes' => [0]]], 'nodes' => [['mesh' => 0]], 'meshes' => [['primitives' => [['attributes' => ['POSITION' => 0]]]]], 'buffers' => [['byteLength' => strlen($binary)]], 'bufferViews' => [['buffer' => 0, 'byteOffset' => 0, 'byteLength' => strlen($binary)]], 'accessors' => [['bufferView' => 0, 'componentType' => 5126, 'count' => 3, 'type' => 'VEC3', 'min' => [0, 0, 0], 'max' => [1, 1, 0]]]]);
$json = str_pad($json, (int) ceil(strlen($json) / 4) * 4, ' ');
$glb = 'glTF'.pack('V2', 2, 12 + 8 + strlen($json) + 8 + strlen($binary)).pack('V2', strlen($json), 0x4E4F534A).$json.pack('V2', strlen($binary), 0x004E4942).$binary;
file_put_contents($testRoot.'/triangle.glb', $glb);
file_put_contents($testRoot.'/fixture.json', json_encode(compact('actors', 'lines', 'stations', 'factories')));
echo "Isolated E2E fixture ready.\n";

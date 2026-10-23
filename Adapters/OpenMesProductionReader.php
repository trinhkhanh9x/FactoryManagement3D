<?php

namespace Modules\FactoryManagement3D\Adapters;

use App\Models\BatchStep;
use App\Models\Issue;
use App\Models\WorkOrder;
use App\Models\WorkstationState;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\FactoryManagement3D\Contracts\ProductionReader;
use Modules\FactoryManagement3D\Models\Factory;
use Modules\FactoryManagement3D\Services\FactoryAccess;

/** Read-only adapter; no operational state or quantity is inferred or written. */
class OpenMesProductionReader implements ProductionReader
{
    public function __construct(private FactoryAccess $access) {}

    public function snapshot(Factory $factory): array
    {
        $stations = $this->access->stations($factory)->with('line:id,name')->orderBy('code')->get();
        $ids = $stations->pluck('id')->all();
        $operations = $this->currentOperations($factory, $ids)->get();
        $grouped = $operations->groupBy('workstation_id');
        $states = WorkstationState::query()->whereIn('workstation_id', $ids)->whereNull('ended_at')
            ->orderByDesc('started_at')->orderByDesc('id')->get()->unique('workstation_id')->keyBy('workstation_id');
        $issues = $this->issues($factory, $ids);
        $rows = $stations->map(function ($station) use ($grouped, $states, $issues) {
            $steps = $grouped->get($station->id, collect());
            $state = $states->get($station->id);

            return ['id' => $station->id, 'code' => $station->code, 'name' => $station->name,
                'line_id' => $station->line_id, 'line_name' => $station->line?->name,
                'state' => $state?->state ?? 'UNKNOWN', 'state_source' => $state?->source,
                'state_since' => $state?->started_at?->toIso8601String(),
                'active_operations' => $steps->where('status', BatchStep::STATUS_IN_PROGRESS)->map(fn ($s) => $this->operation($s))->values()->all(),
                'last_operation' => ($last = $steps->whereNotNull('completed_at')->sortByDesc('completed_at')->first()) ? $this->operation($last) : null,
                'issues' => $issues->get($station->id, collect())->all()];
        })->all();
        $orders = $this->orders($factory, $operations);
        $layout = DB::table('fm3d_layouts')->where('factory_id', $factory->id)->first();

        return ['factory_id' => $factory->id, 'fetched_at' => now()->toIso8601String(),
            'layout_revision' => $layout?->published_version, 'stations' => $rows, 'orders' => $orders,
            'summary' => ['total_machines' => count($rows), 'running' => collect($rows)->where('state', 'RUNNING')->count(),
                'unknown' => collect($rows)->where('state', 'UNKNOWN')->count(),
                'active_orders' => collect($orders)->whereNotIn('status', WorkOrder::TERMINAL_STATUSES)->count(),
                'overdue_orders' => collect($orders)->where('is_overdue', true)->count(),
                'open_issues' => $issues->flatten(1)->unique('id')->count()]];
    }

    private function operations(Factory $factory, array $stations)
    {
        return BatchStep::query()->whereIn('workstation_id', $stations)
            ->whereHas('batch', fn ($q) => $q->where('status', '!=', 'CANCELLED')->whereHas('workOrder',
                fn ($o) => $o->withoutGlobalScopes()->whereNull('deleted_at')->where('tenant_id', $factory->tenant_id)))
            ->with(['batch' => fn ($q) => $q->with(['workOrder' => fn ($o) => $o->withoutGlobalScopes()->whereNull('deleted_at')->where('tenant_id', $factory->tenant_id)])]);
    }

    private function currentOperations(Factory $factory, array $stations)
    {
        $ranked = DB::table('batch_steps as fs')->join('batches as fb', 'fb.id', '=', 'fs.batch_id')
            ->join('work_orders as fo', 'fo.id', '=', 'fb.work_order_id')
            ->whereNull('fs.deleted_at')->whereNull('fb.deleted_at')->whereNull('fo.deleted_at')
            ->where('fo.tenant_id', $factory->tenant_id)->where('fb.status', '!=', 'CANCELLED')
            ->whereIn('fs.workstation_id', $stations)->whereNotNull('fs.completed_at')->select('fs.id')
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY fs.workstation_id ORDER BY fs.completed_at DESC, fs.id DESC) AS recency');
        $latest = DB::query()->fromSub($ranked, 'ranked_steps')->where('recency', 1)->select('id');

        return $this->operations($factory, $stations)->where(fn ($q) => $q->where('status', BatchStep::STATUS_IN_PROGRESS)->orWhereIn('id', $latest));
    }

    public function order(Factory $factory, int $id, int $afterStep = 0): array
    {
        $stations = $this->access->stations($factory)->pluck('id')->all();
        $scoped = fn ($q) => $q->where('work_order_id', $id);
        $current = $this->currentOperations($factory, $stations)->whereHas('batch', $scoped)->get();
        $orders = $this->orders($factory, $current, $id);
        abort_unless(count($orders) === 1, 404);
        $page = $this->operations($factory, $stations)->whereHas('batch', $scoped)->where('id', '>', $afterStep)->orderBy('id')->limit(201)->get();
        $hasMore = $page->count() > 200;
        $operations = $page->take(200);

        return [...$orders[0], 'operations' => $operations->map(fn ($step) => $this->operation($step))->values()->all(),
            'next_cursor' => $hasMore ? $operations->last()->id : null];
    }

    private function orders(Factory $factory, Collection $operations, ?int $onlyId = null): array
    {
        $lineIds = $this->access->lineIds($factory);
        $localIds = $this->access->stations($factory)->pluck('id')->all();
        $query = WorkOrder::withoutGlobalScopes()->whereNull('deleted_at')->where('tenant_id', $factory->tenant_id)
            ->where(fn ($q) => $q->whereIn('line_id', $lineIds)->orWhereHas('batches', fn ($b) => $b->where('status', '!=', 'CANCELLED')
                ->whereHas('steps', fn ($s) => $s->whereIn('workstation_id', $localIds))));
        if ($onlyId !== null) {
            // Orders linked only through older local history are still accessible.
            $query->whereKey($onlyId);
        } else {
            $activeIds = $operations->where('status', BatchStep::STATUS_IN_PROGRESS)->map(fn ($s) => $s->batch->work_order_id)->unique()->all();
            $query->where(fn ($q) => $q->whereNotIn('status', WorkOrder::TERMINAL_STATUSES)->orWhereIn('id', $activeIds));
        }
        $orders = $query->orderBy('order_no')->get();
        $latestStations = $this->latestOrderStations($orders->pluck('id')->all(), $localIds);
        // Only the existence of outside operations is returned, never their IDs/names.
        $outside = DB::table('batch_steps as bs')->join('batches as b', 'b.id', '=', 'bs.batch_id')
            ->whereNull('bs.deleted_at')->whereNull('b.deleted_at')->where('b.status', '!=', 'CANCELLED')
            ->whereIn('b.work_order_id', $orders->pluck('id'))->whereNotNull('bs.workstation_id')
            ->whereNotIn('bs.workstation_id', $localIds)->distinct()->pluck('b.work_order_id')->all();
        $groups = $operations->groupBy(fn ($step) => $step->batch->work_order_id);
        $today = CarbonImmutable::now($factory->timezone)->toDateString();

        return $orders->map(function ($order) use ($groups, $outside, $lineIds, $today, $latestStations) {
            $steps = $groups->get($order->id, collect());
            $due = $order->due_date?->format('Y-m-d');

            return ['id' => $order->id, 'order_no' => $order->order_no, 'status' => $order->status,
                'planned_qty' => (float) $order->planned_qty, 'produced_qty' => (float) $order->produced_qty,
                'progress_pct' => $order->planned_qty > 0 ? min(100, round(100 * $order->produced_qty / $order->planned_qty, 2)) : 0,
                'due_date' => $due, 'is_overdue' => $due !== null && $due < $today && ! in_array($order->status, WorkOrder::TERMINAL_STATUSES, true),
                'active_station_ids' => $steps->where('status', BatchStep::STATUS_IN_PROGRESS)->pluck('workstation_id')->unique()->values()->all(),
                'last_station_id' => $latestStations->get($order->id),
                'partial_scope' => in_array($order->id, $outside, true) || ! in_array($order->line_id, $lineIds, true),
                'url' => url('/supervisor/work-orders/'.$order->id)];
        })->all();
    }

    private function latestOrderStations(array $orderIds, array $stationIds): Collection
    {
        $ranked = DB::table('batch_steps as fs')->join('batches as fb', 'fb.id', '=', 'fs.batch_id')
            ->whereNull('fs.deleted_at')->whereNull('fb.deleted_at')->where('fb.status', '!=', 'CANCELLED')
            ->whereIn('fb.work_order_id', $orderIds)->whereIn('fs.workstation_id', $stationIds)->whereNotNull('fs.completed_at')
            ->select('fb.work_order_id', 'fs.workstation_id')
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY fb.work_order_id ORDER BY fs.completed_at DESC, fs.id DESC) AS recency');

        return DB::query()->fromSub($ranked, 'ranked_orders')->where('recency', 1)->pluck('workstation_id', 'work_order_id');
    }

    private function operation(BatchStep $step): array
    {
        return ['step_id' => $step->id, 'batch_id' => $step->batch_id, 'batch_number' => $step->batch->batch_number,
            'lot_number' => $step->batch->lot_number, 'work_order_id' => $step->batch->work_order_id,
            'order_no' => $step->batch->workOrder?->order_no, 'step_name' => $step->name, 'status' => $step->status,
            'passed_qty' => (float) $step->passed_qty, 'scrap_qty' => (float) $step->scrap_qty,
            'started_at' => $step->started_at?->toIso8601String(), 'completed_at' => $step->completed_at?->toIso8601String(),
            'workstation_id' => $step->workstation_id];
    }

    private function issues(Factory $factory, array $stationIds): Collection
    {
        return Issue::query()->whereIn('status', [Issue::STATUS_OPEN, Issue::STATUS_ACKNOWLEDGED])
            ->where(fn ($q) => $q->whereHas('batchStep', fn ($s) => $s->whereIn('workstation_id', $stationIds))
                ->orWhereHas('productionDowntime', fn ($d) => $d->whereIn('workstation_id', $stationIds)))
            ->where(fn ($q) => $q->whereHas('workOrder', fn ($o) => $o->withoutGlobalScopes()->whereNull('deleted_at')->where('tenant_id', $factory->tenant_id))
                ->orWhere(fn ($empty) => $empty->whereNull('work_order_id')->whereHas('productionDowntime',
                    fn ($d) => $d->withoutGlobalScopes()->where('tenant_id', $factory->tenant_id)->whereIn('workstation_id', $stationIds))))
            ->with(['batchStep:id,workstation_id', 'productionDowntime:id,workstation_id'])->get()
            ->map(fn ($i) => ['station_id' => $i->batchStep?->workstation_id ?? $i->productionDowntime?->workstation_id,
                'id' => $i->id, 'title' => $i->title, 'status' => $i->status, 'url' => url('/supervisor/issues')])
            ->groupBy('station_id')->map(fn ($items) => $items->map(fn ($i) => array_diff_key($i, ['station_id' => true])));
    }
}

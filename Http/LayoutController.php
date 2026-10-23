<?php

namespace Modules\FactoryManagement3D\Http;

use Illuminate\Http\Request;
use Modules\FactoryManagement3D\Services\FactoryAccess;
use Modules\FactoryManagement3D\Services\LayoutStore;
use Modules\FactoryManagement3D\Services\ProductionReadModel;

class LayoutController
{
    public function __construct(private FactoryAccess $access, private LayoutStore $store, private ProductionReadModel $production) {}

    public function show(Request $request, int $factory)
    {
        $record = $this->access->factory($request->user(), $factory);

        return FactoryController::success($this->store->read($record, $request->user(), $request->boolean('draft')));
    }

    public function save(Request $request, int $factory)
    {
        return $this->write($request, $factory, false);
    }

    public function publish(Request $request, int $factory)
    {
        return $this->write($request, $factory, true);
    }

    private function write(Request $request, int $factory, bool $publish)
    {
        $record = $this->access->factory($request->user(), $factory, true);
        $rules = ['expected_version' => 'required|integer|min:0|max:2147483646'];
        if (! $publish) {
            $rules['layout'] = 'required|array';
        }
        $data = $request->validate($rules);

        return FactoryController::success($this->store->write($record, $request->user(), $data['expected_version'], $data['layout'] ?? null, $publish));
    }

    public function stations(Request $request, int $factory)
    {
        $record = $this->access->factory($request->user(), $factory);

        return FactoryController::success(['workstations' => $this->access->stations($record)->orderBy('code')->get(['id', 'code', 'name', 'line_id'])->toArray()]);
    }

    public function snapshot(Request $request, int $factory)
    {
        return FactoryController::success($this->production->snapshot($this->access->factory($request->user(), $factory)));
    }

    public function order(Request $request, int $factory, int $order)
    {
        $data = $request->validate(['after_step_id' => 'nullable|integer|min:0']);

        return FactoryController::success($this->production->order($this->access->factory($request->user(), $factory), $order, (int) ($data['after_step_id'] ?? 0)));
    }
}

<?php

namespace Modules\FactoryManagement3D\Contracts;

use Modules\FactoryManagement3D\Models\Factory;

/** Returns the module snapshot/order payloads, scoped to the authorized factory. */
interface ProductionReader
{
    public function snapshot(Factory $factory): array;

    public function order(Factory $factory, int $id, int $afterStep = 0): array;
}

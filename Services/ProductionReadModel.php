<?php

namespace Modules\FactoryManagement3D\Services;

use Modules\FactoryManagement3D\Contracts\ProductionReader;
use Modules\FactoryManagement3D\Models\Factory;

/** Stable module facade; core-version-specific queries live behind the reader. */
class ProductionReadModel implements ProductionReader
{
    public function __construct(private ProductionReader $reader) {}

    public function snapshot(Factory $factory): array
    {
        return $this->reader->snapshot($factory);
    }

    public function order(Factory $factory, int $id, int $afterStep = 0): array
    {
        return $this->reader->order($factory, $id, $afterStep);
    }
}

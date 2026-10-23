<?php

namespace Modules\FactoryManagement3D\Tests;

use Modules\FactoryManagement3D\Adapters\OpenMesProductionReader;
use Modules\FactoryManagement3D\Contracts\ProductionReader;
use Modules\FactoryManagement3D\Models\Factory;
use Modules\FactoryManagement3D\Providers\FactoryManagement3DServiceProvider;
use Modules\FactoryManagement3D\Services\ProductionReadModel;
use Tests\TestCase;

class ProductionReaderContractTest extends TestCase
{
    public function test_provider_binds_default_reader_and_service_accepts_a_replacement(): void
    {
        $this->app->register(FactoryManagement3DServiceProvider::class);
        self::assertInstanceOf(OpenMesProductionReader::class, $this->app->make(ProductionReader::class));
        $factory = new Factory(['name' => 'Adapter contract']);
        $reader = \Mockery::mock(ProductionReader::class);
        $reader->shouldReceive('snapshot')->once()->with($factory)->andReturn(['stations' => [], 'orders' => []]);
        $reader->shouldReceive('order')->once()->with($factory, 51, 200)->andReturn(['id' => 51, 'next_cursor' => null]);
        $this->app->instance(ProductionReader::class, $reader);
        $service = $this->app->make(ProductionReadModel::class);

        self::assertSame(['stations' => [], 'orders' => []], $service->snapshot($factory));
        self::assertSame(['id' => 51, 'next_cursor' => null], $service->order($factory, 51, 200));
    }
}

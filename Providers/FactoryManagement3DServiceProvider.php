<?php

namespace Modules\FactoryManagement3D\Providers;

use App\Services\MenuRegistry;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Modules\FactoryManagement3D\Adapters\OpenMesProductionReader;
use Modules\FactoryManagement3D\Contracts\ProductionReader;

class FactoryManagement3DServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ProductionReader::class, OpenMesProductionReader::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/../database/migrations');
        $this->loadRoutesFrom(__DIR__.'/../routes.php');
        RateLimiter::for('fm3d-read', fn ($request) => Limit::perMinute(120)->by($request->user()?->id ?? $request->ip()));
        RateLimiter::for('fm3d-write', fn ($request) => Limit::perMinute(30)->by($request->user()?->id ?? $request->ip()));
        $menu = app(MenuRegistry::class);
        // A single destination uses the host's standard sidebar link, including
        // its font, icon sizing, hover, active and light/dark theme colors.
        $menu->addGroup('factory-management-3d', 'Nhà xưởng 3D', order: 45, url: url('/modules/factory-management-3d'));
    }
}

<?php

use Illuminate\Support\Facades\Route;
use Modules\FactoryManagement3D\Http\AssetController;
use Modules\FactoryManagement3D\Http\FactoryController;
use Modules\FactoryManagement3D\Http\LayoutController;
use Modules\FactoryManagement3D\Http\ModuleAccess;

Route::prefix('modules/factory-management-3d')->middleware(['web', 'auth', ModuleAccess::class])->name('fm3d.')->group(function () {
    Route::middleware('throttle:fm3d-read')->group(function () {
        Route::get('/', [FactoryController::class, 'index'])->name('index');
        Route::get('/catalog', [FactoryController::class, 'catalog'])->name('catalog');
        Route::get('/factories/{factory}', [FactoryController::class, 'index'])->whereNumber('factory')->name('factory');
        Route::get('/factories/{factory}/members', [FactoryController::class, 'members'])->whereNumber('factory')->name('members');
        Route::get('/factories/{factory}/layout', [LayoutController::class, 'show'])->whereNumber('factory')->name('layout');
        Route::get('/factories/{factory}/workstations', [LayoutController::class, 'stations'])->whereNumber('factory')->name('workstations');
        Route::get('/factories/{factory}/assets', [AssetController::class, 'index'])->whereNumber('factory')->name('assets');
        Route::get('/assets/{asset}', [AssetController::class, 'show'])->whereNumber('asset')->name('asset');
        Route::get('/factories/{factory}/snapshot', [LayoutController::class, 'snapshot'])->whereNumber('factory')->name('snapshot');
        Route::get('/factories/{factory}/orders/{order}', [LayoutController::class, 'order'])->whereNumber(['factory', 'order'])->name('order');
    });
    Route::middleware('throttle:fm3d-write')->group(function () {
        Route::post('/factories', [FactoryController::class, 'save'])->name('create');
        Route::patch('/factories/{factory}', [FactoryController::class, 'save'])->whereNumber('factory')->name('update');
        Route::put('/factories/{factory}/members', [FactoryController::class, 'members'])->whereNumber('factory')->name('members.save');
        Route::put('/factories/{factory}/layout/draft', [LayoutController::class, 'save'])->whereNumber('factory')->name('draft');
        Route::post('/factories/{factory}/layout/publish', [LayoutController::class, 'publish'])->whereNumber('factory')->name('publish');
        Route::post('/factories/{factory}/assets', [AssetController::class, 'upload'])->whereNumber('factory')->name('upload');
    });
});

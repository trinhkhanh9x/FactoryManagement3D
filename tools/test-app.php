<?php

/** Isolated local E2E harness. Never load the installation's .env or cached configuration. */
$backend = dirname(__DIR__, 3);
$testRoot = dirname($backend, 2).'/artifacts/FactoryManagement3D-1.0.0/e2e-runtime';
foreach (['cache', 'public', 'storage/framework/cache/data', 'storage/framework/sessions', 'storage/framework/views', 'storage/logs', 'storage/app/private'] as $dir) {
    if (! is_dir($testRoot.'/'.$dir)) {
        mkdir($testRoot.'/'.$dir, 0777, true);
    }
}
$statePath = $testRoot.'/.test-state.json';
if (! is_file($statePath)) {
    file_put_contents($statePath, json_encode(['key' => 'base64:'.base64_encode(random_bytes(32))]));
}
$testState = json_decode(file_get_contents($statePath), true, flags: JSON_THROW_ON_ERROR);
$env = ['APP_ENV' => 'testing', 'APP_DEBUG' => 'false', 'APP_URL' => 'http://127.0.0.1:19431',
    'APP_KEY' => $testState['key'], 'APP_CONFIG_CACHE' => $testRoot.'/cache/config.php',
    'APP_ROUTES_CACHE' => $testRoot.'/cache/routes.php', 'APP_PACKAGES_CACHE' => $testRoot.'/cache/packages.php',
    'APP_SERVICES_CACHE' => $testRoot.'/cache/services.php', 'APP_EVENTS_CACHE' => $testRoot.'/cache/events.php',
    'DB_CONNECTION' => 'sqlite', 'DB_URL' => '(null)',
    'DB_DATABASE' => $testRoot.'/test.sqlite', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'file',
    'SESSION_COOKIE' => 'fm3d_e2e_session', 'SESSION_SECURE_COOKIE' => 'false', 'QUEUE_CONNECTION' => 'sync',
    'BROADCAST_CONNECTION' => 'null', 'OPENMES_TELEMETRY' => 'false', 'LOG_CHANNEL' => 'single',
    'LARAVEL_STORAGE_PATH' => $testRoot.'/storage', 'MAIL_MAILER' => 'array'];
foreach ($env as $key => $value) {
    putenv($key.'='.$value);
    $_ENV[$key] = $_SERVER[$key] = $value;
}
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->addAbsoluteCachePathPrefix(substr($testRoot, 0, 3));
$app->loadEnvironmentFrom('.env.fm3d-e2e-disabled');
$app->useStoragePath($testRoot.'/storage');
$app->usePublicPath($testRoot.'/public');
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if ($app['config']['database.default'] !== 'sqlite' || $app['config']['database.connections.sqlite.database'] !== $testRoot.'/test.sqlite') {
    throw new RuntimeException('E2E isolation check failed.');
}

return $app;

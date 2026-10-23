<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$public = realpath(dirname(__DIR__, 5).'/artifacts/FactoryManagement3D-1.0.0/e2e-runtime/public');
$file = realpath($public.'/'.ltrim(rawurldecode($path), '/'));
if ($file && str_starts_with($file, $public.DIRECTORY_SEPARATOR) && is_file($file)) {
    $types = ['js' => 'text/javascript', 'css' => 'text/css', 'json' => 'application/json', 'png' => 'image/png', 'svg' => 'image/svg+xml', 'woff2' => 'font/woff2'];
    header('Content-Type: '.($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
    readfile($file);

    return;
}
$app = require __DIR__.'/test-app.php';
// Session bootstrap is test-only, local-only, and excluded from the distributable ZIP.
Illuminate\Support\Facades\Route::middleware('web')->get('/__e2e/login/{actor}', function (string $actor) use ($app) {
    abort_unless($app->environment('testing') && in_array(request()->ip(), ['127.0.0.1', '::1'], true), 404);
    abort_unless(in_array($actor, ['admin', 'supervisor', 'operator'], true), 404);
    $user = App\Models\User::where('email', $actor.'@fm3d.test')->firstOrFail();
    Illuminate\Support\Facades\Auth::login($user);
    request()->session()->regenerate();

    return redirect('/modules/factory-management-3d');
});
$app->handleRequest(Illuminate\Http\Request::capture());

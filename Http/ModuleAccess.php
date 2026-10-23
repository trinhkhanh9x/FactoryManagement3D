<?php

namespace Modules\FactoryManagement3D\Http;

use App\Services\ModuleManager;
use Closure;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

class ModuleAccess
{
    public function handle(Request $request, Closure $next)
    {
        try {
            // Re-read on every request, including cached routes and long-lived workers.
            abort_unless(in_array('FactoryManagement3D', app(ModuleManager::class)->enabledNames(), true), 404);
            abort_unless($request->user()?->hasAnyRole(['Admin', 'Supervisor']), 403);

            $response = $next($request);
            if ($request->expectsJson() && $response instanceof JsonResponse && $response->getStatusCode() >= 400) {
                $payload = $response->getData(true);
                if (! is_array($payload) || ! array_key_exists('success', $payload)) {
                    $status = $response->getStatusCode();
                    $message = $status === 404 ? 'Không tìm thấy dữ liệu.' : ($payload['message'] ?? 'Yêu cầu không được chấp nhận.');
                    if ($status >= 500 || ! is_string($message)) {
                        $message = 'Không thể xử lý yêu cầu. Vui lòng thử lại.';
                    }

                    return $this->error($status, $message, $payload['errors'] ?? [],
                        array_diff_key($response->headers->all(), array_flip(['content-type', 'content-length'])));
                }
            }

            return $response;
        } catch (ValidationException $e) {
            if (! $request->expectsJson()) {
                throw $e;
            }

            return $this->error(422, $e->getMessage(), $e->errors());
        } catch (ModelNotFoundException $e) {
            if (! $request->expectsJson()) {
                throw $e;
            }

            return $this->error(404, 'Không tìm thấy dữ liệu.');
        } catch (HttpExceptionInterface $e) {
            if (! $request->expectsJson()) {
                throw $e;
            }

            return $this->error($e->getStatusCode(), $e->getMessage() ?: 'Yêu cầu không được chấp nhận.');
        }
    }

    private function error(int $status, string $message, array $errors = [], array $headers = [])
    {
        return response()->json(['success' => false, 'data' => null, 'error' => $message,
            'message' => $message, 'errors' => $errors, 'meta' => (object) []], $status, $headers);
    }
}

<?php

namespace App\Http\Middleware;

use App\Services\RoleAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route check for Role Access: ->middleware('feature:stock.delete')
 *
 * Several names = all are needed. "a|b" inside one name = either is enough
 * (e.g. 'feature:forecast.view|calculator.use').
 * The Super Admin always passes.
 */
class EnsureFeatureAccess
{
    public function handle(Request $request, Closure $next, string ...$features): Response
    {
        $user = $request->user();
        abort_unless($user, 401);

        $allowed = RoleAccessService::effectiveFor($user);
        foreach ($features as $feature) {
            $anyOf = explode('|', $feature);
            $ok = false;
            foreach ($anyOf as $key) {
                if ($allowed[$key] ?? false) {
                    $ok = true;
                    break;
                }
            }
            abort_unless($ok, 403, 'Your role does not have access to this feature. Ask the Super Admin to turn it on in Settings → Role Access.');
        }

        return $next($request);
    }
}

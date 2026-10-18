<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserHasRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        abort_unless($user, 401);

        if ($user->status !== 'active') {
            abort(403, 'This account is inactive.');
        }

        $isConfiguredSuperAdmin = $user->role === 'super_admin'
            || (is_string(config('auth.super_admin_email'))
                && config('auth.super_admin_email') !== ''
                && hash_equals(strtolower(config('auth.super_admin_email')), strtolower($user->email)));
        $allowed = in_array($user->role, $roles, true)
            || ($isConfiguredSuperAdmin && in_array('super_admin', $roles, true));

        abort_unless($allowed, 403);

        return $next($request);
    }
}

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

        // The .env email only counts while nobody has the super_admin role
        // (see User::isConfiguredSuperAdminEmail, 2026-11-10).
        $isConfiguredSuperAdmin = $user->role === 'super_admin'
            || ($user instanceof \App\Models\User && $user->isConfiguredSuperAdminEmail());
        $allowed = in_array($user->role, $roles, true)
            || ($isConfiguredSuperAdmin && in_array('super_admin', $roles, true));

        abort_unless($allowed, 403);

        return $next($request);
    }
}

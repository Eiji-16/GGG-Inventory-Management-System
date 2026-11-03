<?php

namespace App\Http\Middleware;

use App\Support\AccountSignout;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user?->exists) {
            // Re-read the account on every request, so a deactivation or
            // deletion by the Super Admin takes effect immediately.
            $user = $user->fresh();
        }
        if ($user === null) {
            return $this->signOut($request, AccountSignout::DELETED);
        }

        if (method_exists($user, 'trashed') && $user->trashed()) {
            return $this->signOut($request, AccountSignout::DELETED);
        }

        if ($user->status !== 'active') {
            return $this->signOut($request, AccountSignout::DEACTIVATED);
        }

        $sessionVersion = (int) $request->session()->get('_account_auth_version', 0);
        if ($sessionVersion !== (int) $user->auth_version) {
            return $this->signOut($request, AccountSignout::ENDED);
        }

        $request->session()->put('_account_auth_version', (int) $user->auth_version);

        return $next($request);
    }

    private function signOut(Request $request, string $reason): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(AccountSignout::payload($reason), 401);
    }
}

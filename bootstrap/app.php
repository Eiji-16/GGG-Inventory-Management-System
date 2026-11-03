<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\EnsureFeatureAccess;
use App\Http\Middleware\EnsureUserHasRole;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'active' => EnsureActiveUser::class,
            'role' => EnsureUserHasRole::class,
            'feature' => EnsureFeatureAccess::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // A browser whose account was just deactivated or deleted gets the
        // reason with its "not signed in" answer, so the screen can show the
        // "You've been signed out" pop-up (see App\Support\AccountSignout).
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $exception, \Illuminate\Http\Request $request) {
            if (! $request->expectsJson() || ! $request->hasSession()) {
                return null;
            }
            $reason = \App\Support\AccountSignout::reasonFor($request->session()->getId());

            return $reason
                ? response()->json(\App\Support\AccountSignout::payload($reason), 401)
                : null;
        });
    })->create();

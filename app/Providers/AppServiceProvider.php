<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login: at most 5 tries per minute for the same email from the same
        // computer, and 20 per minute from one computer overall, so nobody can
        // keep guessing passwords. Used by the /auth/login route ("throttle:login").
        RateLimiter::for('login', function (Request $request) {
            $email = mb_strtolower((string) $request->input('email'));
            $tooMany = fn () => response()->json([
                'message' => 'Too many login attempts. Please wait a minute and try again.',
            ], 429);

            return [
                Limit::perMinute(5)->by($email.'|'.$request->ip())->response($tooMany),
                Limit::perMinute(20)->by($request->ip())->response($tooMany),
            ];
        });
    }
}

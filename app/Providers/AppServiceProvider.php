<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
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
        // HOSTING (2026-11-10). Most hosts put the site behind a proxy (a
        // middle server or Cloudflare). Without this, every visitor looked
        // like the SAME computer (the proxy), so the login, OTP and 2FA
        // limits were shared by all staff (e.g. only 3 reset codes per minute
        // for everyone), and the site could not tell it was on https.
        // .env on the host: TRUSTED_PROXIES=*  (or the proxy's IP addresses).
        $proxies = trim((string) config('app.trusted_proxies'));
        if ($proxies !== '') {
            TrustProxies::at($proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)));
        }
        // An https:// APP_URL: every link and page file uses https too
        // (no "not secure" mixed-content blocks).
        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

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

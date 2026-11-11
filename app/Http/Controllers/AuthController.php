<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Mail\PasswordResetOtpMail;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Throwable;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        // Accounts made by "Approve & Invite" cannot sign in until the email
        // verification link is clicked (it also sets their password).
        $pending = User::whereRaw('LOWER(email) = ?', [strtolower(trim($credentials['email']))])->first();
        if ($pending && AccountRequestController::isWaitingForVerification($pending)) {
            return response()->json([
                'code' => 'verify_email_first',
                'message' => 'Verify your email first: open the link we emailed you to finish your account setup.',
            ], 403);
        }

        // Check the password WITHOUT signing in yet (2FA may still be needed).
        if (! Auth::validate($credentials)) {
            return response()->json(['message' => 'Invalid email or password.'], 401);
        }
        /** @var User $user */
        $user = Auth::getLastAttempted();

        if ($user->status === User::STATUS_INACTIVE) {
            return response()->json(['message' => 'This account has been deactivated. Contact a Super Admin.'], 403);
        }

        // 2026-11-11: "Require the authenticator app for every account" is on
        // (Settings) and this account has none yet: it must set one up now.
        // Nobody is signed in until the QR code is scanned and a code typed.
        // 2026-11-12: an account that chose email codes counts as set up too.
        if (! $user->needsSecondStep() && \App\Models\AppSetting::requireAuthenticator()) {
            $request->session()->regenerate();
            $secret = \App\Support\Totp::newSecret();
            $request->session()->put(self::TWO_FACTOR_SETUP_KEY, [
                'id' => $user->id,
                'secret' => $secret,
                'expires' => now()->addMinutes(10)->timestamp,
                'tries' => 0,
            ]);

            return response()->json([
                'twoFactorSetupRequired' => true,
                'message' => 'Your account now needs an authenticator app. Scan the QR code, then type the 6-digit code.',
                'twoFactor' => [
                    'secret' => trim(chunk_split($secret, 4, ' ')),
                    'uri' => \App\Support\Totp::uri($secret, $user->email, \App\Models\AppSetting::systemName()),
                ],
                'rememberDays' => $user->rememberDeviceDays(),
                'csrfToken' => csrf_token(),
            ]);
        }

        // 2FA (2026-11-03): accounts with an authenticator app must also type
        // its 6-digit code. Until then nobody is signed in; the session only
        // remembers "password OK for user X" for 5 minutes.
        // 2026-11-12: or an emailed code (accounts that chose email codes).
        if ($user->needsSecondStep()) {
            // "Remember this device" (Staff 30 days, Admin 7, Super Admin
            // never): this browser already passed the second step recently.
            if ($this->deviceIsTrusted($request, $user)) {
                return $this->completeLogin($request, $user, viaTwoFactor: true, method: 'trusted');
            }

            $request->session()->regenerate();
            $request->session()->put(self::TWO_FACTOR_KEY, [
                'id' => $user->id,
                'expires' => now()->addMinutes(5)->timestamp,
                'tries' => 0,
            ]);
            $method = $user->hasTwoFactor() ? 'app' : 'email';

            return response()->json([
                'twoFactorRequired' => true,
                'method' => $method,
                'rememberDays' => $user->rememberDeviceDays(),
                'message' => $method === 'app'
                    ? 'Enter the 6-digit code from your authenticator app.'
                    : 'We will email you a 6-digit code.',
                'csrfToken' => csrf_token(),
            ]);
        }

        return $this->completeLogin($request, $user);
    }

    private const TWO_FACTOR_KEY = 'two_factor_login';
    /** Cookie name prefix for "Remember this device" (one cookie per account). */
    private const TRUSTED_COOKIE = 'ggg_trusted_';
    private const TWO_FACTOR_SETUP_KEY = 'two_factor_setup';
    private const TWO_FACTOR_TRIES = 5;

    /**
     * POST /auth/two-factor/setup  { code } — 2026-11-11: an account that must
     * use the authenticator app (Settings) connects it at sign-in: the code
     * proves the QR code was scanned, then the secret is saved and the person
     * is signed in. 5 wrong codes or 10 minutes = start again.
     */
    public function setupTwoFactor(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'digits:6']], [
            'code.required' => 'Enter the 6-digit code from your authenticator app.',
            'code.digits' => 'The code must be exactly 6 numbers.',
        ]);
        $pending = $request->session()->get(self::TWO_FACTOR_SETUP_KEY);
        if (! is_array($pending) || ($pending['expires'] ?? 0) < now()->timestamp || empty($pending['secret'])) {
            $request->session()->forget(self::TWO_FACTOR_SETUP_KEY);

            return response()->json([
                'code' => 'two_factor_expired',
                'message' => 'The setup took too long. Enter your email and password again.',
            ], 422);
        }

        $user = User::find($pending['id']);
        if (! $user || $user->status !== User::STATUS_ACTIVE) {
            $request->session()->forget(self::TWO_FACTOR_SETUP_KEY);

            return response()->json(['code' => 'two_factor_expired', 'message' => 'This account cannot sign in right now. Contact the Super Admin.'], 422);
        }

        $step = \App\Support\Totp::verify((string) $pending['secret'], (string) $request->input('code'));
        if ($step === null) {
            $tries = (int) ($pending['tries'] ?? 0) + 1;
            if ($tries >= self::TWO_FACTOR_TRIES) {
                $request->session()->forget(self::TWO_FACTOR_SETUP_KEY);

                return response()->json([
                    'code' => 'two_factor_expired',
                    'message' => 'Too many wrong codes. Enter your email and password again to get a new QR code.',
                ], 422);
            }
            $request->session()->put(self::TWO_FACTOR_SETUP_KEY, ['tries' => $tries] + $pending);
            $left = self::TWO_FACTOR_TRIES - $tries;
            throw ValidationException::withMessages([
                'code' => "That code is incorrect. Make sure you scanned the QR code on this screen and type the newest code. {$left} ".($left === 1 ? 'try' : 'tries').' left.',
            ]);
        }
        // This code cannot be used again for the next sign-in.
        \Illuminate\Support\Facades\Cache::add("totp_used:{$user->id}:{$step}", 1, now()->addMinutes(3));

        $user->forceFill([
            'two_factor_secret' => $pending['secret'],
            'two_factor_confirmed_at' => now(),
        ])->save();
        $request->session()->forget(self::TWO_FACTOR_SETUP_KEY);
        \App\Models\ActivityLog::record('account.2fa_setup', 'Connected an authenticator app at sign-in', 'shield', [], $user->id);

        return $this->completeLogin($request, $user, viaTwoFactor: true, remember: $request->boolean('remember'));
    }

    /**
     * POST /auth/two-factor/setup/email — 2026-11-12: "Use email codes
     * instead" on the "Connect your authenticator app" window. No phone app
     * needed: the system emails a 6-digit code now, and the person types it
     * (POST /auth/two-factor/email/verify). After that code, every sign-in
     * of this account emails a new code.
     */
    public function setupTwoFactorByEmail(Request $request): JsonResponse
    {
        $pending = $request->session()->get(self::TWO_FACTOR_SETUP_KEY);
        if (! is_array($pending) || ($pending['expires'] ?? 0) < now()->timestamp) {
            $request->session()->forget(self::TWO_FACTOR_SETUP_KEY);

            return response()->json([
                'code' => 'two_factor_expired',
                'message' => 'The setup took too long. Enter your email and password again.',
            ], 422);
        }
        $user = User::find($pending['id']);
        if (! $user || $user->status !== User::STATUS_ACTIVE) {
            $request->session()->forget(self::TWO_FACTOR_SETUP_KEY);

            return response()->json(['code' => 'two_factor_expired', 'message' => 'This account cannot sign in right now. Contact the Super Admin.'], 422);
        }

        // Same "password OK for user X" step as a normal email-code sign-in,
        // marked so the correct code also saves the choice.
        $request->session()->forget(self::TWO_FACTOR_SETUP_KEY);
        $request->session()->put(self::TWO_FACTOR_KEY, [
            'id' => $user->id,
            'expires' => now()->addMinutes(self::EMAIL_CODE_MINUTES)->timestamp,
            'tries' => 0,
            'setup_email' => true,
        ]);

        return $this->sendTwoFactorEmailCode($request);
    }

    /** POST /auth/two-factor  { code } — second step of signing in. */
    public function verifyTwoFactor(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'digits:6']], [
            'code.required' => 'Enter the 6-digit code from your authenticator app.',
            'code.digits' => 'The code must be exactly 6 numbers.',
        ]);
        $pending = $request->session()->get(self::TWO_FACTOR_KEY);
        if (! is_array($pending) || ($pending['expires'] ?? 0) < now()->timestamp) {
            $request->session()->forget(self::TWO_FACTOR_KEY);

            return response()->json([
                'code' => 'two_factor_expired',
                'message' => 'Your sign-in took too long. Enter your email and password again.',
            ], 422);
        }

        $user = User::find($pending['id']);
        if (! $user || $user->status !== User::STATUS_ACTIVE || ! $user->hasTwoFactor()) {
            $request->session()->forget(self::TWO_FACTOR_KEY);

            return response()->json(['code' => 'two_factor_expired', 'message' => 'This account cannot sign in right now. Contact the Super Admin.'], 422);
        }

        $step = \App\Support\Totp::verify((string) $user->two_factor_secret, (string) $request->input('code'));
        // The same code cannot be used twice (someone looking over a shoulder).
        if ($step !== null && ! \Illuminate\Support\Facades\Cache::add("totp_used:{$user->id}:{$step}", 1, now()->addMinutes(3))) {
            throw ValidationException::withMessages(['code' => 'This code was already used. Wait for the next code in your app, then type it.']);
        }
        if ($step === null) {
            $tries = (int) ($pending['tries'] ?? 0) + 1;
            if ($tries >= self::TWO_FACTOR_TRIES) {
                $request->session()->forget(self::TWO_FACTOR_KEY);
                \App\Models\ActivityLog::record('login.2fa_failed', 'Too many wrong authenticator codes at sign-in', 'key', [], $user->id);

                return response()->json([
                    'code' => 'two_factor_expired',
                    'message' => 'Too many wrong codes. Enter your email and password again.',
                ], 422);
            }
            $request->session()->put(self::TWO_FACTOR_KEY, ['tries' => $tries] + $pending);
            $left = self::TWO_FACTOR_TRIES - $tries;
            throw ValidationException::withMessages([
                'code' => "That code is incorrect. Check the time on your phone and type the newest code. {$left} ".($left === 1 ? 'try' : 'tries').' left.',
            ]);
        }

        $request->session()->forget(self::TWO_FACTOR_KEY);

        return $this->completeLogin($request, $user, viaTwoFactor: true, remember: $request->boolean('remember'));
    }

    private const EMAIL_CODE_MINUTES = 10;
    private const EMAIL_CODE_RESEND_SECONDS = 60;

    /**
     * POST /auth/two-factor/email — 2026-11-11: "Can't use your phone? Send a
     * code to my email" on the two-step window. Only works right after the
     * correct password (the same 2FA session), so the password AND the email
     * inbox are both needed. The code is saved hashed in that session:
     * 10 minutes, works once, 5 wrong tries (shared with the app code).
     */
    public function sendTwoFactorEmailCode(Request $request): JsonResponse
    {
        $pending = $request->session()->get(self::TWO_FACTOR_KEY);
        if (! is_array($pending) || ($pending['expires'] ?? 0) < now()->timestamp) {
            $request->session()->forget(self::TWO_FACTOR_KEY);

            return response()->json([
                'code' => 'two_factor_expired',
                'message' => 'Your sign-in took too long. Enter your email and password again.',
            ], 422);
        }
        $user = User::find($pending['id']);
        if (! $user || $user->status !== User::STATUS_ACTIVE) {
            $request->session()->forget(self::TWO_FACTOR_KEY);

            return response()->json(['code' => 'two_factor_expired', 'message' => 'This account cannot sign in right now. Contact the Super Admin.'], 422);
        }
        $wait = (int) ($pending['email_sent_at'] ?? 0) + self::EMAIL_CODE_RESEND_SECONDS - now()->timestamp;
        if ($wait > 0) {
            return response()->json(['message' => "Please wait {$wait} seconds before asking for a new code."], 429);
        }

        $code = (string) random_int(100000, 999999);
        try {
            Mail::to($user->email)->send(new \App\Mail\TwoFactorEmailCodeMail($code, self::EMAIL_CODE_MINUTES));
        } catch (Throwable $exception) {
            Log::error('Sign-in email code could not be sent. Check the MAIL_* settings in .env, then run php artisan config:clear.', ['exception' => $exception]);

            return response()->json([
                'code' => 'mail_failed',
                'message' => ! empty($pending['setup_email'])
                    ? 'The code could not be emailed because the system\'s email settings are not working. Sign in again and use the authenticator app, or tell the Super Admin.'
                    : 'The code could not be emailed because the system\'s email settings are not working. Use your authenticator app, or tell the Super Admin.',
            ], 503);
        }

        // A new code replaces the old one; the sign-in now has 10 minutes.
        $request->session()->put(self::TWO_FACTOR_KEY, [
            'email_code_hash' => Hash::make($code),
            'email_code_expires' => now()->addMinutes(self::EMAIL_CODE_MINUTES)->timestamp,
            'email_sent_at' => now()->timestamp,
            'expires' => max((int) $pending['expires'], now()->addMinutes(self::EMAIL_CODE_MINUTES)->timestamp),
        ] + $pending);
        \App\Models\ActivityLog::record('login.2fa_email_sent', 'Asked for a sign-in code by email', 'mail', [], $user->id);

        return response()->json([
            'sent' => true,
            'expiresInMinutes' => self::EMAIL_CODE_MINUTES,
            'resendInSeconds' => self::EMAIL_CODE_RESEND_SECONDS,
        ]);
    }

    /** POST /auth/two-factor/email/verify  { code } — sign in with the emailed code. */
    public function verifyTwoFactorEmailCode(Request $request): JsonResponse
    {
        $request->validate(['code' => ['required', 'digits:6']], [
            'code.required' => 'Enter the 6-digit code from the email.',
            'code.digits' => 'The code must be exactly 6 numbers.',
        ]);
        $pending = $request->session()->get(self::TWO_FACTOR_KEY);
        if (! is_array($pending) || ($pending['expires'] ?? 0) < now()->timestamp) {
            $request->session()->forget(self::TWO_FACTOR_KEY);

            return response()->json([
                'code' => 'two_factor_expired',
                'message' => 'Your sign-in took too long. Enter your email and password again.',
            ], 422);
        }
        $user = User::find($pending['id']);
        if (! $user || $user->status !== User::STATUS_ACTIVE) {
            $request->session()->forget(self::TWO_FACTOR_KEY);

            return response()->json(['code' => 'two_factor_expired', 'message' => 'This account cannot sign in right now. Contact the Super Admin.'], 422);
        }
        if (empty($pending['email_code_hash']) || ($pending['email_code_expires'] ?? 0) < now()->timestamp) {
            throw ValidationException::withMessages(['code' => 'This code has expired. Press "Send a new code".']);
        }

        if (! Hash::check((string) $request->input('code'), (string) $pending['email_code_hash'])) {
            $tries = (int) ($pending['tries'] ?? 0) + 1;
            if ($tries >= self::TWO_FACTOR_TRIES) {
                $request->session()->forget(self::TWO_FACTOR_KEY);
                \App\Models\ActivityLog::record('login.2fa_failed', 'Too many wrong email codes at sign-in', 'key', [], $user->id);

                return response()->json([
                    'code' => 'two_factor_expired',
                    'message' => 'Too many wrong codes. Enter your email and password again.',
                ], 422);
            }
            $request->session()->put(self::TWO_FACTOR_KEY, ['tries' => $tries] + $pending);
            $left = self::TWO_FACTOR_TRIES - $tries;
            throw ValidationException::withMessages([
                'code' => "That code is incorrect. Check the newest email and try again. {$left} ".($left === 1 ? 'try' : 'tries').' left.',
            ]);
        }

        $request->session()->forget(self::TWO_FACTOR_KEY);

        // 2026-11-12: chosen on the setup window — from now on this account
        // signs in with emailed codes.
        if (! empty($pending['setup_email'])) {
            \App\Models\AppSetting::put($user->emailTwoFactorKey(), '1');
            \App\Models\ActivityLog::record('account.2fa_email_setup', 'Chose email codes for two-step sign-in', 'mail', [], $user->id);
        }

        return $this->completeLogin($request, $user, viaTwoFactor: true, method: 'email', remember: $request->boolean('remember'));
    }

    private function completeLogin(Request $request, User $user, bool $viaTwoFactor = false, string $method = 'app', bool $remember = false): JsonResponse
    {
        Auth::login($user);
        $request->session()->regenerate();
        $request->session()->put('_account_auth_version', (int) $user->auth_version);

        $how = match ($method) {
            'email' => 'Signed in (with a code sent by email)',
            'trusted' => 'Signed in (remembered device, no code needed)',
            default => 'Signed in (with authenticator code)',
        };
        \App\Models\ActivityLog::record('login', $viaTwoFactor ? $how : 'Signed in', 'login', [], $user->id);

        if ($remember && $method !== 'trusted') {
            $this->rememberDevice($request, $user);
        }

        return response()->json([
            'user' => $this->userPayload($user),
            'csrfToken' => csrf_token(),
        ]);
    }

    /* ===== REMEMBER THIS DEVICE (2026-11-12) =====
       After a correct code, "Remember this device" saves a cookie in this
       browser: secure (https), HTTP-only (scripts can't read it) and
       encrypted with APP_KEY by Laravel. While it is valid, signing in from
       this browser needs only the password. Staff 30 days, Admin 7 days,
       Super Admin never. It stops working when the password, the role or
       the two-step method changes (the fingerprint no longer matches). */

    private function trustedFingerprint(User $user): string
    {
        return substr(hash_hmac('sha256', implode('|', [
            $user->id,
            $user->role,
            (string) $user->getAuthPassword(),
            (int) $user->auth_version,
            optional($user->two_factor_confirmed_at)->timestamp,
            $user->usesEmailTwoFactor() ? 'email' : 'app',
        ]), (string) config('app.key')), 0, 40);
    }

    private function rememberDevice(Request $request, User $user): void
    {
        $days = $user->rememberDeviceDays();
        if ($days <= 0) {
            return;   // Super Admin: always ask for the code
        }
        $value = json_encode(['u' => $user->id, 't' => now()->timestamp, 'f' => $this->trustedFingerprint($user)]);
        \Illuminate\Support\Facades\Cookie::queue(cookie(
            self::TRUSTED_COOKIE.$user->id,
            $value,
            $days * 24 * 60,
            '/',
            null,
            (bool) config('session.secure') || $request->isSecure(),
            true,      // HTTP-only
            false,
            'lax',
        ));
    }

    private function deviceIsTrusted(Request $request, User $user): bool
    {
        $days = $user->rememberDeviceDays();
        if ($days <= 0) {
            return false;
        }
        $data = json_decode((string) $request->cookie(self::TRUSTED_COOKIE.$user->id), true);
        if (! is_array($data) || (int) ($data['u'] ?? 0) !== (int) $user->id || ! is_string($data['f'] ?? null)) {
            return false;
        }
        $savedAt = (int) ($data['t'] ?? 0);
        if ($savedAt > now()->timestamp + 60 || $savedAt + $days * 86400 < now()->timestamp) {
            return false;   // too old for this role (or a clock trick)
        }

        return hash_equals($this->trustedFingerprint($user), $data['f']);
    }

    public function currentUser(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->userPayload($request->user()),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logged out.',
            'csrfToken' => csrf_token(),
        ]);
    }

    /*
     * ===== "FORGOT PASSWORD?" ONE-TIME CODE (OTP) =====
     * 1. POST /auth/password/otp         email → a 6-digit code is emailed
     *                                     (lasts 10 minutes, stored hashed).
     * 2. POST /auth/password/otp/verify  email + code → checks the code only
     *                                     (so the screen can say "correct"
     *                                     before asking for a new password).
     * 3. POST /auth/password/reset       email + code + new password → the
     *                                     code is checked AGAIN here, so the
     *                                     step-2 screen cannot be skipped or
     *                                     faked. The code then stops working.
     * 5 wrong tries block the code; asking for a new code replaces the old
     * one. The answer to step 1 is the same whether or not the email has an
     * account, so nobody can use it to find out who has one.
     */
    private const OTP_MINUTES = 10;
    private const OTP_MAX_TRIES = 5;

    public function sendPasswordResetOtp(Request $request): JsonResponse
    {
        $attributes = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);
        $email = strtolower(trim($attributes['email']));
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();
        $genericAnswer = [
            'message' => 'If an account exists for that email, a 6-digit code has been sent. Check your inbox and spam folder.',
            'expiresInMinutes' => self::OTP_MINUTES,
        ];

        $otp = (string) random_int(100000, 999999);
        $now = now();
        // Unknown emails get a placeholder code that can never be matched,
        // so steps 2 and 3 answer the same way for every email.
        DB::table('password_reset_otps')->updateOrInsert(
            ['email' => $user?->email ?? $email],
            [
                'otp_hash' => Hash::make($user ? $otp : bin2hex(random_bytes(16))),
                'attempts' => 0,
                'expires_at' => $now->copy()->addMinutes(self::OTP_MINUTES),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        if (! $user) {
            return response()->json($genericAnswer);
        }

        try {
            Mail::to($user->email)->send(new PasswordResetOtpMail($otp));
        } catch (Throwable $exception) {
            DB::table('password_reset_otps')->where('email', $user->email)->delete();
            $hint = str_contains($exception->getMessage(), '535')
                || str_contains($exception->getMessage(), 'BadCredentials')
                ? 'Gmail rejected the mail login. MAIL_USERNAME must be the Gmail address and MAIL_PASSWORD a 16-letter Gmail App Password (not the normal Gmail password). Then run php artisan config:clear.'
                : 'Check the MAIL_* settings in .env, then run php artisan config:clear.';
            Log::error('Password reset OTP email could not be sent. '.$hint, [
                'exception' => $exception,
            ]);

            return response()->json([
                'code' => 'mail_failed',
                'message' => 'The code could not be emailed because the system\'s email settings are not working. Please tell the Super Admin.',
            ], 503);
        }

        return response()->json($genericAnswer);
    }

    public function verifyPasswordResetOtp(Request $request): JsonResponse
    {
        $attributes = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'otp' => ['required', 'digits:6'],
        ], [
            'otp.required' => 'Enter the 6-digit code from the email.',
            'otp.digits' => 'The code must be exactly 6 numbers.',
        ]);

        $result = DB::transaction(fn () => $this->checkResetOtp(strtolower(trim($attributes['email'])), $attributes['otp']));
        if ($result['status'] !== 'valid') {
            throw ValidationException::withMessages(['otp' => $result['message']]);
        }

        return response()->json([
            'message' => 'Code accepted. Now choose your new password.',
            'expiresAt' => $result['expiresAt'],
        ]);
    }

    public function resetPasswordWithOtp(Request $request): JsonResponse
    {
        $attributes = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'otp' => ['required', 'digits:6'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ], [
            'otp.required' => 'Enter the 6-digit code from the email.',
            'otp.digits' => 'The code must be exactly 6 numbers.',
            'password.confirmed' => 'The two passwords do not match.',
        ]);
        $email = strtolower(trim($attributes['email']));

        $result = DB::transaction(function () use ($attributes, $email) {
            $check = $this->checkResetOtp($email, $attributes['otp']);
            if ($check['status'] !== 'valid') {
                return $check;
            }

            $user = User::whereRaw('LOWER(email) = ?', [$email])->first();
            DB::table('password_reset_otps')->whereRaw('LOWER(email) = ?', [$email])->delete();
            if (! $user) {
                return ['status' => 'invalid', 'message' => 'This code is incorrect or has expired. Send a new code.'];
            }

            $user->password = $attributes['password'];
            $user->remember_token = bin2hex(random_bytes(30));
            $user->save();

            if (config('session.driver') === 'database') {
                DB::table(config('session.table', 'sessions'))
                    ->where('user_id', $user->id)
                    ->delete();
            }

            return ['status' => 'success'];
        });

        if ($result['status'] !== 'success') {
            throw ValidationException::withMessages(['otp' => $result['message']]);
        }

        return response()->json([
            'message' => 'Your password has been reset. Sign in with your new password.',
        ]);
    }

    /**
     * Check a reset code (inside a transaction). Wrong codes count as a try;
     * the 5th wrong try blocks the code. Returns status valid / expired /
     * locked / incorrect / missing with a plain message for the screen.
     */
    private function checkResetOtp(string $email, string $otp): array
    {
        $query = DB::table('password_reset_otps')->whereRaw('LOWER(email) = ?', [$email]);
        $record = $query->lockForUpdate()->first();

        if (! $record) {
            return ['status' => 'missing', 'message' => 'There is no active code for this email. Click "Send a new code".'];
        }

        if (now()->greaterThan($record->expires_at)) {
            DB::table('password_reset_otps')->where('email', $record->email)->delete();

            return ['status' => 'expired', 'message' => 'This code has expired (codes last '.self::OTP_MINUTES.' minutes). Click "Send a new code".'];
        }

        if ($record->attempts >= self::OTP_MAX_TRIES) {
            DB::table('password_reset_otps')->where('email', $record->email)->delete();

            return ['status' => 'locked', 'message' => 'Too many wrong tries, so this code is now blocked. Click "Send a new code".'];
        }

        if (! Hash::check($otp, $record->otp_hash)) {
            $tries = (int) $record->attempts + 1;
            DB::table('password_reset_otps')->where('email', $record->email)->update(['attempts' => $tries]);
            $left = self::OTP_MAX_TRIES - $tries;
            if ($left <= 0) {
                return ['status' => 'locked', 'message' => 'Too many wrong tries, so this code is now blocked. Click "Send a new code".'];
            }

            return ['status' => 'incorrect', 'message' => "That code is incorrect. {$left} ".($left === 1 ? 'try' : 'tries').' left.'];
        }

        return ['status' => 'valid', 'expiresAt' => \Illuminate\Support\Carbon::parse($record->expires_at)->toIso8601String()];
    }

    private function userPayload(User $user): array
    {
        return [
            ...$user->only(['id', 'name', 'email', 'role']),
            // System-wide display currency (Settings), the same for every account.
            'currency' => \App\Models\AppSetting::currency(),
            // Sidebar picture chosen by the Super Admin (null = default icon).
            'logoUrl' => \App\Models\AppSetting::logoUrl(),
            // The system's name chosen by the Super Admin (Settings).
            'systemName' => \App\Models\AppSetting::systemName(),
            'isSuperAdmin' => $this->isSuperAdmin($user),
            // This account's own Appearance theme (null = default theme).
            'theme' => $user->theme,
            // Own profile photo for the sidebar account row (null = initials).
            'avatarUrl' => $user->ownAvatarUrl(),
            'twoFactorEnabled' => $user->hasTwoFactor(),
            'twoFactorEmail' => $user->usesEmailTwoFactor(),
            // Role Access: which features this account may use (Settings).
            'permissions' => \App\Services\RoleAccessService::effectiveFor($user),
        ];
    }

    private function isSuperAdmin(?User $user): bool
    {
        if ($user === null) {
            return false;
        }

        // Prefer the real role column; fall back to the configured email so an
        // existing super-admin login keeps working even before roles are set.
        if ($user->role === User::ROLE_SUPER_ADMIN) {
            return true;
        }

        // The .env email only counts while nobody has the role (2026-11-10).
        return $user->isConfiguredSuperAdminEmail();
    }
}

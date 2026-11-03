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

        // 2FA (2026-11-03): accounts with an authenticator app must also type
        // its 6-digit code. Until then nobody is signed in; the session only
        // remembers "password OK for user X" for 5 minutes.
        if ($user->hasTwoFactor()) {
            $request->session()->regenerate();
            $request->session()->put(self::TWO_FACTOR_KEY, [
                'id' => $user->id,
                'expires' => now()->addMinutes(5)->timestamp,
                'tries' => 0,
            ]);

            return response()->json([
                'twoFactorRequired' => true,
                'message' => 'Enter the 6-digit code from your authenticator app.',
                'csrfToken' => csrf_token(),
            ]);
        }

        return $this->completeLogin($request, $user);
    }

    private const TWO_FACTOR_KEY = 'two_factor_login';
    private const TWO_FACTOR_TRIES = 5;

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

        return $this->completeLogin($request, $user, viaTwoFactor: true);
    }

    private function completeLogin(Request $request, User $user, bool $viaTwoFactor = false): JsonResponse
    {
        Auth::login($user);
        $request->session()->regenerate();
        $request->session()->put('_account_auth_version', (int) $user->auth_version);

        \App\Models\ActivityLog::record('login', $viaTwoFactor ? 'Signed in (with authenticator code)' : 'Signed in', 'login', [], $user->id);

        return response()->json([
            'user' => $this->userPayload($user),
            'csrfToken' => csrf_token(),
        ]);
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
            'isSuperAdmin' => $this->isSuperAdmin($user),
            // This account's own Appearance theme (null = default theme).
            'theme' => $user->theme,
            // Own profile photo for the sidebar account row (null = initials).
            'avatarUrl' => $user->ownAvatarUrl(),
            'twoFactorEnabled' => $user->hasTwoFactor(),
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

        $superAdminEmail = config('auth.super_admin_email');

        return is_string($superAdminEmail)
            && $superAdminEmail !== ''
            && hash_equals(strtolower($superAdminEmail), strtolower($user->email));
    }
}

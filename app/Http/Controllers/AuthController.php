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

        if (! Auth::attempt($credentials)) {
            return response()->json(['message' => 'Invalid email or password.'], 401);
        }

        // Block deactivated accounts even with correct credentials.
        if ($request->user()->status === User::STATUS_INACTIVE) {
            Auth::logout();
            return response()->json(['message' => 'This account has been deactivated. Contact a Super Admin.'], 403);
        }

        $request->session()->regenerate();

        \App\Models\ActivityLog::record('login', 'Signed in', 'login', [], $request->user()->id);

        return response()->json([
            'user' => $this->userPayload($request->user()),
            // Signing in makes a new security token. The screen must use this
            // one for its next save, or the save fails with "CSRF token mismatch".
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

    public function sendPasswordResetOtp(Request $request): JsonResponse
    {
        $attributes = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);
        $email = strtolower($attributes['email']);
        $user = User::whereRaw('LOWER(email) = ?', [$email])->first();

        if (! $user) {
            return response()->json([
                'message' => 'If an account exists for that email, a one-time code will be sent.',
            ]);
        }

        $otp = (string) random_int(100000, 999999);
        $now = now();

        DB::table('password_reset_otps')->updateOrInsert(
            ['email' => $user->email],
            [
                'otp_hash' => Hash::make($otp),
                'attempts' => 0,
                'expires_at' => $now->copy()->addMinutes(10),
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );

        try {
            Mail::to($user->email)->send(new PasswordResetOtpMail($otp));
        } catch (Throwable $exception) {
            DB::table('password_reset_otps')->where('email', $user->email)->delete();
            // The details (e.g. "Gmail rejected the credentials, update MAIL_PASSWORD")
            // go to the log for the developer, never to the login screen.
            $hint = str_contains($exception->getMessage(), '535-5.7.8')
                || str_contains($exception->getMessage(), 'BadCredentials')
                ? 'Gmail rejected the mail credentials. Update MAIL_PASSWORD in .env with a valid Gmail App Password, then run php artisan config:clear.'
                : 'Check the MAIL_* settings in .env.';
            Log::error('Password reset OTP email could not be sent. '.$hint, [
                'exception' => $exception,
            ]);

            return response()->json([
                'message' => 'We could not send the email right now. Please try again later or contact the Super Admin.',
            ], 503);
        }

        return response()->json([
            'message' => 'If an account exists for that email, a one-time code will be sent.',
        ]);
    }

    public function resetPasswordWithOtp(Request $request): JsonResponse
    {
        $attributes = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'otp' => ['required', 'digits:6'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        $email = strtolower($attributes['email']);
        $result = DB::transaction(function () use ($attributes, $email) {
            $otpRecord = DB::table('password_reset_otps')
                ->whereRaw('LOWER(email) = ?', [$email])
                ->lockForUpdate()
                ->first();

            if (! $otpRecord) {
                return 'invalid';
            }

            if (now()->greaterThan($otpRecord->expires_at) || $otpRecord->attempts >= 5) {
                DB::table('password_reset_otps')->where('email', $otpRecord->email)->delete();

                return 'invalid';
            }

            if (! Hash::check($attributes['otp'], $otpRecord->otp_hash)) {
                DB::table('password_reset_otps')
                    ->where('email', $otpRecord->email)
                    ->increment('attempts');

                return 'invalid';
            }

            $user = User::whereRaw('LOWER(email) = ?', [$email])->first();
            if (! $user) {
                DB::table('password_reset_otps')->where('email', $otpRecord->email)->delete();

                return 'invalid';
            }

            $user->password = $attributes['password'];
            $user->remember_token = bin2hex(random_bytes(30));
            $user->save();

            DB::table('password_reset_otps')->where('email', $otpRecord->email)->delete();

            if (config('session.driver') === 'database') {
                DB::table(config('session.table', 'sessions'))
                    ->where('user_id', $user->id)
                    ->delete();
            }

            return 'success';
        });

        if ($result !== 'success') {
            throw ValidationException::withMessages([
                'otp' => 'The code is incorrect or has expired. Request a new code and try again.',
            ]);
        }

        return response()->json([
            'message' => 'Your password has been reset. Sign in with your new password.',
        ]);
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

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

        $request->session()->regenerate();

        return response()->json([
            'user' => $this->userPayload($request->user()),
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

    public function createAccount(Request $request): JsonResponse
    {
        abort_unless($this->isSuperAdmin($request->user()), 403);

        $attributes = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $user = User::create($attributes);

        return response()->json([
            'message' => 'Account created.',
            'user' => $user->only(['id', 'name', 'email']),
        ], 201);
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
            Log::error('Password reset OTP email could not be sent.', [
                'exception' => $exception,
            ]);

            $errorMessage = str_contains($exception->getMessage(), '535-5.7.8')
                || str_contains($exception->getMessage(), 'BadCredentials')
                ? 'Gmail rejected the mail credentials. Update MAIL_PASSWORD in .env with a valid Gmail App Password, then run php artisan config:clear.'
                : 'We could not send the email right now. Please check the mail settings and try again.';

            return response()->json([
                'message' => $errorMessage,
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
            ...$user->only(['id', 'name', 'email']),
            'isSuperAdmin' => $this->isSuperAdmin($user),
        ];
    }

    private function isSuperAdmin(?User $user): bool
    {
        $superAdminEmail = config('auth.super_admin_email');

        return $user !== null
            && is_string($superAdminEmail)
            && $superAdminEmail !== ''
            && hash_equals(strtolower($superAdminEmail), strtolower($user->email));
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * ProfileController — /profile
 *
 * The signed-in user's own account: view, edit basic details, change password,
 * and read their recent activity. Operates on the authenticated user only
 * (never an arbitrary id), so there's no privilege escalation surface.
 */
class ProfileController extends Controller
{
    /** GET /profile */
    public function show(Request $request): JsonResponse
    {
        return response()->json($this->format($request->user()));
    }

    /** PATCH /profile — update own name / email / department. */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name'       => ['sometimes', 'string', 'max:255'],
            'email'      => ['sometimes', 'email', 'max:255', 'unique:users,email,'.$user->id],
            'department' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        // department is optional and only persisted if the column exists.
        $department = $data['department'] ?? null;
        unset($data['department']);

        $user->fill($data);
        if ($department !== null && Schema::hasColumn('users', 'department')) {
            $user->department = $department;
        }
        $user->save();

        ActivityLog::record('profile.update', 'Updated profile details', 'user');

        return response()->json($this->format($user->fresh()));
    }

    /**
     * POST /profile/password — change own password.
     *
     * 2026-11-16 security checks:
     *  - the current password (as before);
     *  - accounts with the authenticator app also type its 6-digit code
     *    (a code can't be used twice), so someone at an unlocked computer
     *    can't change the password without the phone;
     *  - the new password must be different from the current one;
     *  - after saving, every OTHER device is signed out ("remember me"
     *    cookies stop working too); this browser stays signed in;
     *  - the owner gets an email "Your password was changed";
     *  - at most 5 tries a minute (routes/web.php).
     */
    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'confirmed', Password::min(8), 'not_regex:/\s/'],   // 2026-11-12: no spaces
            'code'             => ['nullable', 'digits:6'],
        ], [
            'password.not_regex' => 'The password cannot contain spaces.',
            'code.digits'        => 'The code must be exactly 6 numbers.',
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'Your current password is incorrect.',
            ]);
        }

        if (Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => 'Your new password must be different from your current password.',
            ]);
        }

        if ($user->hasTwoFactor()) {
            $code = (string) ($data['code'] ?? '');
            if ($code === '') {
                throw ValidationException::withMessages([
                    'code' => 'Enter the 6-digit code from your authenticator app.',
                ]);
            }
            $step = \App\Support\Totp::verify((string) $user->two_factor_secret, $code);
            if ($step === null) {
                throw ValidationException::withMessages([
                    'code' => 'That code is incorrect. Check the time on your phone and type the newest code.',
                ]);
            }
            // The same code cannot be used twice (same rule as signing in).
            if (! \Illuminate\Support\Facades\Cache::add("totp_used:{$user->id}:{$step}", 1, now()->addMinutes(3))) {
                throw ValidationException::withMessages([
                    'code' => 'This code was already used. Wait for the next code in your app, then type it.',
                ]);
            }
        }

        $user->password = $data['password'];
        // "Remember me" on other browsers stops working.
        $user->setRememberToken(\Illuminate\Support\Str::random(60));
        $user->save();

        $signedOut = $this->signOutOtherDevices($request, $user);

        ActivityLog::record('password.change', 'Changed account password'.($signedOut > 0 ? " (signed out {$signedOut} other ".($signedOut === 1 ? 'device' : 'devices').')' : ''), 'key');

        try {
            \Illuminate\Support\Facades\Mail::to($user->email)->send(new \App\Mail\PasswordChangedMail(
                $user->name,
                now()->timezone(config('app.business_timezone', 'Asia/Manila'))->format('M j, Y g:i A'),
                $this->deviceLabel((string) $request->userAgent()),
            ));
        } catch (\Throwable $exception) {
            \Illuminate\Support\Facades\Log::error('Password changed email could not be sent. Check the MAIL_* settings in .env, then run php artisan config:clear.', [
                'to' => $user->email,
                'exception' => $exception,
            ]);
        }

        return response()->json([
            'message' => 'Your password has been updated. Other devices were signed out.',
            'signedOutDevices' => $signedOut,
        ]);
    }

    /**
     * Remove this account's other sessions (database sessions only), leaving
     * a note so those browsers show why they were signed out. Returns how
     * many were removed.
     */
    private function signOutOtherDevices(Request $request, User $user): int
    {
        if (config('session.driver') !== 'database') {
            return 0;
        }
        $current = $request->hasSession() ? $request->session()->getId() : '';
        $others = DB::table(config('session.table', 'sessions'))
            ->where('user_id', $user->id)
            ->when($current !== '', fn ($query) => $query->where('id', '!=', $current));
        $ids = (clone $others)->pluck('id');
        foreach ($ids as $sessionId) {
            \App\Support\AccountSignout::remember((string) $sessionId, \App\Support\AccountSignout::PASSWORD_CHANGED);
        }
        $others->delete();

        return $ids->count();
    }

    /** "Chrome on Windows", "Safari on iPhone"… for the email (best guess). */
    private function deviceLabel(string $agent): string
    {
        $browser = match (true) {
            str_contains($agent, 'Edg/') => 'Microsoft Edge',
            str_contains($agent, 'OPR/') || str_contains($agent, 'Opera') => 'Opera',
            str_contains($agent, 'Firefox/') => 'Firefox',
            str_contains($agent, 'Chrome/') => 'Chrome',
            str_contains($agent, 'Safari/') => 'Safari',
            default => 'a web browser',
        };
        $system = match (true) {
            str_contains($agent, 'iPhone') => 'iPhone',
            str_contains($agent, 'iPad') => 'iPad',
            str_contains($agent, 'Android') => 'Android',
            str_contains($agent, 'Windows') => 'Windows',
            str_contains($agent, 'Mac OS') => 'Mac',
            str_contains($agent, 'Linux') => 'Linux',
            default => '',
        };

        return $system !== '' ? "{$browser} on {$system}" : $browser;
    }

    /*
     * ===== OWN PROFILE PHOTO =====
     * Each user's own picture (separate from the system logo in the sidebar).
     * The file lives on the private "local" disk; its path is kept in
     * app_settings under "avatar.user.{id}" — no database column needed.
     */

    private function avatarKey(User $user): string
    {
        return 'avatar.user.'.$user->id;
    }

    private function avatarUrl(User $user): ?string
    {
        $path = \App\Models\AppSetting::get($this->avatarKey($user));

        return $path ? '/profile/avatar?v='.substr(md5($path), 0, 10) : null;
    }

    /** GET /profile/avatar — the signed-in user's own photo. */
    public function avatar(Request $request)
    {
        $path = \App\Models\AppSetting::get($this->avatarKey($request->user()));
        abort_unless($path && \Illuminate\Support\Facades\Storage::disk('local')->exists($path), 404);

        return \Illuminate\Support\Facades\Storage::disk('local')->response($path, null, [
            'Cache-Control' => 'private, max-age=31536000',
        ]);
    }

    /** POST /profile/avatar — choose a new photo for your own profile. */
    public function storeAvatar(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:2048'],
        ], [
            'avatar.max' => 'The picture must be 2 MB or smaller.',
            'avatar.image' => 'Please choose an image file (JPG, PNG, WEBP or GIF).',
            'avatar.mimes' => 'Please choose a JPG, PNG, WEBP or GIF picture.',
        ]);

        $old = \App\Models\AppSetting::get($this->avatarKey($user));
        $path = $request->file('avatar')->store('avatars', 'local');
        \App\Models\AppSetting::put($this->avatarKey($user), $path);
        if ($old && $old !== $path) {
            \Illuminate\Support\Facades\Storage::disk('local')->delete($old);
        }
        ActivityLog::record('profile.photo', 'Changed profile photo', 'user');

        return response()->json(['avatarUrl' => $this->avatarUrl($user)]);
    }

    /** DELETE /profile/avatar — remove your photo (back to initials). */
    public function destroyAvatar(Request $request): JsonResponse
    {
        $user = $request->user();
        $old = \App\Models\AppSetting::get($this->avatarKey($user));
        \App\Models\AppSetting::query()->whereKey($this->avatarKey($user))->delete();
        if ($old) {
            \Illuminate\Support\Facades\Storage::disk('local')->delete($old);
        }
        ActivityLog::record('profile.photo', 'Removed profile photo', 'user');

        return response()->json(['avatarUrl' => null]);
    }

    /** GET /profile/activity — the signed-in user's recent activity. */
    public function activity(Request $request): JsonResponse
    {
        $logs = ActivityLog::where('user_id', $request->user()->id)
            ->latest()
            ->limit(30)
            ->get();

        return response()->json($logs->map(fn (ActivityLog $log) => [
            'id'          => $log->id,
            'action'      => $log->action,
            'description' => $log->description,
            'icon'        => $log->icon,
            'meta'        => $log->meta,
            'at'          => $log->created_at?->diffForHumans(),
        ]));
    }

    private function format(User $user): array
    {
        $roleLabels = [
            User::ROLE_SUPER_ADMIN => 'Super Admin',
            User::ROLE_ADMIN       => 'Admin',
            User::ROLE_STAFF       => 'Staff',
        ];

        $lastLogin = $this->lastLoginFor($user);

        return [
            'id'         => $user->id,
            'fullName'   => $user->name,
            'email'      => $user->email,
            'department' => Schema::hasColumn('users', 'department') ? ($user->department ?? '') : '',
            'role'       => $roleLabels[$user->role] ?? 'Staff',
            'status'     => $user->status === User::STATUS_INACTIVE ? 'Inactive' : 'Active',
            'joined'     => $user->created_at?->format('F j, Y'),
            'lastLogin'  => $lastLogin,
            'avatarUrl'  => $this->avatarUrl($user),
            // 2026-11-16: Change Password asks for the authenticator code when this is on.
            'twoFactorApp' => $user->hasTwoFactor(),
        ];
    }

    /** Most recent login time from the activity log, else account creation. */
    private function lastLoginFor(User $user): ?string
    {
        $login = ActivityLog::where('user_id', $user->id)
            ->where('action', 'login')
            ->latest()
            ->first();

        return $login?->created_at?->diffForHumans() ?? $user->created_at?->diffForHumans();
    }
}

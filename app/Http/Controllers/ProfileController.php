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

        /* ===== EMAIL NEEDS CONFIRMING (2026-11-19) =====
           A new email is no longer saved here: Profile → Change email asks for
           the password (and authenticator code) and a code sent to the new
           address first. Sending the same email again (the whole form) is fine. */
        if (array_key_exists('email', $data)) {
            if (mb_strtolower(trim((string) $data['email'])) !== mb_strtolower(trim((string) $user->email))) {
                throw ValidationException::withMessages([
                    'email' => 'To change your email, use Change email so we can confirm the new address first.',
                ]);
            }
            unset($data['email']);
        }

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

        $this->assertAppCode($user, $data['code'] ?? null);

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

    /* ===== CHANGE EMAIL: DOUBLE CONFIRMATION (2026-11-19) =====
     * 1. POST /profile/email/start    { current_password, code? }
     *    Password (and authenticator code) are right: a code is sent to the
     *    CURRENT email so the real owner approves the change.
     * 2. POST /profile/email/approve  { code }   (code from the current email)
     * 3. POST /profile/email/request  { email }  only after step 2: a code
     *    is sent to the NEW email to prove it is typed right and owned.
     * 4. POST /profile/email/confirm  { code }   (code from the new email)
     *    The email changes, and both addresses get a notice.
     * The waiting change lives in the cache (10 minutes per step, no new
     * table). 5 wrong codes at any step cancel it. Can't open the current
     * email? The Super Admin can change it in Staffs.
     */
    private const EMAIL_CODE_MINUTES = 10;
    private const EMAIL_CODE_TRIES = 5;

    private function emailChangeKey(User $user): string
    {
        return 'email_change:'.$user->id;
    }

    /** Save a new code for this step and return it (only its hash is kept). */
    private function newEmailChangeCode(User $user, array $pending): string
    {
        $code = (string) random_int(100000, 999999);
        \Illuminate\Support\Facades\Cache::put($this->emailChangeKey($user), $pending + [
            'hash' => Hash::make($code),
            'tries' => 0,
        ], now()->addMinutes(self::EMAIL_CODE_MINUTES));

        return $code;
    }

    /** The waiting change, if it is at this step; otherwise a plain error. */
    private function pendingAt(User $user, string $stage, string $field = 'code'): array
    {
        $pending = \Illuminate\Support\Facades\Cache::get($this->emailChangeKey($user));
        if (! is_array($pending) || ($pending['stage'] ?? null) !== $stage) {
            throw ValidationException::withMessages([$field => 'This step has expired. Start again with Change email.']);
        }

        return $pending;
    }

    /** Check a typed code for this step; 5 wrong codes cancel the change. */
    private function checkEmailChangeCode(User $user, array $pending, string $code): void
    {
        if (Hash::check($code, (string) ($pending['hash'] ?? ''))) {
            return;
        }
        $key = $this->emailChangeKey($user);
        $pending['tries'] = (int) ($pending['tries'] ?? 0) + 1;
        if ($pending['tries'] >= self::EMAIL_CODE_TRIES) {
            \Illuminate\Support\Facades\Cache::forget($key);
            throw ValidationException::withMessages(['code' => 'Too many wrong codes. Start again with Change email.']);
        }
        \Illuminate\Support\Facades\Cache::put($key, $pending, now()->addMinutes(self::EMAIL_CODE_MINUTES));
        throw ValidationException::withMessages(['code' => 'That code is incorrect. Check the newest email and try again.']);
    }

    private function sendOrFail(string $to, \Illuminate\Mail\Mailable $mail, string $field): void
    {
        try {
            \Illuminate\Support\Facades\Mail::to($to)->send($mail);
        } catch (\Throwable $exception) {
            \Illuminate\Support\Facades\Log::error('Change email code could not be sent. Check the MAIL_* settings in .env, then run php artisan config:clear.', [
                'to' => $to,
                'exception' => $exception,
            ]);
            \Illuminate\Support\Facades\Cache::forget($this->emailChangeKey(request()->user()));
            throw ValidationException::withMessages([$field => 'We could not send the code. Check the address and try again in a minute.']);
        }
    }

    /** Step 1: password (+ app code), then a code to the CURRENT email. */
    public function startEmailChange(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'code'             => ['nullable', 'digits:6'],
        ], [
            'code.digits' => 'The code must be exactly 6 numbers.',
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'Your current password is incorrect.']);
        }
        $this->assertAppCode($user, $data['code'] ?? null);

        $code = $this->newEmailChangeCode($user, ['stage' => 'old']);
        $this->sendOrFail((string) $user->email, new \App\Mail\EmailChangeApproveMail(
            $user->name,
            $code,
            self::EMAIL_CODE_MINUTES,
            $this->deviceLabel((string) $request->userAgent()),
        ), 'current_password');

        return response()->json([
            'message' => "We sent a 6-digit code to your current email, {$user->email}.",
            'expiresInMinutes' => self::EMAIL_CODE_MINUTES,
        ]);
    }

    /** Step 2: the code from the CURRENT email approves the change. */
    public function approveEmailChange(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['code' => ['required', 'digits:6']], [
            'code.digits' => 'The code must be exactly 6 numbers.',
        ]);

        $this->checkEmailChangeCode($user, $this->pendingAt($user, 'old'), $data['code']);
        \Illuminate\Support\Facades\Cache::put($this->emailChangeKey($user), ['stage' => 'approved'], now()->addMinutes(self::EMAIL_CODE_MINUTES));

        return response()->json(['message' => 'Approved. Now type your new email.']);
    }

    /** Step 3: only after approval, a code to the NEW email. */
    public function requestEmailChange(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->pendingAt($user, 'approved', 'email');

        $data = $request->validate([
            'email' => ['required', 'email', 'max:255', 'unique:users,email,'.$user->id],
        ], [
            'email.unique' => 'This email is already used by another account.',
        ]);
        $newEmail = trim($data['email']);
        if (mb_strtolower($newEmail) === mb_strtolower(trim((string) $user->email))) {
            throw ValidationException::withMessages(['email' => 'This is already your email.']);
        }

        // The approval may be used for one new email at a time.
        $code = $this->newEmailChangeCode($user, ['stage' => 'new', 'email' => $newEmail]);
        try {
            \Illuminate\Support\Facades\Mail::to($newEmail)->send(new \App\Mail\EmailChangeCodeMail($code, self::EMAIL_CODE_MINUTES));
        } catch (\Throwable $exception) {
            \Illuminate\Support\Facades\Log::error('Change email code could not be sent. Check the MAIL_* settings in .env, then run php artisan config:clear.', [
                'to' => $newEmail,
                'exception' => $exception,
            ]);
            // Keep the approval so the person can fix a typo and try again.
            \Illuminate\Support\Facades\Cache::put($this->emailChangeKey($user), ['stage' => 'approved'], now()->addMinutes(self::EMAIL_CODE_MINUTES));
            throw ValidationException::withMessages(['email' => 'We could not send a code to that email. Check the address and try again.']);
        }

        return response()->json([
            'message' => "We sent a 6-digit code to {$newEmail}.",
            'email' => $newEmail,
            'expiresInMinutes' => self::EMAIL_CODE_MINUTES,
        ]);
    }

    /** Step 4: the code from the NEW email changes the email. */
    public function confirmEmailChange(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['code' => ['required', 'digits:6']], [
            'code.digits' => 'The code must be exactly 6 numbers.',
        ]);

        $pending = $this->pendingAt($user, 'new');
        $this->checkEmailChangeCode($user, $pending, $data['code']);
        $key = $this->emailChangeKey($user);
        // Someone else may have taken the address in the last few minutes.
        if (User::where('email', $pending['email'])->where('id', '!=', $user->id)->exists()) {
            \Illuminate\Support\Facades\Cache::forget($key);
            throw ValidationException::withMessages(['code' => 'This email is already used by another account.']);
        }

        $oldEmail = (string) $user->email;
        $user->email = $pending['email'];
        $user->save();
        \Illuminate\Support\Facades\Cache::forget($key);

        ActivityLog::record('profile.email', 'Changed account email (approved by the old and the new email)', 'user');

        $changedAt = now()->timezone(config('app.business_timezone', 'Asia/Manila'))->format('M j, Y g:i A');
        $device = $this->deviceLabel((string) $request->userAgent());
        foreach ([$oldEmail, $pending['email']] as $to) {
            try {
                \Illuminate\Support\Facades\Mail::to($to)->send(new \App\Mail\EmailChangedMail($user->name, $pending['email'], $changedAt, $device));
            } catch (\Throwable $exception) {
                \Illuminate\Support\Facades\Log::error('Email changed notice could not be sent. Check the MAIL_* settings in .env, then run php artisan config:clear.', [
                    'to' => $to,
                    'exception' => $exception,
                ]);
            }
        }

        return response()->json($this->format($user->fresh()));
    }

    /**
     * Accounts with the authenticator app must type a correct, unused code
     * (Change Password and Change email share this check).
     */
    private function assertAppCode(User $user, $code): void
    {
        if (! $user->hasTwoFactor()) {
            return;
        }
        $code = (string) ($code ?? '');
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

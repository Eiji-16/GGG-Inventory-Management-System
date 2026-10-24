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

    /** POST /profile/password — change own password (requires current one). */
    public function changePassword(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'confirmed', Password::min(8)],
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'Your current password is incorrect.',
            ]);
        }

        $user->password = $data['password'];
        $user->save();

        ActivityLog::record('password.change', 'Changed account password', 'key');

        return response()->json(['message' => 'Your password has been updated.']);
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

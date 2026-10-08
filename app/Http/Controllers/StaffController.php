<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * StaffController — /staff
 *
 * Backs the Staffs tab. All actions are Super-Admin only (enforced here, not
 * just in the UI). Guards the last active Super Admin from being demoted,
 * deactivated, or deleted so the system can never lock everyone out.
 */
class StaffController extends Controller
{
    /** GET /staff?status=active|inactive (defaults to active accounts). */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $filters = $request->validate([
            'status' => ['sometimes', Rule::in([User::STATUS_ACTIVE, User::STATUS_INACTIVE])],
        ]);
        $lastActivity = $this->lastActivityByUser();

        $users = User::where('status', $filters['status'] ?? User::STATUS_ACTIVE)
            ->orderBy('name')
            ->get();

        return response()->json($users->map(fn (User $u) => $this->format($u, $lastActivity)));
    }

    /** POST /staff — create an account with a chosen role. */
    public function store(Request $request): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $data = $request->validate([
            'name'                  => ['required', 'string', 'max:255'],
            'email'                 => ['required', 'email', 'max:255', 'unique:users,email'],
            'password'              => ['required', 'confirmed', Password::min(8)],
            'role'                  => ['required', Rule::in(User::ROLES)],
        ]);

        $user = User::create([
            'name'     => $data['name'],
            'email'    => $data['email'],
            'password' => $data['password'],
            'role'     => $data['role'],
            'status'   => User::STATUS_ACTIVE,
        ]);

        \App\Models\ActivityLog::record('staff.create', "Created account — {$user->name} ({$user->role})", 'user', ['email' => $user->email]);

        return response()->json($this->format($user, []), 201);
    }

    /** PATCH /staff/{user} — change role and/or status. */
    public function update(Request $request, User $user): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        $data = $request->validate([
            'role'   => ['sometimes', Rule::in(User::ROLES)],
            'status' => ['sometimes', Rule::in([User::STATUS_ACTIVE, User::STATUS_INACTIVE])],
        ]);

        // Protect the last active Super Admin from losing that status.
        if (array_key_exists('role', $data) && $user->isSuperAdmin() && $data['role'] !== User::ROLE_SUPER_ADMIN) {
            $this->ensureNotLastSuperAdmin($user, 'demote');
        }
        if (array_key_exists('status', $data) && $user->isSuperAdmin() && $data['status'] === User::STATUS_INACTIVE) {
            $this->ensureNotLastSuperAdmin($user, 'deactivate');
        }

        $user->fill($data)->save();

        return response()->json($this->format($user->fresh(), $this->lastActivityByUser()));
    }

    /** DELETE /api/staff/{user} */
    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->authorizeSuperAdmin($request);

        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages([
                'user' => 'You cannot delete your own account.',
            ]);
        }
        if ($user->isSuperAdmin()) {
            $this->ensureNotLastSuperAdmin($user, 'delete');
        }

        $user->delete();

        return response()->json(['deleted' => true]);
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        abort_unless($request->user() && $request->user()->isSuperAdmin(), 403, 'Super Admin only.');
    }

    /** Block the action if it would remove the last active Super Admin. */
    private function ensureNotLastSuperAdmin(User $user, string $action): void
    {
        $otherActiveSupers = User::where('role', User::ROLE_SUPER_ADMIN)
            ->where('status', User::STATUS_ACTIVE)
            ->where('id', '!=', $user->id)
            ->count();

        if ($otherActiveSupers === 0) {
            throw ValidationException::withMessages([
                'user' => "This is the last active Super Admin — you cannot {$action} it.",
            ]);
        }
    }

    /** Most recent session activity per user id (unix timestamp). */
    private function lastActivityByUser(): array
    {
        if (config('session.driver') !== 'database') {
            return [];
        }

        return DB::table(config('session.table', 'sessions'))
            ->whereNotNull('user_id')
            ->select('user_id', DB::raw('MAX(last_activity) as last_activity'))
            ->groupBy('user_id')
            ->pluck('last_activity', 'user_id')
            ->toArray();
    }

    /** Shape a user for the Staffs tab (display-style role/status labels). */
    private function format(User $u, array $lastActivity): array
    {
        $roleLabels = [
            User::ROLE_SUPER_ADMIN => 'Super Admin',
            User::ROLE_ADMIN       => 'Admin',
            User::ROLE_STAFF       => 'Staff',
        ];

        $ts = $lastActivity[$u->id] ?? null;

        return [
            'id'         => $u->id,
            'name'       => $u->name,
            'email'      => $u->email,
            'role'       => $roleLabels[$u->role] ?? 'Staff',
            'status'     => $u->status === User::STATUS_INACTIVE ? 'Inactive' : 'Active',
            'lastActive' => $ts ? $this->humanizeTimestamp((int) $ts) : 'Never',
        ];
    }

    private function humanizeTimestamp(int $unix): string
    {
        $diff = now()->diffInSeconds(now()->createFromTimestamp($unix), true);

        if ($diff < 60) return 'Just now';
        if ($diff < 3600) return floor($diff / 60).' min ago';
        if ($diff < 86400) return now()->createFromTimestamp($unix)->format('Today · h:i A');
        if ($diff < 172800) return 'Yesterday · '.now()->createFromTimestamp($unix)->format('h:i A');

        return now()->createFromTimestamp($unix)->diffForHumans();
    }
}

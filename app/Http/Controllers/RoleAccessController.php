<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Services\RoleAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /api/role-access — what the signed-in user can do, plus the feature
 *                        names (for the Profile page). The Super Admin also
 *                        gets everyone's boxes for Settings.
 * PUT /api/role-access — Super Admin saves the boxes.
 */
class RoleAccessController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $payload = [
            'permissions' => RoleAccessService::effectiveFor($user),
            'catalog' => RoleAccessService::catalog(),   // feature names only, not secret
        ];

        if (RoleAccessService::isSuperAdmin($user)) {
            $payload['matrix'] = RoleAccessService::matrix();
            $payload['defaults'] = RoleAccessService::defaults();
        }

        return response()->json($payload)->header('Cache-Control', 'no-store');
    }

    public function update(Request $request): JsonResponse
    {
        abort_unless(RoleAccessService::isSuperAdmin($request->user()), 403, 'Only the Super Admin can change Role Access.');

        $data = $request->validate([
            'admin' => ['sometimes', 'array'],
            'admin.*' => ['boolean'],
            'staff' => ['sometimes', 'array'],
            'staff.*' => ['boolean'],
        ]);

        $before = RoleAccessService::matrix();
        $after = RoleAccessService::save($data);

        $changes = [];
        foreach (RoleAccessService::ROLES as $role) {
            foreach ($after[$role] as $key => $on) {
                if ($before[$role][$key] !== $on) {
                    $changes[] = ucfirst($role).': '.RoleAccessService::FEATURES[$key]['label'].' '.($on ? 'on' : 'off');
                }
            }
        }
        if ($changes !== []) {
            ActivityLog::record('settings.role_access', 'Changed Role Access ('.count($changes).' '.(count($changes) === 1 ? 'change' : 'changes').')', 'settings', [
                'changes' => $changes,
            ]);
        }

        return response()->json([
            'matrix' => $after,
            'permissions' => RoleAccessService::effectiveFor($request->user()),
        ]);
    }
}

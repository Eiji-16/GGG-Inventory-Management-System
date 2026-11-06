<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The system's name (2026-11-06), like the system logo: one name for the whole
 * system, chosen by the Super Admin in Settings. It is shown in the browser
 * tab, the sidebar, the login page, reports and emails.
 *
 * GET /branding/name   anyone (the login page needs it before sign-in)
 * PUT /branding/name   Super Admin only
 *
 * Saved in app_settings under "system_name" — no database change needed.
 */
class SystemNameController extends Controller
{
    /** GET /branding/name */
    public function show(): JsonResponse
    {
        return response()->json([
            'name' => AppSetting::systemName(),
            'default' => AppSetting::DEFAULT_SYSTEM_NAME,
        ])->header('Cache-Control', 'no-store');
    }

    /** PUT /branding/name — { name } (Super Admin only). */
    public function update(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isSuperAdmin(), 403, 'Only the Super Admin can change the system name.');

        // Tidy spaces first, so "  My   Shop " is saved as "My Shop".
        $request->merge(['name' => trim((string) preg_replace('/\s+/u', ' ', (string) $request->input('name', '')))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:'.AppSetting::SYSTEM_NAME_MAX, 'regex:/^[^<>]+$/u'],
        ], [
            'name.required' => 'Type a name for the system.',
            'name.min' => 'The name must be at least 2 characters.',
            'name.max' => 'The name can be up to '.AppSetting::SYSTEM_NAME_MAX.' characters.',
            'name.regex' => 'The name cannot contain < or >.',
        ]);

        $old = AppSetting::systemName();
        $name = $data['name'];
        // The default name is stored as "empty", so a later change of the
        // default (in code) still reaches systems that never renamed.
        AppSetting::put('system_name', $name === AppSetting::DEFAULT_SYSTEM_NAME ? null : $name);

        if ($old !== $name) {
            ActivityLog::record('settings.name', "Changed the system name from “{$old}” to “{$name}”", 'settings', [
                'from' => $old,
                'to' => $name,
            ]);
        }

        return response()->json(['name' => AppSetting::systemName(), 'default' => AppSetting::DEFAULT_SYSTEM_NAME]);
    }
}

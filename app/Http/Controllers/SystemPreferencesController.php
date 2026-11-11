<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * System rules (2026-11-11, Settings → "Security and defaults", Super Admin).
 *
 * GET /api/settings/system  every signed-in user: the default lead time and
 *                           whether the authenticator is required. The
 *                           Super Admin also gets the last backup time.
 * PUT /api/settings/system  Super Admin only (route): save either value.
 *
 * Saved in app_settings (no migration): "default_lead_time_days" and
 * "require_authenticator" ("1" = on).
 */
class SystemPreferencesController extends Controller
{
    /** A backup older than this many days shows the Dashboard reminder. */
    public const BACKUP_REMINDER_DAYS = 7;

    public function show(Request $request): JsonResponse
    {
        $body = [
            'defaultLeadTimeDays' => AppSetting::defaultLeadTimeDays(),
            'requireAuthenticator' => AppSetting::requireAuthenticator(),
        ];

        if ($request->user()?->role === User::ROLE_SUPER_ADMIN) {
            // Last full backup = the newest "Exported a full database backup" entry.
            $last = ActivityLog::query()->where('action', 'system.export')->latest()->value('created_at');
            $lastAt = $last ? \Illuminate\Support\Carbon::parse($last) : null;
            $body['lastBackupAt'] = $lastAt?->toIso8601String();
            $body['backupReminderDays'] = self::BACKUP_REMINDER_DAYS;
            $body['backupDue'] = $lastAt === null || $lastAt->lt(now()->subDays(self::BACKUP_REMINDER_DAYS));
            $body['accountsWithoutAuthenticator'] = User::query()
                ->where('status', User::STATUS_ACTIVE)
                ->where(fn ($q) => $q->whereNull('two_factor_confirmed_at')->orWhereNull('two_factor_secret'))
                ->count();
        }

        return response()->json($body)->header('Cache-Control', 'no-store');
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'defaultLeadTimeDays' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:365'],
            'requireAuthenticator' => ['sometimes', 'boolean'],
        ], [
            'defaultLeadTimeDays.max' => 'The default lead time cannot exceed 365 days.',
            'defaultLeadTimeDays.integer' => 'Enter the default lead time as a whole number of days.',
        ]);

        if (array_key_exists('defaultLeadTimeDays', $data)) {
            $before = AppSetting::defaultLeadTimeDays();
            $after = $data['defaultLeadTimeDays'];
            AppSetting::put('default_lead_time_days', $after === null ? null : (string) $after);
            if ($before !== $after) {
                ActivityLog::record('settings.lead_time', $after === null
                    ? 'Cleared the default lead time'
                    : "Set the default lead time to {$after} ".($after === 1 ? 'day' : 'days'), 'settings', [
                        'from' => $before,
                        'to' => $after,
                    ]);
            }
        }

        if (array_key_exists('requireAuthenticator', $data)) {
            $before = AppSetting::requireAuthenticator();
            $after = (bool) $data['requireAuthenticator'];
            AppSetting::put('require_authenticator', $after ? '1' : '0');
            if ($before !== $after) {
                ActivityLog::record('settings.require_2fa', $after
                    ? 'Turned on: every account must use the authenticator app'
                    : 'Turned off: the authenticator app is no longer required', 'shield');
            }
        }

        return $this->show($request);
    }
}

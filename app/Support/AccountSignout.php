<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Why a signed-in person was thrown out (2026-11-03).
 *
 * When a Super Admin deactivates or deletes an account, that account's
 * sessions are removed right away, so its next request is "not signed in".
 * Before removing them we leave a short note (30 minutes) under each removed
 * session's id. The next "not signed in" answer for that browser then says
 * WHY (deactivated / deleted), so the screen can show the 5-second pop-up.
 * The note only explains; it never lets anyone back in.
 */
class AccountSignout
{
    public const DEACTIVATED = 'account_deactivated';
    public const DELETED = 'account_deleted';
    public const ENDED = 'account_session_ended';

    private const PREFIX = 'account_signout:';

    public static function remember(string $sessionId, string $reason): void
    {
        if ($sessionId !== '') {
            Cache::put(self::PREFIX.$sessionId, $reason, now()->addMinutes(30));
        }
    }

    public static function reasonFor(?string $sessionId): ?string
    {
        if (! $sessionId) {
            return null;
        }
        $reason = Cache::get(self::PREFIX.$sessionId);

        return is_string($reason) ? $reason : null;
    }

    /** The JSON answer the screen understands (see src/layouts/App.jsx). */
    public static function payload(string $reason): array
    {
        $message = match ($reason) {
            self::DEACTIVATED => 'Your account has been deactivated by a Super Admin. You have been signed out. Please contact the Super Admin if you think this is a mistake.',
            self::DELETED => 'Your account has been deleted by a Super Admin. You have been signed out and can no longer use this account.',
            default => 'This account session is no longer active. Please sign in again.',
        };

        return ['code' => $reason, 'message' => $message];
    }
}

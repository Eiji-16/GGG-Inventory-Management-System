<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * ActivityLog — one audit-trail entry. Use ActivityLog::record(...) to add one.
 */
class ActivityLog extends Model
{
    protected $fillable = [
        'user_id',
        'action',
        'description',
        'icon',
        'meta',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Record an activity for a user (defaults to the authenticated user).
     * Never throws — logging must not break the action it describes.
     */
    public static function record(string $action, string $description, string $icon = null, array $meta = [], ?int $userId = null): void
    {
        try {
            static::create([
                'user_id'     => $userId ?? Auth::id(),
                'action'      => $action,
                'description' => $description,
                'icon'        => $icon,
                'meta'        => $meta ?: null,
            ]);
        } catch (\Throwable $e) {
            // Swallow — an audit-log failure should never block the real work.
        }
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * "Request Account Access" from the login page (see the 2026_11_03_000003
 * migration). pending → approved (setup link emailed) → completed (account
 * made), or rejected.
 */
class AccountRequest extends Model
{
    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';
    public const COMPLETED = 'completed';

    /** The setup link works for 24 hours. */
    public const LINK_HOURS = 24;

    protected $fillable = [
        'name', 'email', 'department', 'status', 'role', 'token_hash', 'token_expires_at',
        'claimed_session_hash', 'claimed_at', 'two_factor_secret', 'reviewed_by', 'reviewed_by_name',
        'reviewed_at', 'completed_at', 'user_id',
    ];

    protected $hidden = ['token_hash', 'claimed_session_hash', 'two_factor_secret'];

    protected function casts(): array
    {
        return [
            'token_expires_at' => 'datetime',
            'claimed_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'completed_at' => 'datetime',
            'two_factor_secret' => 'encrypted',
        ];
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }
}

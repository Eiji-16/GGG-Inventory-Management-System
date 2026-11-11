<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['name', 'email', 'password', 'role', 'status', 'department', 'currency'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret'])]
class User extends Authenticatable
{
    protected $attributes = [
        'currency' => 'USD',
    ];

    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, SoftDeletes;

    /** Role constants — the single source of truth for role names. */
    public const ROLE_SUPER_ADMIN = 'super_admin';
    public const ROLE_ADMIN = 'admin';
    public const ROLE_STAFF = 'staff';

    public const ROLES = [self::ROLE_SUPER_ADMIN, self::ROLE_ADMIN, self::ROLE_STAFF];

    /** Appearance themes a user can pick (same list as src/theme.js). */
    // 'olive' = the dark-frame / cream-panel theme. 'emerald' and 'magenta' were
    // removed from the screen but stay valid so older saved choices still load.
    public const THEMES = ['soft-white', 'lavender', 'citrus', 'olive', 'graphite', 'midnight-blue', 'emerald', 'magenta', 'ember', 'noir'];

    public const STATUS_ACTIVE = 'active';
    public const STATUS_INACTIVE = 'inactive';

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            // Authenticator-app secret (2FA), stored encrypted with APP_KEY.
            'two_factor_secret' => 'encrypted',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === self::ROLE_SUPER_ADMIN;
    }

    /**
     * Profile photo. The file is on the private "local" disk and its path is
     * kept in app_settings under "avatar.user.{id}" (no users column). The
     * person sets it in Profile; the Super Admin can also set it in Staffs.
     * No photo = the screens show the person's initials instead.
     */
    public function avatarSettingKey(): string
    {
        return 'avatar.user.'.$this->id;
    }

    public function avatarPath(): ?string
    {
        return AppSetting::get($this->avatarSettingKey()) ?: null;
    }

    /** Link for the person's own screens (sidebar, Profile), or null. */
    public function ownAvatarUrl(): ?string
    {
        $path = $this->avatarPath();

        return $path ? '/profile/avatar?v='.substr(md5($path), 0, 10) : null;
    }

    /** 2FA is on: signing in also needs the authenticator-app code. */
    public function hasTwoFactor(): bool
    {
        return $this->two_factor_confirmed_at !== null && ! empty($this->two_factor_secret);
    }

    /**
     * 2026-11-12: two-step sign-in by EMAIL instead of the authenticator app.
     * Chosen by the person on the "Connect your authenticator app" window
     * ("Use email codes instead"). Kept in app_settings (no users column),
     * like the profile photo. Each sign-in then emails a 6-digit code.
     */
    public function emailTwoFactorKey(): string
    {
        return 'two_factor_email.user.'.$this->id;
    }

    public function usesEmailTwoFactor(): bool
    {
        return AppSetting::get($this->emailTwoFactorKey()) === '1';
    }

    /** Signing in needs a second step: the authenticator app or an emailed code. */
    public function needsSecondStep(): bool
    {
        return $this->hasTwoFactor() || $this->usesEmailTwoFactor();
    }

    /**
     * "Remember this device" (2026-11-12): how many days a browser may skip
     * the second step after a correct code. Staff 30, Admin 7, Super Admin
     * never (0 = always ask for the code).
     */
    public function rememberDeviceDays(): int
    {
        return match ($this->role) {
            self::ROLE_STAFF => 30,
            self::ROLE_ADMIN => 7,
            default => 0,
        };
    }

    /** True for admin and super_admin (i.e. "admin or above"). */
    /**
     * The SUPER_ADMIN_EMAIL in .env counts as Super Admin ONLY while no
     * account has the super_admin role yet (an old database from before the
     * role column). Before 2026-11-10 it always counted, so after the Super
     * Admin changed their email, a Staff account could take the old address
     * in Profile and get every Super Admin power.
     */
    public function isConfiguredSuperAdminEmail(): bool
    {
        $email = config('auth.super_admin_email');
        if (! is_string($email) || $email === '' || ! hash_equals(strtolower($email), strtolower((string) $this->email))) {
            return false;
        }

        return ! static::query()->where('role', self::ROLE_SUPER_ADMIN)->exists();
    }

    public function isAdminOrAbove(): bool
    {
        return in_array($this->role, [self::ROLE_SUPER_ADMIN, self::ROLE_ADMIN], true);
    }
}

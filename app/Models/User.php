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
    public const THEMES = ['soft-white', 'lavender', 'citrus', 'olive', 'graphite', 'midnight-blue', 'emerald', 'magenta', 'ember'];

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

    /** True for admin and super_admin (i.e. "admin or above"). */
    public function isAdminOrAbove(): bool
    {
        return in_array($this->role, [self::ROLE_SUPER_ADMIN, self::ROLE_ADMIN], true);
    }
}

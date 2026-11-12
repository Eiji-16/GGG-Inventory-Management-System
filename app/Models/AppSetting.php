<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;

/**
 * AppSetting — system-wide key/value settings (e.g. the display currency).
 */
class AppSetting extends Model
{
    public const CURRENCIES = ['USD', 'PHP', 'EUR', 'GBP', 'JPY'];
    public const DEFAULT_CURRENCY = 'PHP';
    /** Name used until the Super Admin chooses another (Settings → System name). */
    public const DEFAULT_SYSTEM_NAME = 'GGG Inventory Management System';
    public const SYSTEM_NAME_MAX = 40;   // 2026-11-12: was 60 (fits the sidebar in two lines)

    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['key', 'value'];

    public static function get(string $key, ?string $default = null): ?string
    {
        try {
            return static::query()->whereKey($key)->value('value') ?? $default;
        } catch (QueryException $exception) {
            // Table not created yet (migration not run): use the default so
            // login and every screen keep working instead of failing with 500.
            report($exception);

            return $default;
        }
    }

    public static function put(string $key, ?string $value): void
    {
        static::query()->updateOrCreate(['key' => $key], ['value' => $value]);
    }

    /**
     * Default lead time (2026-11-11, Settings → Safety Stock Policy): days
     * used when neither the product's policy nor its supplier has a lead
     * time. Null = not set (then the reorder point is just the safety stock).
     */
    public static function defaultLeadTimeDays(): ?int
    {
        $value = static::get('default_lead_time_days');

        return $value === null || $value === '' ? null : max(0, min(365, (int) $value));
    }

    /**
     * Require the authenticator app for every account (2026-11-11, Settings).
     * When on, an account without it must set it up at its next sign-in.
     */
    public static function requireAuthenticator(): bool
    {
        return static::get('require_authenticator') === '1';
    }

    /**
     * URL of the sidebar picture the Super Admin chose, or null for the
     * default icon. The file lives on the private "local" disk and is served
     * by GET /branding/logo; ?v= changes with each new picture so browsers
     * don't keep showing the old one.
     */
    public static function logoUrl(): ?string
    {
        $path = static::get('logo');

        return $path ? '/branding/logo?v='.substr(md5($path), 0, 10) : null;
    }

    /**
     * The system's name (2026-11-06): browser tab, sidebar, login page,
     * reports, emails and the authenticator app label. Saved in app_settings
     * under "system_name"; empty means the default name.
     */
    public static function systemName(): string
    {
        $name = trim((string) static::get('system_name', ''));

        return $name !== '' ? mb_substr($name, 0, self::SYSTEM_NAME_MAX) : self::DEFAULT_SYSTEM_NAME;
    }

    /** The currency every screen and report displays amounts in. */
    public static function currency(): string
    {
        $currency = static::get('currency', self::DEFAULT_CURRENCY);

        return in_array($currency, self::CURRENCIES, true) ? $currency : self::DEFAULT_CURRENCY;
    }
}

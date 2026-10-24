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

    /** The currency every screen and report displays amounts in. */
    public static function currency(): string
    {
        $currency = static::get('currency', self::DEFAULT_CURRENCY);

        return in_array($currency, self::CURRENCIES, true) ? $currency : self::DEFAULT_CURRENCY;
    }
}

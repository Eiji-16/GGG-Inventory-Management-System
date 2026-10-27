<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * PastSale — units sold before the product's Stock Control records begin
 * (entered manually or imported from Excel). Forecasting history only.
 *
 * period_type 'month': period_date is the 1st of the month (month/year forecasts)
 * period_type 'week' : period_date is the Monday of the week (weekly forecasts)
 */
class PastSale extends Model
{
    protected $fillable = [
        'product_id',
        'period_type',
        'period_date',
        'units_sold',
        'source',
    ];

    protected $casts = [
        'units_sold' => 'integer',
    ];

    /** Always stored as a plain date so lookups match on every database. */
    protected function periodDate(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => $value === null ? null : Carbon::parse($value)->startOfDay(),
            set: fn ($value) => Carbon::parse($value)->toDateString(),
        );
    }

    /** Snap the date to the start of its period: the 1st of the month, or the week's Monday. */
    protected static function booted(): void
    {
        static::saving(function (PastSale $sale): void {
            $sale->period_type = $sale->period_type ?: 'month';
            $date = Carbon::parse($sale->getAttributes()['period_date']);
            $sale->setAttribute('period_date', $sale->period_type === 'week'
                ? $date->startOfWeek(Carbon::MONDAY)
                : $date->startOfMonth());
        });
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}

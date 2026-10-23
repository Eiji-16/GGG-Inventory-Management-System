<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * PastSale — monthly units sold before the product's Stock Control records
 * begin (entered manually or imported from Excel). Forecasting history only.
 */
class PastSale extends Model
{
    protected $fillable = [
        'product_id',
        'period_date',
        'units_sold',
        'source',
    ];

    protected $casts = [
        'units_sold' => 'integer',
    ];

    /** Always stored as a plain date (YYYY-MM-01) so month lookups match on every database. */
    protected function periodDate(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => $value === null ? null : Carbon::parse($value)->startOfDay(),
            set: fn ($value) => Carbon::parse($value)->startOfMonth()->toDateString(),
        );
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}

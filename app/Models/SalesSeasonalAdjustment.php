<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesSeasonalAdjustment extends Model
{
    protected $fillable = [
        'product_id',
        'year',
        'month',
        'enabled',
        'events',
    ];

    protected $casts = [
        'year' => 'integer',
        'month' => 'integer',
        'enabled' => 'boolean',
        'events' => 'array',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}

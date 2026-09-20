<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SafetyStock — per-product reorder policy (Super Admin owned).
 *
 * Table is `safety_stock` (singular), so it's set explicitly since Laravel would
 * otherwise expect `safety_stocks`.
 */
class SafetyStock extends Model
{
    protected $table = 'safety_stock';

    protected $fillable = [
        'product_id',
        'safety_stock',
        'annual_demand',
    ];

    protected $casts = [
        'safety_stock'  => 'integer',
        'annual_demand' => 'integer',
    ];

    /** The product this policy governs. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * StockMovement — one Stock In / Stock Out row in the append-only ledger.
 *
 * Not edited or deleted in normal use; corrections are new rows. When creating
 * a movement, update Product::stock_on_hand in the same DB transaction so the
 * cached balance never drifts from the ledger.
 */
class StockMovement extends Model
{
    protected $fillable = [
        'product_id',
        'product_name',
        'product_category',
        'movement_type',   // 'in' | 'out'
        'qty',
        'remaining_stock',
        'notes',
        'recorded_by',
        'movement_date',
    ];

    protected $casts = [
        'qty'             => 'integer',
        'remaining_stock' => 'integer',
        'movement_date'   => 'date',
    ];

    /** The product this movement applies to. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}

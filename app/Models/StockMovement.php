<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * StockMovement — one stock movement or physical-count adjustment in the ledger.
 *
 * Writes, edits, and deletions update Product::stock_on_hand transactionally.
 */
class StockMovement extends Model
{
    protected $fillable = [
        'product_id',
        'product_name',
        'product_category',
        'movement_type',   // 'in' | 'out'
        'is_adjustment',
        'qty',
        'variant_name',
        'remaining_stock',
        'notes',
        'recorded_by',
        'movement_date',
    ];

    protected $casts = [
        'qty'             => 'integer',
        'is_adjustment'   => 'boolean',
        'remaining_stock' => 'integer',
        'movement_date'   => 'date',
    ];

    /** The product this movement applies to. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}

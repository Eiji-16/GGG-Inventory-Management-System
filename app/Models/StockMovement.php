<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * StockMovement — one stock movement or physical-count adjustment in the ledger.
 *
 * Writes, edits, and deletions update Product::stock_on_hand transactionally.
 *
 * Trash Bin: deleting an entry only sets deleted_at (soft delete), so every
 * normal query (Stock Control, balances, reports, forecasts) skips it
 * automatically. It can be restored or permanently deleted from the Trash Bin.
 */
class StockMovement extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'product_id',
        'product_name',
        'product_category',
        'movement_type',   // 'in' | 'out'
        'is_adjustment',
        'qty',
        'unit_price',
        'variant_name',
        'remaining_stock',
        'notes',
        'recorded_by',
        'movement_date',
        'deleted_by',
        'deleted_by_name',
        'deleted_with_product',
    ];

    protected $casts = [
        'qty'             => 'integer',
        'unit_price'      => 'decimal:2',
        'is_adjustment'   => 'boolean',
        'remaining_stock' => 'integer',
        'movement_date'   => 'date',
        'deleted_with_product' => 'boolean',
    ];

    /**
     * Set (not saved) when a new entry was merged into this existing same-day
     * entry: the entry's quantity before the merge and the amount just added.
     * Used only for the response and the activity log.
     */
    public ?int $mergedFromQty = null;

    public ?int $mergedAddedQty = null;

    /** The product this movement applies to. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}

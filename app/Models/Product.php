<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Product — the catalogue item. Central model the whole system revolves around.
 *
 * `stock_on_hand` is a cached balance kept in sync by StockMovement writes;
 * treat the stock_movements ledger as the source of truth.
 */
class Product extends Model
{
    protected $fillable = [
        'code',
        'name',
        'category',
        'brand',
        'model',
        'unit_measure',
        'supplier_id',
        'stock_on_hand',
        'unit_cost',
    ];

    protected $casts = [
        'stock_on_hand' => 'integer',
        'unit_cost'     => 'decimal:2',
    ];

    /** The supplier this product is sourced from (nullable). */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** Every stock in/out event for this product (append-only ledger). */
    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    /** The reorder policy row for this product (safety stock + annual demand). */
    public function safetyStock(): HasOne
    {
        return $this->hasOne(SafetyStock::class);
    }

    /** Monthly units-sold history feeding the forecast. */
    public function salesHistory(): HasMany
    {
        return $this->hasMany(SalesHistory::class);
    }
}

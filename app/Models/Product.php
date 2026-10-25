<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Product — the catalogue item. Central model the whole system revolves around.
 *
 * `stock_on_hand` is the authoritative current balance. Stock movement writes
 * update it transactionally and reconcile ledger snapshots against it.
 */
class Product extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'code',
        'name',
        'category',
        'brand',
        'model',
        'unit_measure',
        'variants',
        'image',
        'supplier_id',
        'stock_on_hand',
        'unit_cost',
    ];

    protected $casts = [
        'stock_on_hand' => 'integer',
        'variants'      => 'array',
        'unit_cost'     => 'decimal:2',
    ];

    /** Every column except the photo (see scopeWithoutPhoto). */
    private const LIST_COLUMNS = [
        'id', 'code', 'name', 'category', 'brand', 'model', 'unit_measure', 'variants',
        'supplier_id', 'stock_on_hand', 'unit_cost', 'created_at', 'updated_at', 'deleted_at',
    ];

    /**
     * Read products WITHOUT their photos, for screens that list many products.
     * An older photo saved inside the database can be large, so instead of
     * the photo this gives "image_ref": the pasted link or stored file name,
     * or "1" for an in-database photo. ProductPhotoService::url() turns it
     * into the photo link.
     */
    public function scopeWithoutPhoto($query)
    {
        return $query
            ->select(array_map(fn (string $column) => 'products.'.$column, self::LIST_COLUMNS))
            ->selectRaw("CASE WHEN products.image IS NULL OR products.image = '' THEN NULL WHEN products.image LIKE 'data:%' THEN '1' ELSE products.image END AS image_ref");
    }

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

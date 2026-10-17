<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SalesHistory — units sold per product and reporting period.
 *
 * Table is `sales_history`, set explicitly so Laravel doesn't pluralise it to
 * `sales_histories`.
 */
class SalesHistory extends Model
{
    protected $table = 'sales_history';

    protected $fillable = [
        'product_id',
        'period_date',
        'period_type',
        'units_sold',
    ];

    protected $casts = [
        'period_date' => 'date',
        'units_sold'  => 'integer',
    ];

    /** The product these sales belong to. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}

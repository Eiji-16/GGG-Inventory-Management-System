<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Supplier — a company products are sourced from.
 * Backs the supplier fields in the Product & Supplier tab.
 */
class Supplier extends Model
{
    // Deleting moves it to the Trash Bin (restore or delete for good there).
    use SoftDeletes;

    protected $fillable = [
        'name',
        'contact',
        'company',
        'lead_time_days',
    ];

    protected $casts = [
        'lead_time_days' => 'integer',
    ];

    /** Products supplied by this company. */
    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

}

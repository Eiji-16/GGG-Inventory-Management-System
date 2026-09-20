<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Supplier — a company products are sourced from.
 * Backs the supplier fields in the Product & Supplier tab.
 */
class Supplier extends Model
{
    protected $fillable = [
        'name',
        'contact',
        'company',
    ];

    /** Products supplied by this company. */
    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}

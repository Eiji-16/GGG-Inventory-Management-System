<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * SeasonalEvent — a promotion or holiday that adjusts the WMA forecast for the
 * products it covers while its date range overlaps the forecast period.
 */
class SeasonalEvent extends Model
{
    protected $fillable = [
        'name',
        'start_date',
        'end_date',
        'adjustment_pct',
        'scope',
        'categories',
        'product_ids',
        'is_active',
    ];

    protected $casts = [
        'start_date'     => 'date',
        'end_date'       => 'date',
        'adjustment_pct' => 'float',
        'categories'     => 'array',
        'product_ids'    => 'array',
        'is_active'      => 'boolean',
    ];

    /** Active events whose date range overlaps [$start, $end]. */
    public function scopeOverlapping(Builder $query, Carbon $start, Carbon $end): Builder
    {
        return $query->where('is_active', true)
            ->whereDate('start_date', '<=', $end->toDateString())
            ->whereDate('end_date', '>=', $start->toDateString());
    }

    public function appliesTo(Product $product): bool
    {
        return match ($this->scope) {
            'categories' => in_array((string) $product->category, $this->categories ?? [], true),
            'products'   => in_array((string) $product->code, $this->product_ids ?? [], true),
            default      => true,
        };
    }

    /** Upcoming, Active, Done, or Paused relative to today. */
    public function status(): string
    {
        if (! $this->is_active) {
            return 'Paused';
        }
        $today = now()->startOfDay();
        if ($today->lt($this->start_date)) {
            return 'Upcoming';
        }
        if ($today->gt($this->end_date)) {
            return 'Done';
        }

        return 'Active';
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * RestockRequest — a Staff "Notify" from Reorder Alerts (see the migration).
 */
class RestockRequest extends Model
{
    public const STATUS_OPEN = 'open';
    public const STATUS_DONE = 'done';

    protected $fillable = ['product_id', 'requested_by', 'note', 'status', 'resolved_by', 'resolved_at'];

    protected $casts = [
        'resolved_at' => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    /** Close every open request for a product (e.g. when stock comes in). */
    public static function closeForProduct(int $productId, ?int $userId): int
    {
        return static::where('product_id', $productId)
            ->where('status', self::STATUS_OPEN)
            ->update(['status' => self::STATUS_DONE, 'resolved_by' => $userId, 'resolved_at' => now()]);
    }
}

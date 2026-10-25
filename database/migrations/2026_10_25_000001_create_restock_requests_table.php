<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Restock requests — the Staff "Notify" button in Reorder Alerts.
 *
 * A Staff member flags a low / out-of-stock product (with an optional note,
 * e.g. "customer asking for size L"). Admin and Super Admin see it in the
 * notification bell. A request closes when someone marks it done or when a
 * Stock In is recorded for that product. New table only — nothing existing
 * is changed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restock_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->string('status', 10)->default('open');   // open | done
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('restock_requests');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Trash Bin for suppliers and seasonal events.
 *
 * Deleting a supplier or a seasonal event now moves it to the Trash Bin
 * (like products and stock entries) instead of erasing it:
 *   deleted_at       when it was moved to the Trash Bin
 *   deleted_by       who did it (account id)
 *   deleted_by_name  their name, kept even if the account is removed later
 *
 * Only ADDS columns. No rows are changed or erased.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['suppliers', 'seasonal_events'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->softDeletes();
                $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('deleted_by_name')->nullable();
                $table->index('deleted_at');
            });
        }
    }

    public function down(): void
    {
        // Rolling back would bring trashed rows back as if never deleted.
        foreach (['suppliers', 'seasonal_events'] as $tableName) {
            $trashed = DB::table($tableName)->whereNotNull('deleted_at')->count();
            if ($trashed > 0) {
                throw new RuntimeException("There are {$trashed} {$tableName} in the Trash Bin. Restore or permanently delete them before rolling back this migration.");
            }
        }
        foreach (['suppliers', 'seasonal_events'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropIndex(['deleted_at']);
                $table->dropConstrainedForeignId('deleted_by');
                $table->dropColumn(['deleted_by_name', 'deleted_at']);
            });
        }
    }
};

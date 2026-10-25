<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Removes "Mark as ordered" from restock_requests (the feature was taken out
 * on Oct 25 because it isn't part of the system described in the paper).
 *
 * Deletes only rows with status "ordered" (test orders) and drops the four
 * order columns. Staff Notify requests (open / done) are kept as they are.
 * On a database that never had those columns, this does nothing.
 */
return new class extends Migration
{
    private const COLUMNS = ['ordered_qty', 'expected_date', 'ordered_by', 'ordered_at'];

    public function up(): void
    {
        if (! Schema::hasTable('restock_requests') || ! Schema::hasColumn('restock_requests', 'ordered_qty')) {
            return;
        }

        DB::table('restock_requests')->where('status', 'ordered')->delete();

        Schema::table('restock_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ordered_by');
            $table->dropColumn(['ordered_qty', 'expected_date', 'ordered_at']);
        });
    }

    public function down(): void
    {
        // The columns are not brought back: the feature no longer exists.
    }
};

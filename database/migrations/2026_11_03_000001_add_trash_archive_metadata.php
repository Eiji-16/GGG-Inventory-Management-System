<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->softDeletes();
            $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('deleted_by_name')->nullable();
            $table->timestamp('archived_at')->nullable()->index();
            $table->string('archived_by_name')->nullable();
        });

        foreach (['products', 'stock_movements', 'suppliers', 'seasonal_events'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->timestamp('archived_at')->nullable()->index();
                $table->string('archived_by_name')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['products', 'stock_movements', 'suppliers', 'seasonal_events'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropIndex(['archived_at']);
                $table->dropColumn(['archived_at', 'archived_by_name']);
            });
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['archived_at']);
            $table->dropColumn(['archived_at', 'archived_by_name']);
            $table->dropConstrainedForeignId('deleted_by');
            $table->dropColumn('deleted_by_name');
            $table->dropSoftDeletes();
        });
    }
};

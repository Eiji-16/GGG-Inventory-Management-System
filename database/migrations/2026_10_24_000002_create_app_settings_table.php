<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * System-wide settings (one row per key). First key: the display currency,
 * which used to be saved per user account. One business uses one currency, so
 * it now applies to every account. Starts as the owner's earlier choice if
 * they had changed it from the old USD default, otherwise PHP.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->string('value')->nullable();
            $table->timestamps();
        });

        $ownerChoice = Schema::hasColumn('users', 'currency')
            ? DB::table('users')
                ->where('role', 'super_admin')
                ->where('currency', '!=', 'USD')
                ->orderBy('id')
                ->value('currency')
            : null;

        DB::table('app_settings')->insert([
            'key' => 'currency',
            'value' => $ownerChoice ?: 'PHP',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('app_settings');
    }
};

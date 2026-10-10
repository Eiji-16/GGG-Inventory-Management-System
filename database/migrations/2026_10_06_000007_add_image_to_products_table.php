<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a persisted `image` to products. Stored as a base64 data URL (longText)
 * — the Product & Supplier form already produces one via FileReader; this lets
 * it survive a reload instead of living only in the browser session.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->longText('image')->nullable()->after('unit_measure');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('image');
        });
    }
};

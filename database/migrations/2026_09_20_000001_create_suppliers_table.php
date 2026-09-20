<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * suppliers — the companies that products are sourced from.
 *
 * In the current frontend (productSupplier.json) supplier info is denormalised
 * onto each product (supplierName / supplierContact / company / supplierInfo).
 * We normalise it here into its own table so a supplier is stored once and
 * products reference it by id — that's the whole reason we chose a relational DB.
 * The API layer can still hand the frontend the flat supplierName/etc. strings.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('name');                    // company / supplier display name
            $table->string('contact')->nullable();     // phone/email — maps to supplierContact
            $table->string('company')->nullable();     // legal/company name if different from `name`
            $table->timestamps();

            $table->unique('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers');
    }
};

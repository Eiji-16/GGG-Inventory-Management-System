<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * custom_formulas — user-defined formulas for the Auto Calculator.
 *
 * The EOQ formula ships as a built-in default in the frontend (it has a rich
 * cost-curve analysis). Everything the user adds via "Add Custom Formula" is
 * stored here so the calculator can recognise it, render the right number of
 * input fields, and evaluate it.
 *
 *   name            short tab label, e.g. "ROP"            (unique)
 *   full_name       e.g. "Reorder Point"
 *   description     what the formula computes
 *   expression      the evaluable math string, e.g. "d * L + SS"
 *                   (× ÷ √ ^ and the field keys are all understood)
 *   result_unit     unit shown next to the result, e.g. "units"
 *   fields          JSON array of { key, label, unit } — drives the dynamic
 *                   input form. The number of fields is whatever is stored here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custom_formulas', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('full_name');
            $table->string('description')->nullable();
            $table->string('expression');
            $table->string('result_unit')->nullable();
            $table->json('fields');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_formulas');
    }
};

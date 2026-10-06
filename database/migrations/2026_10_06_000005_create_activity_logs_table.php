<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * activity_logs — a per-user audit trail of notable actions (logins, stock
 * movements, product/formula/staff changes, security events). Powers the
 * "Recent Activity" feed on the User Profile.
 *
 *   action      short machine key, e.g. 'login', 'stock.in', 'password.change'
 *   description human-readable line shown in the feed
 *   icon        hint for the frontend icon (e.g. 'boxes', 'key', 'calculator')
 *   meta        optional JSON (subject name, qty, etc.)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action');
            $table->string('description');
            $table->string('icon')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};

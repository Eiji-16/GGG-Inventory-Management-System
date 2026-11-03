<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Account registration with email validation + 2FA (2026-11-03).
 *
 * account_requests: "Request Account Access" from the login page. The Super
 * Admin approves (or rejects) it; approving emails a one-time setup link.
 * Only a HASH of the link's secret is stored, never the secret itself.
 *
 * users: the authenticator-app secret (stored encrypted) and the time 2FA
 * was switched on. Only adds new things; no existing data is changed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->index();
            $table->string('department')->nullable();
            $table->string('status', 20)->default('pending')->index(); // pending | approved | rejected | completed
            $table->string('role', 20)->nullable();                     // set by the Super Admin on approval
            $table->string('token_hash', 64)->nullable()->unique();
            $table->timestamp('token_expires_at')->nullable();
            $table->string('claimed_session_hash', 64)->nullable();     // the browser that opened the link first
            $table->timestamp('claimed_at')->nullable();
            $table->text('two_factor_secret')->nullable();              // encrypted, only until set-up is finished
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reviewed_by_name')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->text('two_factor_secret')->nullable();
            $table->timestamp('two_factor_confirmed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['two_factor_secret', 'two_factor_confirmed_at']);
        });
        Schema::dropIfExists('account_requests');
    }
};

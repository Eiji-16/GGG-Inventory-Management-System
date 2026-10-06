<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a real `role` column to users so Admin / Staff actually exist in the
 * backend (previously "super admin" was only inferred from an .env email).
 *
 * Roles: super_admin | admin | staff (default staff — least privilege).
 *
 * Backfill: any user whose email matches the configured SUPER_ADMIN_EMAIL
 * becomes super_admin so the existing login keeps its powers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['super_admin', 'admin', 'staff'])
                  ->default('staff')
                  ->after('email');
        });

        $superAdminEmail = config('auth.super_admin_email');
        if (is_string($superAdminEmail) && $superAdminEmail !== '') {
            DB::table('users')
                ->whereRaw('LOWER(email) = ?', [strtolower($superAdminEmail)])
                ->update(['role' => 'super_admin']);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }
};

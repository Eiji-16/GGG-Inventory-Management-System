<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * No sample data is loaded: the old sample loader (InventorySeeder) used
 * mock files that were removed, and fake products must never reach the live
 * database. Create the first account with: php artisan inventory:create-admin
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        //
    }
}

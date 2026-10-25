<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** php artisan inventory:create-admin — the first account on a new server. */
class CreateSuperAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_an_active_super_admin_who_can_sign_in(): void
    {
        $this->artisan('inventory:create-admin', ['--name' => 'Shop Owner', '--email' => 'Owner@Example.com'])
            ->expectsQuestion('Password (at least 8 characters)', 'secret-pass-1')
            ->expectsQuestion('Type the password again', 'secret-pass-1')
            ->assertSuccessful();

        $user = User::where('email', 'owner@example.com')->firstOrFail();
        $this->assertSame(User::ROLE_SUPER_ADMIN, $user->role);
        $this->assertSame(User::STATUS_ACTIVE, $user->status);
        $this->assertTrue(Hash::check('secret-pass-1', $user->password));

        $this->postJson('/auth/login', ['email' => 'owner@example.com', 'password' => 'secret-pass-1'])->assertOk();
    }

    public function test_bad_input_changes_nothing(): void
    {
        $this->artisan('inventory:create-admin', ['--name' => 'Owner', '--email' => 'owner@example.com'])
            ->expectsQuestion('Password (at least 8 characters)', 'short')
            ->expectsQuestion('Type the password again', 'short')
            ->assertFailed();

        $this->assertSame(0, User::count());
    }

    public function test_asks_before_adding_another_super_admin(): void
    {
        User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);

        $this->artisan('inventory:create-admin')
            ->expectsConfirmation('There is already 1 active Super Admin account(s). Create another one?', 'no')
            ->assertSuccessful();

        $this->assertSame(1, User::count());
    }
}

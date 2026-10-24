<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The display currency is one system-wide setting (default PHP). */
class CurrencyPreferenceTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE]);
    }

    public function test_the_system_currency_defaults_to_php(): void
    {
        AppSetting::query()->whereKey('currency')->delete();

        $this->assertSame('PHP', AppSetting::currency());

        $this->actingAs($this->user(User::ROLE_STAFF))
            ->getJson('/auth/user')
            ->assertOk()
            ->assertJsonPath('user.currency', 'PHP');
    }

    public function test_an_admin_change_applies_to_every_account_and_survives_login(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $staff = $this->user(User::ROLE_STAFF);

        $this->actingAs($owner)
            ->putJson('/api/settings/currency', ['currency' => 'USD'])
            ->assertOk()
            ->assertJsonPath('currency', 'USD');
        $this->assertDatabaseHas('app_settings', ['key' => 'currency', 'value' => 'USD']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'settings.currency']);

        // Another account sees the same currency.
        $this->actingAs($staff)->getJson('/auth/user')->assertJsonPath('user.currency', 'USD');

        $this->postJson('/auth/logout')->assertOk();
        $this->postJson('/auth/login', ['email' => $owner->email, 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('user.currency', 'USD');
    }

    public function test_admins_can_change_it_but_staff_cannot(): void
    {
        $this->actingAs($this->user(User::ROLE_ADMIN))
            ->putJson('/api/settings/currency', ['currency' => 'EUR'])
            ->assertOk();

        $this->actingAs($this->user(User::ROLE_STAFF))
            ->putJson('/api/settings/currency', ['currency' => 'JPY'])
            ->assertForbidden();

        $this->assertSame('EUR', AppSetting::currency());
    }

    public function test_unsupported_currency_is_rejected(): void
    {
        $this->actingAs($this->user(User::ROLE_SUPER_ADMIN))
            ->putJson('/api/settings/currency', ['currency' => 'CAD'])
            ->assertUnprocessable();

        $this->assertSame('PHP', AppSetting::currency());
    }
}

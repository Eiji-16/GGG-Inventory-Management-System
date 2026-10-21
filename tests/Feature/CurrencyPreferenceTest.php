<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CurrencyPreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_default_to_usd_and_can_persist_their_currency_preference(): void
    {
        $databaseUserId = DB::table('users')->insertGetId([
            'name' => 'Default Currency User',
            'email' => 'default.currency@example.com',
            'password' => bcrypt('password'),
        ]);
        $this->assertDatabaseHas('users', [
            'id' => $databaseUserId,
            'currency' => 'USD',
        ]);

        $user = User::factory()->create(['status' => 'active']);
        $this->assertSame('USD', $user->currency);

        $this->actingAs($user)
            ->putJson('/api/settings/currency', ['currency' => 'PHP'])
            ->assertOk()
            ->assertJsonPath('currency', 'PHP');

        $this->getJson('/auth/user')
            ->assertOk()
            ->assertJsonPath('user.currency', 'PHP');

        $this->postJson('/auth/logout')->assertOk();
        $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertOk()->assertJsonPath('user.currency', 'PHP');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'currency' => 'PHP',
        ]);
    }

    public function test_currency_preference_is_scoped_to_the_authenticated_user(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $otherUser = User::factory()->create(['status' => 'active']);

        $this->actingAs($user)
            ->putJson('/api/settings/currency', ['currency' => 'EUR'])
            ->assertOk();

        $this->assertSame('USD', $otherUser->fresh()->currency);
    }

    public function test_unsupported_currency_is_rejected(): void
    {
        $user = User::factory()->create(['status' => 'active']);

        $this->actingAs($user)
            ->putJson('/api/settings/currency', ['currency' => 'CAD'])
            ->assertUnprocessable();

        $this->assertSame('USD', $user->fresh()->currency);
    }
}

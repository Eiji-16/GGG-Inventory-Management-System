<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Settings → Appearance: each account keeps its own theme. */
class ThemePreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_users_theme_is_saved_on_their_own_account_only(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();

        $this->actingAs($alice)->putJson('/profile/theme', ['theme' => 'emerald'])
            ->assertOk()->assertJsonPath('theme', 'emerald');

        $this->assertSame('emerald', $alice->fresh()->theme);
        $this->assertNull($bob->fresh()->theme);
    }

    public function test_the_signed_in_user_gets_their_theme_back(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $alice->forceFill(['theme' => 'ember'])->save();
        $bob->forceFill(['theme' => 'soft-white'])->save();

        $this->actingAs($alice)->getJson('/auth/user')->assertJsonPath('user.theme', 'ember');
        $this->actingAs($bob)->getJson('/auth/user')->assertJsonPath('user.theme', 'soft-white');
    }

    public function test_unknown_theme_is_rejected(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/profile/theme', ['theme' => 'neon-pink'])
            ->assertUnprocessable();
        $this->assertNull($user->fresh()->theme);
    }

    public function test_guests_cannot_save_a_theme(): void
    {
        $this->putJson('/profile/theme', ['theme' => 'emerald'])->assertUnauthorized();
    }
}

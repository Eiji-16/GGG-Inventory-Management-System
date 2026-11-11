<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 2026-11-12: a password needs 8+ characters and no spaces. Numbers and
 * special characters are only suggested on the screen.
 */
class PasswordRulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_password_without_numbers_is_accepted(): void
    {
        $user = User::factory()->create(['password' => 'Strong123', 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($user)->postJson('/profile/password', [
            'current_password' => 'Strong123',
            'password' => 'onlyletters',
            'password_confirmation' => 'onlyletters',
        ])->assertOk();
    }

    public function test_a_password_with_a_space_is_refused(): void
    {
        $user = User::factory()->create(['password' => 'Strong123', 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($user)->postJson('/profile/password', [
            'current_password' => 'Strong123',
            'password' => 'has a space',
            'password_confirmation' => 'has a space',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_a_short_password_is_refused(): void
    {
        $user = User::factory()->create(['password' => 'Strong123', 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($user)->postJson('/profile/password', [
            'current_password' => 'Strong123',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }
}

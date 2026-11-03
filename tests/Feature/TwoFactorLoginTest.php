<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Signing in with an authenticator app (2FA), 2026-11-03. */
class TwoFactorLoginTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private string $secret;

    protected function setUp(): void
    {
        parent::setUp();
        $this->secret = Totp::newSecret();
        $this->user = User::factory()->create(['password' => 'Strong123', 'role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        $this->user->forceFill(['two_factor_secret' => $this->secret, 'two_factor_confirmed_at' => now()])->save();
    }

    private function currentCode(): string
    {
        return Totp::codeAt($this->secret, intdiv(time(), 30));
    }

    public function test_totp_matches_the_rfc_6238_test_values(): void
    {
        $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
        $this->assertSame('287082', Totp::codeAt($secret, intdiv(59, 30)));
        $this->assertSame('081804', Totp::codeAt($secret, intdiv(1111111109, 30)));
        $this->assertSame('005924', Totp::codeAt($secret, intdiv(1234567890, 30)));
    }

    public function test_password_alone_does_not_sign_in(): void
    {
        $this->postJson('/auth/login', ['email' => $this->user->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('twoFactorRequired', true)
            ->assertJsonMissingPath('user');

        $this->assertGuest();
        $this->getJson('/auth/user')->assertUnauthorized();
    }

    public function test_correct_code_signs_in(): void
    {
        $this->postJson('/auth/login', ['email' => $this->user->email, 'password' => 'Strong123'])->assertOk();
        $this->postJson('/auth/two-factor', ['code' => $this->currentCode()])
            ->assertOk()
            ->assertJsonPath('user.email', $this->user->email);
        $this->assertAuthenticatedAs($this->user);
    }

    public function test_wrong_codes_are_refused_and_five_end_the_attempt(): void
    {
        $this->postJson('/auth/login', ['email' => $this->user->email, 'password' => 'Strong123'])->assertOk();
        $wrong = $this->currentCode() === '000000' ? '111111' : '000000';
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/auth/two-factor', ['code' => $wrong])->assertUnprocessable()->assertJsonValidationErrors('code');
        }
        $this->postJson('/auth/two-factor', ['code' => $wrong])->assertUnprocessable()->assertJsonPath('code', 'two_factor_expired');
        // Even the right code no longer works: start again with the password.
        $this->postJson('/auth/two-factor', ['code' => $this->currentCode()])->assertJsonPath('code', 'two_factor_expired');
        $this->assertGuest();
    }

    public function test_the_code_step_cannot_be_used_without_the_password_step(): void
    {
        $this->postJson('/auth/two-factor', ['code' => $this->currentCode()])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'two_factor_expired');
        $this->assertGuest();
    }

    public function test_a_code_cannot_be_used_twice(): void
    {
        $code = $this->currentCode();
        $this->postJson('/auth/login', ['email' => $this->user->email, 'password' => 'Strong123']);
        $this->postJson('/auth/two-factor', ['code' => $code])->assertOk();
        $this->postJson('/auth/logout');

        $this->postJson('/auth/login', ['email' => $this->user->email, 'password' => 'Strong123']);
        $this->postJson('/auth/two-factor', ['code' => $code])->assertUnprocessable();
    }

    public function test_super_admin_can_turn_off_2fa_for_a_lost_phone(): void
    {
        $superAdmin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($superAdmin)->deleteJson("/staff/{$this->user->id}/two-factor")->assertOk()->assertJsonPath('twoFactor', false);
        $this->assertFalse($this->user->fresh()->hasTwoFactor());
    }

    public function test_accounts_without_2fa_still_sign_in_with_the_password(): void
    {
        $plain = User::factory()->create(['password' => 'Strong123', 'status' => User::STATUS_ACTIVE]);
        $this->postJson('/auth/login', ['email' => $plain->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('user.email', $plain->email);
    }
}

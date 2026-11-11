<?php

namespace Tests\Feature;

use App\Mail\TwoFactorEmailCodeMail;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** 2026-11-11: "Send a code to my email" on the two-step sign-in window. */
class TwoFactorEmailCodeTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->user = User::factory()->create(['password' => 'Strong123', 'role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        $this->user->forceFill(['two_factor_secret' => Totp::newSecret(), 'two_factor_confirmed_at' => now()])->save();
    }

    private function passwordStep(): void
    {
        $this->postJson('/auth/login', ['email' => $this->user->email, 'password' => 'Strong123'])
            ->assertOk()->assertJsonPath('twoFactorRequired', true);
    }

    private function sentCode(): string
    {
        $code = null;
        Mail::assertSent(TwoFactorEmailCodeMail::class, function (TwoFactorEmailCodeMail $mail) use (&$code) {
            $code = $mail->code;

            return $mail->hasTo($this->user->email);
        });

        return (string) $code;
    }

    public function test_email_code_signs_in(): void
    {
        $this->passwordStep();
        $this->postJson('/auth/two-factor/email')->assertOk()->assertJsonPath('sent', true);
        $this->assertGuest();

        $this->postJson('/auth/two-factor/email/verify', ['code' => $this->sentCode()])
            ->assertOk()
            ->assertJsonPath('user.email', $this->user->email);
        $this->assertAuthenticatedAs($this->user);
    }

    public function test_no_email_without_the_correct_password_first(): void
    {
        $this->postJson('/auth/two-factor/email')->assertStatus(422)->assertJsonPath('code', 'two_factor_expired');
        Mail::assertNothingSent();
    }

    public function test_wrong_codes_are_refused_and_five_end_the_attempt(): void
    {
        $this->passwordStep();
        $this->postJson('/auth/two-factor/email')->assertOk();
        $wrong = $this->sentCode() === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/auth/two-factor/email/verify', ['code' => $wrong])->assertStatus(422)->assertJsonValidationErrors('code');
        }
        $this->postJson('/auth/two-factor/email/verify', ['code' => $wrong])->assertStatus(422)->assertJsonPath('code', 'two_factor_expired');
        $this->assertGuest();
    }

    public function test_a_new_code_needs_a_short_wait(): void
    {
        $this->passwordStep();
        $this->postJson('/auth/two-factor/email')->assertOk();
        $this->postJson('/auth/two-factor/email')->assertStatus(429);
        Mail::assertSent(TwoFactorEmailCodeMail::class, 1);
    }
}

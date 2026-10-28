<?php

namespace Tests\Feature;

use App\Mail\PasswordResetOtpMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Extra checks for the "Forgot password?" one-time code (OTP).
 * The basic happy path lives in LoginTest; these cover the safety rules.
 */
class OtpVerificationTest extends TestCase
{
    use RefreshDatabase;

    private function requestCode(User $user, ?string $typedEmail = null): string
    {
        $otp = null;
        $this->postJson('/auth/password/otp', ['email' => $typedEmail ?? $user->email])->assertOk();
        Mail::assertSent(PasswordResetOtpMail::class, function (PasswordResetOtpMail $mail) use (&$otp) {
            $otp = $mail->otp;

            return true;
        });

        return $otp;
    }

    private function reset(User $user, string $otp, string $password = 'NewStrongPassword123!')
    {
        return $this->postJson('/auth/password/reset', [
            'email' => $user->email,
            'otp' => $otp,
            'password' => $password,
            'password_confirmation' => $password,
        ]);
    }

    public function test_code_is_six_digits_and_stored_hashed_not_plain(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $otp = $this->requestCode($user);

        $this->assertMatchesRegularExpression('/^\d{6}$/', $otp);
        $row = \DB::table('password_reset_otps')->where('email', $user->email)->first();
        $this->assertNotSame($otp, $row->otp_hash);
        $this->assertTrue(Hash::check($otp, $row->otp_hash));
    }

    public function test_email_is_matched_without_caring_about_capital_letters(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email' => 'staff@example.com']);

        $otp = $this->requestCode($user, 'STAFF@Example.com');

        $this->reset($user, $otp)->assertOk();
        $this->assertTrue(Hash::check('NewStrongPassword123!', $user->fresh()->password));
    }

    public function test_expired_code_is_rejected(): void
    {
        Mail::fake();
        $user = User::factory()->create();
        $otp = $this->requestCode($user);

        $this->travel(11)->minutes();

        $this->reset($user, $otp)->assertUnprocessable()->assertJsonValidationErrors('otp');
        $this->assertFalse(Hash::check('NewStrongPassword123!', $user->fresh()->password));
    }

    public function test_code_is_locked_after_five_wrong_tries_even_if_the_right_code_comes_next(): void
    {
        Mail::fake();
        $user = User::factory()->create();
        $otp = $this->requestCode($user);
        $wrong = $otp === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 5; $i++) {
            $this->reset($user, $wrong)->assertUnprocessable();
        }

        $this->reset($user, $otp)->assertUnprocessable();
        $this->assertFalse(Hash::check('NewStrongPassword123!', $user->fresh()->password));
    }

    public function test_code_cannot_be_used_twice(): void
    {
        Mail::fake();
        $user = User::factory()->create();
        $otp = $this->requestCode($user);

        $this->reset($user, $otp)->assertOk();
        $this->reset($user, $otp, 'AnotherPassword456!')->assertUnprocessable();

        $this->assertTrue(Hash::check('NewStrongPassword123!', $user->fresh()->password));
    }

    public function test_asking_for_a_new_code_cancels_the_old_one(): void
    {
        Mail::fake();
        $user = User::factory()->create();
        $first = $this->requestCode($user);

        // Second request: get the newest mail's code.
        $this->postJson('/auth/password/otp', ['email' => $user->email])->assertOk();
        $codes = [];
        Mail::assertSent(PasswordResetOtpMail::class, function (PasswordResetOtpMail $mail) use (&$codes) {
            $codes[] = $mail->otp;

            return true;
        });
        $second = end($codes);

        if ($first !== $second) {
            $this->reset($user, $first)->assertUnprocessable();
        }
        $this->reset($user, $second)->assertOk();
    }

    public function test_code_must_be_exactly_six_digits(): void
    {
        Mail::fake();
        $user = User::factory()->create();
        $this->requestCode($user);

        $this->reset($user, '12345')->assertUnprocessable()->assertJsonValidationErrors('otp');
        $this->reset($user, 'abcdef')->assertUnprocessable()->assertJsonValidationErrors('otp');
    }

    public function test_sending_codes_is_limited_to_three_per_minute(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/auth/password/otp', ['email' => $user->email])->assertOk();
        }
        $this->postJson('/auth/password/otp', ['email' => $user->email])->assertStatus(429);
    }
}

<?php

namespace Tests\Feature;

use App\Mail\EmailChangeCodeMail;
use App\Mail\EmailChangedMail;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-11-19: Profile → Change email needs the password (and authenticator
 * code), then a code sent to the new address. Save no longer changes email.
 */
class EmailChangeTest extends TestCase
{
    use RefreshDatabase;

    private function owner(array $extra = []): User
    {
        return User::factory()->create($extra + [
            'email' => 'old@ggg.test',
            'password' => 'OldPassword1',
            'status' => User::STATUS_ACTIVE,
        ]);
    }

    /** Ask for the code and return it (read from the email that was sent). */
    private function requestCode(User $user, string $email = 'new@ggg.test', array $extra = []): string
    {
        Mail::fake();
        $this->actingAs($user)->postJson('/profile/email/request', $extra + [
            'email' => $email,
            'current_password' => 'OldPassword1',
        ])->assertOk();

        $code = '';
        Mail::assertSent(EmailChangeCodeMail::class, function (EmailChangeCodeMail $mail) use (&$code, $email) {
            $code = $mail->code;

            return $mail->hasTo($email);
        });

        return $code;
    }

    public function test_save_no_longer_changes_the_email_but_still_saves_the_same_email(): void
    {
        $user = $this->owner();

        $this->actingAs($user)->putJson('/profile', ['name' => 'Ana', 'email' => 'other@ggg.test'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
        $this->assertSame('old@ggg.test', $user->fresh()->email);

        // The whole form (same email, different case) still saves the name.
        $this->actingAs($user)->putJson('/profile', ['name' => 'Ana', 'email' => 'OLD@ggg.test'])->assertOk();
        $this->assertSame('Ana', $user->fresh()->name);
        $this->assertSame('old@ggg.test', $user->fresh()->email);
    }

    public function test_a_wrong_password_sends_no_code(): void
    {
        Mail::fake();
        $user = $this->owner();

        $this->actingAs($user)->postJson('/profile/email/request', [
            'email' => 'new@ggg.test',
            'current_password' => 'WrongPassword1',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        Mail::assertNothingSent();
    }

    public function test_authenticator_users_must_type_a_correct_app_code(): void
    {
        Mail::fake();
        $secret = Totp::newSecret();
        $user = $this->owner();
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => now()])->save();

        $this->actingAs($user)->postJson('/profile/email/request', [
            'email' => 'new@ggg.test',
            'current_password' => 'OldPassword1',
        ])->assertUnprocessable()->assertJsonValidationErrors('code');
        Mail::assertNothingSent();

        $this->requestCode($user, 'new@ggg.test', ['code' => Totp::codeAt($secret, intdiv(time(), 30))]);
    }

    public function test_the_email_changes_only_after_the_right_code_and_the_old_address_is_told(): void
    {
        $user = $this->owner();
        $code = $this->requestCode($user);

        // Asking for the code changes nothing yet.
        $this->assertSame('old@ggg.test', $user->fresh()->email);

        $wrong = $code === '111111' ? '222222' : '111111';
        $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $wrong])
            ->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertSame('old@ggg.test', $user->fresh()->email);

        $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('email', 'new@ggg.test');
        $this->assertSame('new@ggg.test', $user->fresh()->email);

        Mail::assertSent(EmailChangedMail::class, fn (EmailChangedMail $mail) => $mail->hasTo('old@ggg.test') && $mail->newEmail === 'new@ggg.test');

        // The code works only once.
        $this->actingAs($user->fresh())->postJson('/profile/email/confirm', ['code' => $code])->assertUnprocessable();
    }

    public function test_an_email_used_by_another_account_or_the_same_email_is_refused(): void
    {
        Mail::fake();
        $user = $this->owner();
        User::factory()->create(['email' => 'taken@ggg.test']);

        foreach (['taken@ggg.test', 'old@ggg.test'] as $email) {
            $this->actingAs($user)->postJson('/profile/email/request', [
                'email' => $email,
                'current_password' => 'OldPassword1',
            ])->assertUnprocessable()->assertJsonValidationErrors('email');
        }
        Mail::assertNothingSent();
    }

    public function test_an_expired_code_is_refused(): void
    {
        $user = $this->owner();
        $code = $this->requestCode($user);

        $this->travel(11)->minutes();

        $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $code])
            ->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertSame('old@ggg.test', $user->fresh()->email);
    }

    public function test_five_wrong_codes_mean_starting_again(): void
    {
        $user = $this->owner();
        $code = $this->requestCode($user);
        $wrong = $code === '111111' ? '222222' : '111111';

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $wrong])->assertUnprocessable();
        }
        // Even the right code no longer works: the change was cancelled.
        $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $code])->assertUnprocessable();
        $this->assertSame('old@ggg.test', $user->fresh()->email);
    }
}

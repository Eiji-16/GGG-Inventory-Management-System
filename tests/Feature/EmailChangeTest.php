<?php

namespace Tests\Feature;

use App\Mail\EmailChangeApproveMail;
use App\Mail\EmailChangeCodeMail;
use App\Mail\EmailChangedMail;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-11-19: Profile → Change email, double confirmation:
 * password (+ app code) → code to the CURRENT email → new email → code to
 * the NEW email. Profile Save no longer changes the email.
 */
class EmailChangeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function owner(): User
    {
        return User::factory()->create([
            'email' => 'old@ggg.test',
            'password' => 'OldPassword1',
            'status' => User::STATUS_ACTIVE,
        ]);
    }

    private function wrongFor(string $code): string
    {
        return $code === '111111' ? '222222' : '111111';
    }

    /** Step 1: returns the code sent to the current email. */
    private function start(User $user, array $extra = []): string
    {
        $this->actingAs($user)->postJson('/profile/email/start', $extra + ['current_password' => 'OldPassword1'])->assertOk();
        $code = '';
        Mail::assertSent(EmailChangeApproveMail::class, function (EmailChangeApproveMail $mail) use (&$code) {
            $code = $mail->code;

            return $mail->hasTo('old@ggg.test');
        });

        return $code;
    }

    /** Steps 1-3: returns the code sent to the new email. */
    private function upToNewCode(User $user, string $email = 'new@ggg.test'): string
    {
        $this->actingAs($user)->postJson('/profile/email/approve', ['code' => $this->start($user)])->assertOk();
        $this->actingAs($user)->postJson('/profile/email/request', ['email' => $email])->assertOk();
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
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertSame('old@ggg.test', $user->fresh()->email);

        $this->actingAs($user)->putJson('/profile', ['name' => 'Ana', 'email' => 'OLD@ggg.test'])->assertOk();
        $this->assertSame('Ana', $user->fresh()->name);
        $this->assertSame('old@ggg.test', $user->fresh()->email);
    }

    public function test_a_wrong_password_sends_nothing_to_the_owner(): void
    {
        $user = $this->owner();

        $this->actingAs($user)->postJson('/profile/email/start', ['current_password' => 'WrongPassword1'])
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');

        Mail::assertNothingSent();
    }

    public function test_authenticator_users_must_type_a_correct_app_code_first(): void
    {
        $secret = Totp::newSecret();
        $user = $this->owner();
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => now()])->save();

        $this->actingAs($user)->postJson('/profile/email/start', ['current_password' => 'OldPassword1'])
            ->assertUnprocessable()->assertJsonValidationErrors('code');
        Mail::assertNothingSent();

        $this->start($user, ['code' => Totp::codeAt($secret, intdiv(time(), 30))]);
    }

    public function test_a_new_email_cannot_be_sent_a_code_before_the_current_email_approves(): void
    {
        $user = $this->owner();

        // No approval at all.
        $this->actingAs($user)->postJson('/profile/email/request', ['email' => 'new@ggg.test'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');

        // Approval asked, but the code from the current email was wrong.
        $code = $this->start($user);
        $this->actingAs($user)->postJson('/profile/email/approve', ['code' => $this->wrongFor($code)])->assertUnprocessable();
        $this->actingAs($user)->postJson('/profile/email/request', ['email' => 'new@ggg.test'])->assertUnprocessable();

        Mail::assertNotSent(EmailChangeCodeMail::class);
    }

    public function test_the_full_double_confirmation_changes_the_email_and_tells_both_addresses(): void
    {
        $user = $this->owner();
        $code = $this->upToNewCode($user);

        // Still the old email until the new email's code is typed.
        $this->assertSame('old@ggg.test', $user->fresh()->email);
        $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $this->wrongFor($code)])->assertUnprocessable();
        $this->assertSame('old@ggg.test', $user->fresh()->email);

        $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $code])
            ->assertOk()->assertJsonPath('email', 'new@ggg.test');
        $this->assertSame('new@ggg.test', $user->fresh()->email);

        Mail::assertSent(EmailChangedMail::class, fn (EmailChangedMail $mail) => $mail->hasTo('old@ggg.test'));
        Mail::assertSent(EmailChangedMail::class, fn (EmailChangedMail $mail) => $mail->hasTo('new@ggg.test'));

        // Every code works only once.
        $this->actingAs($user->fresh())->postJson('/profile/email/confirm', ['code' => $code])->assertUnprocessable();
    }

    public function test_an_email_used_by_another_account_or_the_same_email_is_refused(): void
    {
        $user = $this->owner();
        User::factory()->create(['email' => 'taken@ggg.test']);
        $this->actingAs($user)->postJson('/profile/email/approve', ['code' => $this->start($user)])->assertOk();

        foreach (['taken@ggg.test', 'old@ggg.test'] as $email) {
            $this->actingAs($user)->postJson('/profile/email/request', ['email' => $email])
                ->assertUnprocessable()->assertJsonValidationErrors('email');
        }
        Mail::assertNotSent(EmailChangeCodeMail::class);
    }

    public function test_expired_codes_are_refused(): void
    {
        $user = $this->owner();
        $code = $this->start($user);

        $this->travel(11)->minutes();

        $this->actingAs($user)->postJson('/profile/email/approve', ['code' => $code])
            ->assertUnprocessable()->assertJsonValidationErrors('code');
    }

    public function test_five_wrong_codes_cancel_the_change(): void
    {
        $user = $this->owner();
        $code = $this->upToNewCode($user);

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $this->wrongFor($code)])->assertUnprocessable();
        }
        $this->actingAs($user)->postJson('/profile/email/confirm', ['code' => $code])->assertUnprocessable();
        $this->assertSame('old@ggg.test', $user->fresh()->email);
    }
}

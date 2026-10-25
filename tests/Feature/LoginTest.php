<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use App\Mail\PasswordResetOtpMail;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_log_in_with_email_and_password(): void
    {
        $user = User::factory()->create();

        $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonMissingPath('user.password');

        $this->assertAuthenticatedAs($user);
    }

    public function test_invalid_password_does_not_authenticate_user(): void
    {
        $user = User::factory()->create();

        $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertUnauthorized();

        $this->assertGuest();
    }

    public function test_authenticated_user_can_check_session_and_log_out(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->getJson('/auth/user')
            ->assertOk()
            ->assertJsonPath('user.id', $user->id);

        $this->postJson('/auth/logout')
            ->assertOk()
            ->assertJsonStructure(['csrfToken']);

        $this->assertGuest();
    }

    public function test_old_create_account_route_is_gone(): void
    {
        // Accounts are created in Staffs (POST /staff, Super Admin only, with a role).
        $admin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->actingAs($admin);

        $response = $this->postJson('/auth/users', [
            'name' => 'New Staff',
            'email' => 'new.staff@example.com',
            'password' => 'StrongPassword123!',
            'password_confirmation' => 'StrongPassword123!',
        ]);

        $this->assertNotSame(201, $response->status());
        $this->assertDatabaseMissing('users', ['email' => 'new.staff@example.com']);
    }

    public function test_existing_user_receives_password_reset_otp_and_can_reset_password(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/auth/password/otp', ['email' => $user->email])
            ->assertOk()
            ->assertJsonStructure(['message']);

        $otp = null;
        Mail::assertSent(PasswordResetOtpMail::class, function (PasswordResetOtpMail $mail) use (&$otp) {
            $otp = $mail->otp;
            $this->assertStringContainsString($mail->otp, $mail->render());

            return strlen($mail->otp) === 6;
        });
        $this->assertDatabaseHas('password_reset_otps', ['email' => $user->email]);

        $this->postJson('/auth/password/reset', [
            'email' => $user->email,
            'otp' => $otp,
            'password' => 'NewStrongPassword123!',
            'password_confirmation' => 'NewStrongPassword123!',
        ])
            ->assertOk()
            ->assertJsonStructure(['message']);

        $user->refresh();
        $this->assertTrue(Hash::check('NewStrongPassword123!', $user->password));
        $this->assertDatabaseMissing('password_reset_otps', ['email' => $user->email]);
    }

    public function test_password_reset_otp_request_does_not_disclose_unknown_emails(): void
    {
        Mail::fake();

        $this->postJson('/auth/password/otp', ['email' => 'unknown@example.com'])
            ->assertOk()
            ->assertJson([
                'message' => 'If an account exists for that email, a one-time code will be sent.',
            ]);

        Mail::assertNothingSent();
    }

    public function test_password_reset_rejects_an_incorrect_otp(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/auth/password/otp', ['email' => $user->email])->assertOk();
        $this->postJson('/auth/password/reset', [
            'email' => $user->email,
            'otp' => '000000',
            'password' => 'NewStrongPassword123!',
            'password_confirmation' => 'NewStrongPassword123!',
        ])->assertUnprocessable();
    }

    public function test_password_reset_mail_failure_shows_a_generic_message_and_logs_the_details(): void
    {
        $user = User::factory()->create();
        $mailer = \Mockery::mock();
        Mail::shouldReceive('to')->once()->with($user->email)->andReturn($mailer);
        $mailer->shouldReceive('send')
            ->once()
            ->andThrow(new \Symfony\Component\Mailer\Exception\TransportException('535-5.7.8 BadCredentials'));
        // The fix-it hint goes to the developer's log ...
        \Illuminate\Support\Facades\Log::shouldReceive('error')
            ->once()
            ->withArgs(fn ($message) => str_contains($message, 'Update MAIL_PASSWORD'));

        // ... and the login screen only gets a plain message (no settings names).
        $message = $this->postJson('/auth/password/otp', ['email' => $user->email])
            ->assertServiceUnavailable()
            ->json('message');
        $this->assertSame('We could not send the email right now. Please try again later or contact the Super Admin.', $message);
        $this->assertStringNotContainsString('MAIL_', $message);

        $this->assertDatabaseMissing('password_reset_otps', ['email' => $user->email]);
    }

    public function test_login_is_limited_after_five_wrong_tries_for_the_same_email(): void
    {
        $user = User::factory()->create(['password' => 'CorrectPassword123!']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'wrong-guess'])->assertUnauthorized();
        }

        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'CorrectPassword123!'])
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many login attempts. Please wait a minute and try again.');
    }
}

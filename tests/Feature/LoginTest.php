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

    public function test_super_admin_can_create_a_staff_account(): void
    {
        $admin = User::factory()->create(['email' => 'ajph305@gmail.com']);
        Config::set('auth.super_admin_email', $admin->email);
        $this->actingAs($admin);

        $this->postJson('/auth/users', [
            'name' => 'New Staff',
            'email' => 'new.staff@example.com',
            'password' => 'StrongPassword123!',
            'password_confirmation' => 'StrongPassword123!',
        ])
            ->assertCreated()
            ->assertJsonPath('user.email', 'new.staff@example.com')
            ->assertJsonMissingPath('user.password');

        $this->assertDatabaseHas('users', ['email' => 'new.staff@example.com']);
        $this->assertTrue(Hash::check(
            'StrongPassword123!',
            User::where('email', 'new.staff@example.com')->firstOrFail()->password
        ));
    }

    public function test_non_super_admin_cannot_create_a_staff_account(): void
    {
        $admin = User::factory()->create(['email' => 'ajph305@gmail.com']);
        $otherUser = User::factory()->create();
        Config::set('auth.super_admin_email', $admin->email);
        $this->actingAs($otherUser);

        $this->postJson('/auth/users', [
            'name' => 'Unauthorized Staff',
            'email' => 'unauthorized@example.com',
            'password' => 'StrongPassword123!',
            'password_confirmation' => 'StrongPassword123!',
        ])->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'unauthorized@example.com']);
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

    public function test_password_reset_reports_rejected_gmail_credentials(): void
    {
        $user = User::factory()->create();
        $mailer = \Mockery::mock();
        Mail::shouldReceive('to')->once()->with($user->email)->andReturn($mailer);
        $mailer->shouldReceive('send')
            ->once()
            ->andThrow(new \Symfony\Component\Mailer\Exception\TransportException('535-5.7.8 BadCredentials'));

        $this->postJson('/auth/password/otp', ['email' => $user->email])
            ->assertServiceUnavailable()
            ->assertJsonPath(
                'message',
                'Gmail rejected the mail credentials. Update MAIL_PASSWORD in .env with a valid Gmail App Password, then run php artisan config:clear.'
            );

        $this->assertDatabaseMissing('password_reset_otps', ['email' => $user->email]);
    }
}

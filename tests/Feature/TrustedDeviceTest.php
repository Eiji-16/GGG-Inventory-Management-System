<?php

namespace Tests\Feature;

use App\Mail\TwoFactorEmailCodeMail;
use App\Models\AppSetting;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-11-12: "Remember this device" (Staff 30 days, Admin 7, Super Admin
 * never) and choosing email codes instead of the authenticator app.
 */
class TrustedDeviceTest extends TestCase
{
    use RefreshDatabase;

    private function userWithApp(string $role): array
    {
        $secret = Totp::newSecret();
        $user = User::factory()->create(['password' => 'Strong123', 'role' => $role, 'status' => User::STATUS_ACTIVE]);
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => now()])->save();

        return [$user, $secret];
    }

    private function code(string $secret): string
    {
        return Totp::codeAt($secret, intdiv(time(), 30));
    }

    /**
     * Password + app code with "Remember this device"; returns the cookie value (or null).
     * Note: JSON test requests only send cookies after withCredentials().
     */
    private function signInAndRemember(User $user, string $secret): ?string
    {
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()->assertJsonPath('twoFactorRequired', true);
        $response = $this->postJson('/auth/two-factor', ['code' => $this->code($secret), 'remember' => true])->assertOk();
        $cookie = $response->getCookie('ggg_trusted_'.$user->id);
        $this->postJson('/auth/logout')->assertOk();

        return $cookie?->getValue();
    }

    public function test_staff_can_skip_the_code_on_a_remembered_device(): void
    {
        [$user, $secret] = $this->userWithApp(User::ROLE_STAFF);
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()->assertJsonPath('rememberDays', 30);
        $this->postJson('/auth/logout');

        $cookie = $this->signInAndRemember($user, $secret);
        $this->assertNotNull($cookie, 'The remember cookie was not saved.');

        $this->withCredentials()->withCookie('ggg_trusted_'.$user->id, $cookie)
            ->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('user.email', $user->email);
        $this->assertAuthenticatedAs($user);
    }

    public function test_admin_device_is_remembered_for_seven_days_only(): void
    {
        [$user, $secret] = $this->userWithApp(User::ROLE_ADMIN);
        $cookie = $this->signInAndRemember($user, $secret);
        $this->assertNotNull($cookie);

        $this->travel(8)->days();
        $this->withCredentials()->withCookie('ggg_trusted_'.$user->id, $cookie)
            ->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('twoFactorRequired', true);
        $this->assertGuest();
    }

    public function test_super_admin_always_needs_the_code(): void
    {
        [$user, $secret] = $this->userWithApp(User::ROLE_SUPER_ADMIN);
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()->assertJsonPath('rememberDays', 0);
        $response = $this->postJson('/auth/two-factor', ['code' => $this->code($secret), 'remember' => true])->assertOk();
        $this->assertNull($response->getCookie('ggg_trusted_'.$user->id), 'A Super Admin device must never be remembered.');
    }

    public function test_a_new_password_forgets_the_device(): void
    {
        [$user, $secret] = $this->userWithApp(User::ROLE_STAFF);
        $cookie = $this->signInAndRemember($user, $secret);

        $user->password = 'Another456';
        $user->save();

        $this->withCredentials()->withCookie('ggg_trusted_'.$user->id, $cookie)
            ->postJson('/auth/login', ['email' => $user->email, 'password' => 'Another456'])
            ->assertOk()
            ->assertJsonPath('twoFactorRequired', true);
    }

    public function test_a_cookie_of_another_account_does_not_work(): void
    {
        [$staff, $secret] = $this->userWithApp(User::ROLE_STAFF);
        [$other] = $this->userWithApp(User::ROLE_STAFF);
        $cookie = $this->signInAndRemember($staff, $secret);

        $this->withCredentials()->withCookie('ggg_trusted_'.$other->id, $cookie)
            ->postJson('/auth/login', ['email' => $other->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('twoFactorRequired', true);
    }

    public function test_email_codes_can_be_chosen_instead_of_the_app(): void
    {
        Mail::fake();
        AppSetting::put('require_authenticator', '1');
        $user = User::factory()->create(['password' => 'Strong123', 'role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);

        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()->assertJsonPath('twoFactorSetupRequired', true);
        $this->postJson('/auth/two-factor/setup/email')->assertOk()->assertJsonPath('sent', true);

        $code = null;
        Mail::assertSent(TwoFactorEmailCodeMail::class, function (TwoFactorEmailCodeMail $mail) use (&$code, $user) {
            $code = $mail->code;

            return $mail->hasTo($user->email);
        });
        $this->postJson('/auth/two-factor/email/verify', ['code' => $code])->assertOk()->assertJsonPath('user.email', $user->email);
        $this->assertTrue($user->fresh()->usesEmailTwoFactor());
        $this->postJson('/auth/logout');

        // Next sign-in: no setup again, an emailed code instead.
        $this->postJson('/auth/login', ['email' => $user->email, 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('twoFactorRequired', true)
            ->assertJsonPath('method', 'email');
        $this->assertGuest();
        // The authenticator path does not work for an email-code account.
        $this->postJson('/auth/two-factor', ['code' => '123456'])->assertStatus(422)->assertJsonPath('code', 'two_factor_expired');
    }

    public function test_choosing_email_needs_the_password_step_first(): void
    {
        Mail::fake();
        $this->postJson('/auth/two-factor/setup/email')->assertStatus(422)->assertJsonPath('code', 'two_factor_expired');
        Mail::assertNothingSent();
    }
}

<?php

namespace Tests\Feature;

use App\Mail\PasswordChangedMail;
use App\Models\AppSetting;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-11-16: Change Password security checks, and the safer "Turn off
 * authenticator" in Staffs.
 */
class PasswordChangeSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function change(User $user, array $extra = [])
    {
        return $this->actingAs($user)->postJson('/profile/password', $extra + [
            'current_password' => 'OldPassword1',
            'password' => 'NewPassword1',
            'password_confirmation' => 'NewPassword1',
        ]);
    }

    private function appUser(): array
    {
        $secret = Totp::newSecret();
        $user = User::factory()->create(['password' => 'OldPassword1', 'status' => User::STATUS_ACTIVE]);
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => now()])->save();

        return [$user, $secret];
    }

    public function test_the_new_password_must_be_different_from_the_current_one(): void
    {
        $user = User::factory()->create(['password' => 'OldPassword1', 'status' => User::STATUS_ACTIVE]);

        $this->change($user, ['password' => 'OldPassword1', 'password_confirmation' => 'OldPassword1'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
        $this->assertTrue(Hash::check('OldPassword1', $user->fresh()->password));
    }

    public function test_authenticator_users_must_type_a_correct_code(): void
    {
        [$user, $secret] = $this->appUser();

        $this->change($user)->assertUnprocessable()->assertJsonValidationErrors('code');
        $wrong = Totp::codeAt($secret, intdiv(time(), 30)) === '000000' ? '111111' : '000000';
        $this->change($user, ['code' => $wrong])->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertTrue(Hash::check('OldPassword1', $user->fresh()->password));

        $this->change($user, ['code' => Totp::codeAt($secret, intdiv(time(), 30))])->assertOk();
        $this->assertTrue(Hash::check('NewPassword1', $user->fresh()->password));
    }

    public function test_an_authenticator_code_cannot_be_used_twice(): void
    {
        [$user, $secret] = $this->appUser();
        $code = Totp::codeAt($secret, intdiv(time(), 30));

        $this->change($user, ['code' => $code])->assertOk();
        $this->actingAs($user->fresh())->postJson('/profile/password', [
            'current_password' => 'NewPassword1',
            'password' => 'ThirdPassword1',
            'password_confirmation' => 'ThirdPassword1',
            'code' => $code,
        ])->assertUnprocessable()->assertJsonValidationErrors('code');
    }

    public function test_accounts_without_the_app_do_not_need_a_code_and_get_an_email(): void
    {
        Mail::fake();
        $user = User::factory()->create(['password' => 'OldPassword1', 'status' => User::STATUS_ACTIVE]);
        $oldToken = $user->getRememberToken();

        $this->change($user)->assertOk()->assertJsonPath('signedOutDevices', 0);

        Mail::assertSent(PasswordChangedMail::class, fn (PasswordChangedMail $mail) => $mail->hasTo($user->email));
        $this->assertNotSame($oldToken, $user->fresh()->getRememberToken());   // "remember me" elsewhere stops working
    }

    public function test_too_many_tries_are_slowed_down(): void
    {
        $user = User::factory()->create(['password' => 'OldPassword1', 'status' => User::STATUS_ACTIVE]);
        for ($i = 0; $i < 5; $i++) {
            $this->change($user, ['current_password' => 'wrong-guess'])->assertUnprocessable();
        }
        $this->change($user, ['current_password' => 'wrong-guess'])->assertStatus(429);
    }

    public function test_profile_says_whether_the_authenticator_app_is_on(): void
    {
        [$user] = $this->appUser();
        $plain = User::factory()->create(['status' => User::STATUS_ACTIVE]);

        $this->actingAs($user)->getJson('/profile')->assertOk()->assertJsonPath('twoFactorApp', true);
        $this->actingAs($plain)->getJson('/profile')->assertOk()->assertJsonPath('twoFactorApp', false);
    }

    public function test_two_factor_policy_is_for_the_super_admin_only(): void
    {
        $super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($super)->getJson('/staff/two-factor-policy')->assertOk()->assertJsonPath('requireAuthenticator', false);
        AppSetting::put('require_authenticator', '1');
        $this->actingAs($super)->getJson('/staff/two-factor-policy')->assertOk()->assertJsonPath('requireAuthenticator', true);
        $this->actingAs($admin)->getJson('/staff/two-factor-policy')->assertForbidden();
    }

    public function test_turning_off_the_authenticator_stops_remember_me_cookies(): void
    {
        $super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        [$user] = $this->appUser();
        $oldToken = $user->getRememberToken();

        $this->actingAs($super)->deleteJson("/staff/{$user->id}/two-factor")->assertOk()->assertJsonPath('twoFactor', false);
        $this->assertNotSame($oldToken, $user->fresh()->getRememberToken());
    }
}

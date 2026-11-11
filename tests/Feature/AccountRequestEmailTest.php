<?php

namespace Tests\Feature;

use App\Mail\AccountInviteMail;
use App\Mail\AccountRequestMail;
use App\Models\AccountRequest;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-11-12: a new "Request Account Access" emails the Super Admin and the
 * Admins who may manage staff; new accounts can choose email codes; the data
 * version changes so the Staffs badge updates without a reload.
 */
class AccountRequestEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_request_emails_super_admin_and_admins_with_staff_access(): void
    {
        Mail::fake();
        $super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $adminWithAccess = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $inactiveAdmin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_INACTIVE]);
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);

        // Staff management is off for Admins by default: only the Super Admin.
        $this->postJson('/auth/account-request', ['name' => 'Ana Reyes', 'email' => 'ana@example.com'])->assertCreated();
        Mail::assertSent(AccountRequestMail::class, fn (AccountRequestMail $mail) => $mail->hasTo($super->email) && $mail->canApprove);
        Mail::assertNotSent(AccountRequestMail::class, fn (AccountRequestMail $mail) => $mail->hasTo($adminWithAccess->email));

        // Super Admin turns on "Manage Staff" for Admins.
        RoleAccessService::save(['admin' => ['staff.manage' => true]]);
        $this->assertTrue(RoleAccessService::allows($adminWithAccess, 'staff.manage'));

        $this->postJson('/auth/account-request', ['name' => 'Ben Cruz', 'email' => 'ben@example.com'])->assertCreated();
        Mail::assertSent(AccountRequestMail::class, fn (AccountRequestMail $mail) => $mail->hasTo($adminWithAccess->email)
            && $mail->requesterEmail === 'ben@example.com'
            && ! $mail->canApprove);
        Mail::assertNotSent(AccountRequestMail::class, fn (AccountRequestMail $mail) => $mail->hasTo($inactiveAdmin->email));
        Mail::assertNotSent(AccountRequestMail::class, fn (AccountRequestMail $mail) => $mail->hasTo($staff->email));
    }

    public function test_new_request_changes_the_data_version(): void
    {
        $super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $before = $this->actingAs($super)->getJson('/api/data-version')->assertOk()->json('version');
        AccountRequest::create(['name' => 'Ana Reyes', 'email' => 'ana@example.com', 'status' => AccountRequest::PENDING]);
        $after = $this->actingAs($super)->getJson('/api/data-version')->assertOk()->json('version');
        $this->assertNotSame($before, $after);
    }

    public function test_new_account_can_choose_email_codes_instead_of_the_app(): void
    {
        $super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->postJson('/auth/account-request', ['name' => 'Juan Dela Cruz', 'email' => 'juan@example.com'])->assertCreated();

        Mail::fake();
        $this->actingAs($super)
            ->postJson('/staff/account-requests/'.AccountRequest::first()->id.'/approve', ['role' => 'staff'])
            ->assertOk();
        $token = null;
        Mail::assertSent(AccountInviteMail::class, function (AccountInviteMail $mail) use (&$token) {
            parse_str((string) parse_url($mail->link, PHP_URL_QUERY), $query);
            $token = $query['token'] ?? null;

            return true;
        });
        auth()->logout();
        $this->flushSession();

        $this->withCredentials()->withCookie(config('session.cookie'), str_repeat('a', 40));
        $this->postJson('/auth/account-setup/check', ['token' => $token])->assertOk();
        $this->postJson('/auth/account-setup/complete', [
            'token' => $token, 'password' => 'Strong123', 'password_confirmation' => 'Strong123', 'method' => 'email',
        ])->assertOk();

        $user = User::where('email', 'juan@example.com')->first();
        $this->assertNotNull($user->email_verified_at);
        $this->assertFalse($user->hasTwoFactor());
        $this->assertTrue($user->usesEmailTwoFactor());

        $this->postJson('/auth/login', ['email' => 'juan@example.com', 'password' => 'Strong123'])
            ->assertOk()
            ->assertJsonPath('twoFactorRequired', true)
            ->assertJsonPath('method', 'email');
    }

    public function test_super_admin_can_turn_off_email_codes(): void
    {
        $super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
        \App\Models\AppSetting::put($staff->emailTwoFactorKey(), '1');

        $this->actingAs($super)->deleteJson("/staff/{$staff->id}/two-factor")->assertOk();
        $this->assertFalse($staff->fresh()->usesEmailTwoFactor());
    }
}

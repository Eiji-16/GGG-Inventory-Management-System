<?php

namespace Tests\Feature;

use App\Mail\AccountInviteMail;
use App\Models\AccountRequest;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Account registration with email validation + 2FA (2026-11-03):
 * request → Super Admin approves → one-time 24-hour link → password + QR.
 */
class AccountRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->superAdmin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
    }

    /** Pretend to be one browser (a fixed session cookie), like a real visitor. */
    private function asBrowser(string $letter): static
    {
        return $this->withCredentials()->withCookie(config('session.cookie'), str_repeat($letter, 40));
    }

    private function requestAccount(string $email = 'juan@example.com')
    {
        return $this->postJson('/auth/account-request', [
            'name' => 'Juan Dela Cruz',
            'email' => $email,
            'department' => 'Sales',
        ]);
    }

    /** Approve and return the secret from the emailed link. */
    private function approve(AccountRequest $request, string $role = 'staff'): string
    {
        Mail::fake();
        $this->actingAs($this->superAdmin)
            ->postJson("/staff/account-requests/{$request->id}/approve", ['role' => $role])
            ->assertOk()
            ->assertJsonPath('emailed', true);
        $token = null;
        Mail::assertSent(AccountInviteMail::class, function (AccountInviteMail $mail) use (&$token) {
            parse_str((string) parse_url($mail->link, PHP_URL_QUERY), $query);
            $token = $query['token'] ?? null;

            return true;
        });
        auth()->logout();
        $this->flushSession();

        return $token;
    }

    public function test_request_creates_a_pending_request(): void
    {
        $this->requestAccount()->assertCreated();
        $this->assertDatabaseHas('account_requests', ['email' => 'juan@example.com', 'status' => 'pending', 'department' => 'Sales']);
    }

    public function test_request_works_without_a_department(): void
    {
        $this->postJson('/auth/account-request', ['name' => 'Ana Reyes', 'email' => 'ana@example.com'])->assertCreated();
        $this->assertDatabaseHas('account_requests', ['email' => 'ana@example.com', 'status' => 'pending', 'department' => null]);
    }

    public function test_only_the_company_email_domain_can_request_when_set(): void
    {
        config(['auth.account_request_domains' => ['globalgrowthguide.com']]);
        $this->requestAccount('juan@gmail.com')->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->requestAccount('juan@globalgrowthguide.com')->assertCreated();
    }

    public function test_existing_accounts_and_duplicate_requests_are_refused(): void
    {
        $this->requestAccount($this->superAdmin->email)->assertUnprocessable();
        $this->requestAccount()->assertCreated();
        $this->requestAccount()->assertUnprocessable();
    }

    public function test_only_the_super_admin_can_see_and_approve_requests(): void
    {
        $this->requestAccount()->assertCreated();
        $request = AccountRequest::first();
        $staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);

        $this->actingAs($staff)->getJson('/staff/account-requests')->assertForbidden();
        $this->actingAs($staff)->postJson("/staff/account-requests/{$request->id}/approve", ['role' => 'staff'])->assertForbidden();
    }

    public function test_full_flow_creates_the_account_with_2fa_and_the_link_works_once(): void
    {
        $this->requestAccount()->assertCreated();
        $request = AccountRequest::first();
        $token = $this->approve($request, 'admin');

        $this->assertSame(64, strlen($token));
        $this->assertNotSame($token, $request->fresh()->token_hash, 'only a hash is stored');
        $this->assertSame(hash('sha256', $token), $request->fresh()->token_hash);

        $this->asBrowser('a');
        $check = $this->postJson('/auth/account-setup/check', ['token' => $token])->assertOk()
            ->assertJsonPath('email', 'juan@example.com')
            ->assertJsonPath('role', 'Admin');
        $secret = str_replace(' ', '', $check->json('twoFactor.secret'));

        // The account already exists (made on approval) but cannot sign in yet.
        $created = User::where('email', 'juan@example.com')->first();
        $this->assertNotNull($created);
        $this->assertNull($created->email_verified_at);
        $this->postJson('/auth/login', ['email' => 'juan@example.com', 'password' => 'anything'])
            ->assertForbidden()
            ->assertJsonPath('code', 'verify_email_first');

        // Wrong authenticator code: still not verified.
        $this->postJson('/auth/account-setup/complete', [
            'token' => $token, 'password' => 'Strong123', 'password_confirmation' => 'Strong123', 'code' => '000000',
        ])->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertNull($created->fresh()->email_verified_at);

        $this->postJson('/auth/account-setup/complete', [
            'token' => $token, 'password' => 'Strong123', 'password_confirmation' => 'Strong123',
            'code' => Totp::codeAt($secret, intdiv(time(), 30)),
        ])->assertOk();

        $user = User::where('email', 'juan@example.com')->first();
        $this->assertSame($created->id, $user->id, 'the same account is verified, no second one');
        $this->assertSame(User::ROLE_ADMIN, $user->role);
        $this->assertTrue($user->hasTwoFactor());
        $this->assertNotNull($user->email_verified_at);
        $this->assertTrue(Hash::check('Strong123', $user->password));
        $this->assertSame('completed', $request->fresh()->status);
        $this->assertNull($request->fresh()->token_hash);

        // Verified: signing in works now (password + authenticator code).
        $this->postJson('/auth/login', ['email' => 'juan@example.com', 'password' => 'Strong123'])
            ->assertOk()->assertJsonPath('twoFactorRequired', true);

        // One-time: the same link no longer works.
        $this->postJson('/auth/account-setup/check', ['token' => $token])->assertUnprocessable();
    }

    public function test_a_forwarded_link_does_not_work_in_another_browser(): void
    {
        $this->requestAccount()->assertCreated();
        $token = $this->approve(AccountRequest::first());

        $this->asBrowser('a')->postJson('/auth/account-setup/check', ['token' => $token])->assertOk();
        $this->asBrowser('a')->postJson('/auth/account-setup/check', ['token' => $token])->assertOk(); // same browser again: fine
        $this->asBrowser('b')->postJson('/auth/account-setup/check', ['token' => $token])   // a different browser
            ->assertUnprocessable()
            ->assertJsonValidationErrors('token');
    }

    public function test_the_link_expires_after_24_hours(): void
    {
        $this->requestAccount()->assertCreated();
        $token = $this->approve(AccountRequest::first());

        $this->travel(25)->hours();
        $this->postJson('/auth/account-setup/check', ['token' => $token])->assertUnprocessable();
    }

    public function test_sending_the_link_again_cancels_the_old_link(): void
    {
        $this->requestAccount()->assertCreated();
        $request = AccountRequest::first();
        $old = $this->approve($request);

        Mail::fake();
        $this->actingAs($this->superAdmin)->postJson("/staff/account-requests/{$request->id}/resend")->assertOk();
        auth()->logout();
        $this->flushSession();

        $this->postJson('/auth/account-setup/check', ['token' => $old])->assertUnprocessable();
    }

    public function test_approving_creates_the_account_and_staffs_shows_it_as_not_verified(): void
    {
        $this->requestAccount()->assertCreated();
        $this->approve(AccountRequest::first());

        $this->actingAs($this->superAdmin)->getJson('/staff')->assertOk()
            ->assertJsonFragment(['email' => 'juan@example.com', 'waitingVerification' => true]);
    }

    public function test_login_page_can_send_the_verification_link_again(): void
    {
        $this->requestAccount()->assertCreated();
        $old = $this->approve(AccountRequest::first());

        Mail::fake();
        $this->postJson('/auth/account-setup/resend', ['email' => 'juan@example.com'])->assertOk();
        Mail::assertSent(AccountInviteMail::class, 1);
        $this->postJson('/auth/account-setup/check', ['token' => $old])->assertUnprocessable();

        // Unknown emails get the same answer and no email.
        Mail::fake();
        $this->postJson('/auth/account-setup/resend', ['email' => 'nobody@example.com'])->assertOk();
        Mail::assertNothingSent();
    }

    public function test_cancelling_an_approved_request_moves_the_unverified_account_to_trash(): void
    {
        $this->requestAccount()->assertCreated();
        $request = AccountRequest::first();
        $this->approve($request);

        $this->actingAs($this->superAdmin)->postJson("/staff/account-requests/{$request->id}/reject")->assertOk();
        $this->assertSoftDeleted('users', ['email' => 'juan@example.com']);
    }

    public function test_rejected_requests_get_no_link(): void
    {
        $this->requestAccount()->assertCreated();
        $request = AccountRequest::first();
        $this->actingAs($this->superAdmin)->postJson("/staff/account-requests/{$request->id}/reject")->assertOk()->assertJsonPath('status', 'rejected');
    }
}

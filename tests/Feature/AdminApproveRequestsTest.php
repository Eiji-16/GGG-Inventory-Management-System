<?php

namespace Tests\Feature;

use App\Mail\AccountRequestMail;
use App\Models\AccountRequest;
use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * 2026-11-12: Role Access "Approve account requests" (Admin only, off by
 * default). An Admin with it can approve or reject requests, but only as
 * Staff; approving or changing an Admin invite stays Super Admin only.
 */
class AdminApproveRequestsTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE]);
    }

    private function pending(string $email = 'ana@example.com'): AccountRequest
    {
        return AccountRequest::create(['name' => 'Ana Reyes', 'email' => $email, 'status' => AccountRequest::PENDING]);
    }

    public function test_the_box_is_off_by_default_and_admin_is_refused(): void
    {
        $admin = $this->user(User::ROLE_ADMIN);
        $request = $this->pending();
        $this->assertFalse(RoleAccessService::allows($admin, 'staff.requests'));

        $this->actingAs($admin)->getJson('/staff/account-requests')->assertForbidden();
        $this->actingAs($admin)->postJson("/staff/account-requests/{$request->id}/approve", ['role' => 'staff'])->assertForbidden();
        $this->actingAs($admin)->postJson("/staff/account-requests/{$request->id}/reject")->assertForbidden();
    }

    public function test_the_box_needs_manage_staff_and_staff_can_never_get_it(): void
    {
        RoleAccessService::save(['admin' => ['staff.requests' => true], 'staff' => ['staff.manage' => true, 'staff.requests' => true]]);
        $this->assertFalse(RoleAccessService::allows($this->user(User::ROLE_ADMIN), 'staff.requests'), 'Needs "Open Manage Staff" too.');
        $this->assertFalse(RoleAccessService::allows($this->user(User::ROLE_STAFF), 'staff.requests'), 'Staff can never get it.');
    }

    public function test_admin_with_the_box_approves_as_staff_but_not_as_admin(): void
    {
        Mail::fake();
        RoleAccessService::save(['admin' => ['staff.manage' => true, 'staff.requests' => true]]);
        $admin = $this->user(User::ROLE_ADMIN);
        $first = $this->pending('ana@example.com');
        $second = $this->pending('ben@example.com');

        $this->actingAs($admin)->getJson('/staff/account-requests')->assertOk();

        $this->actingAs($admin)->postJson("/staff/account-requests/{$first->id}/approve", ['role' => 'admin'])->assertForbidden();
        $this->assertSame(AccountRequest::PENDING, $first->fresh()->status);
        $this->assertNull(User::where('email', 'ana@example.com')->first());

        $this->actingAs($admin)->postJson("/staff/account-requests/{$first->id}/approve", ['role' => 'staff'])->assertOk();
        $this->assertSame(User::ROLE_STAFF, User::where('email', 'ana@example.com')->first()->role);

        $this->actingAs($admin)->postJson("/staff/account-requests/{$first->id}/resend")->assertOk();
        $this->actingAs($admin)->postJson("/staff/account-requests/{$second->id}/reject")->assertOk()->assertJsonPath('status', 'rejected');
    }

    public function test_admin_cannot_resend_or_cancel_an_admin_invite(): void
    {
        Mail::fake();
        RoleAccessService::save(['admin' => ['staff.manage' => true, 'staff.requests' => true]]);
        $super = $this->user(User::ROLE_SUPER_ADMIN);
        $admin = $this->user(User::ROLE_ADMIN);
        $request = $this->pending();

        $this->actingAs($super)->postJson("/staff/account-requests/{$request->id}/approve", ['role' => 'admin'])->assertOk();

        $this->actingAs($admin)->postJson("/staff/account-requests/{$request->id}/resend")->assertForbidden();
        $this->actingAs($admin)->postJson("/staff/account-requests/{$request->id}/reject")->assertForbidden();
        $this->assertSame(AccountRequest::APPROVED, $request->fresh()->status);
    }

    public function test_admin_with_the_box_gets_the_review_email(): void
    {
        Mail::fake();
        RoleAccessService::save(['admin' => ['staff.manage' => true, 'staff.requests' => true]]);
        $admin = $this->user(User::ROLE_ADMIN);

        $this->postJson('/auth/account-request', ['name' => 'Ana Reyes', 'email' => 'ana@example.com'])->assertCreated();

        Mail::assertSent(AccountRequestMail::class, fn (AccountRequestMail $mail) => $mail->hasTo($admin->email) && $mail->canApprove);
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\RoleAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Role Access → "Manage Staff": the Super Admin lets an Admin manage STAFF accounts only. */
class StaffManageAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private User $admin;
    private User $staff;
    private User $otherAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->otherAdmin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE]);
    }

    public function test_it_is_off_for_admin_by_default_and_never_for_staff(): void
    {
        $this->assertFalse(RoleAccessService::allows($this->admin, 'staff.manage'));
        $this->actingAs($this->admin)->getJson('/staff')->assertForbidden();

        RoleAccessService::save(['staff' => ['staff.manage' => true]]);
        $this->assertFalse(RoleAccessService::allows($this->staff, 'staff.manage'));
        $this->actingAs($this->staff)->getJson('/staff')->assertForbidden();
    }

    public function test_admin_with_the_box_manages_staff_accounts_only(): void
    {
        RoleAccessService::save(['admin' => ['staff.manage' => true]]);
        $this->assertTrue(RoleAccessService::allows($this->admin, 'staff.manage'));

        $this->actingAs($this->admin)->getJson('/staff')->assertOk();

        // Create: Staff yes, Admin / Super Admin no.
        $new = ['name' => 'New Staff', 'email' => 'new@ggg.test', 'password' => 'secret123', 'password_confirmation' => 'secret123'];
        $this->actingAs($this->admin)->postJson('/staff', $new + ['role' => 'staff'])->assertCreated();
        $this->actingAs($this->admin)->postJson('/staff', ['email' => 'a2@ggg.test', 'role' => 'admin'] + $new)->assertForbidden();
        $this->actingAs($this->admin)->postJson('/staff', ['email' => 's2@ggg.test', 'role' => 'super_admin'] + $new)->assertForbidden();

        // Deactivate a Staff account: yes. Another Admin or the Super Admin: no.
        $this->actingAs($this->admin)->patchJson("/staff/{$this->staff->id}", ['status' => 'inactive'])->assertOk();
        $this->actingAs($this->admin)->patchJson("/staff/{$this->otherAdmin->id}", ['status' => 'inactive'])->assertForbidden();
        $this->actingAs($this->admin)->patchJson("/staff/{$this->super->id}", ['status' => 'inactive'])->assertForbidden();

        // Roles stay with the Super Admin.
        $this->actingAs($this->admin)->patchJson("/staff/{$this->staff->id}", ['role' => 'admin'])->assertForbidden();
        $this->assertSame(User::ROLE_STAFF, $this->staff->fresh()->role);

        // Delete the (deactivated) Staff account: yes.
        $this->actingAs($this->admin)->deleteJson("/staff/{$this->staff->id}", ['confirmation' => 'DELETE'])->assertOk();
    }

    public function test_the_super_admin_still_does_everything(): void
    {
        $this->actingAs($this->super)->patchJson("/staff/{$this->staff->id}", ['role' => 'admin'])->assertOk();
        $this->actingAs($this->super)->patchJson("/staff/{$this->otherAdmin->id}", ['status' => 'inactive'])->assertOk();
    }
}

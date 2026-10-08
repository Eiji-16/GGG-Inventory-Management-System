<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_lists_separate_accounts_by_status_and_activation_preserves_role(): void
    {
        $superAdmin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN]);
        $activeStaff = User::factory()->create(['role' => User::ROLE_STAFF]);
        $inactiveAdmin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_INACTIVE,
        ]);
        $this->actingAs($superAdmin);

        $this->getJson('/staff')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonMissing(['email' => $inactiveAdmin->email]);

        $this->getJson('/staff?status=inactive')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.email', $inactiveAdmin->email)
            ->assertJsonPath('0.status', 'Inactive');

        $this->patchJson("/staff/{$superAdmin->id}", ['status' => User::STATUS_INACTIVE])
            ->assertUnprocessable();

        $this->patchJson("/staff/{$activeStaff->id}", ['role' => User::ROLE_ADMIN])
            ->assertOk()
            ->assertJsonPath('role', 'Admin')
            ->assertJsonPath('status', 'Active');

        $this->patchJson("/staff/{$activeStaff->id}", ['status' => User::STATUS_INACTIVE])
            ->assertOk()
            ->assertJsonPath('status', 'Inactive')
            ->assertJsonPath('role', 'Admin');

        $this->getJson('/staff')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonMissing(['email' => $activeStaff->email]);

        $this->patchJson("/staff/{$inactiveAdmin->id}", ['status' => User::STATUS_ACTIVE])
            ->assertOk()
            ->assertJsonPath('status', 'Active')
            ->assertJsonPath('role', 'Admin');

        $this->getJson('/staff')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonFragment(['email' => $inactiveAdmin->email, 'role' => 'Admin', 'status' => 'Active']);
    }

    public function test_inactive_accounts_cannot_log_in(): void
    {
        $user = User::factory()->create([
            'status' => User::STATUS_INACTIVE,
        ]);

        $this->postJson('/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertForbidden();

        $this->assertGuest();
    }

    public function test_super_admin_can_create_active_staff_accounts(): void
    {
        $superAdmin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN]);
        $this->actingAs($superAdmin);

        $this->postJson('/staff', [
            'name' => 'New Staff',
            'email' => 'new.staff@example.com',
            'password' => 'StrongPassword123!',
            'password_confirmation' => 'StrongPassword123!',
            'role' => User::ROLE_STAFF,
        ])
            ->assertCreated()
            ->assertJsonPath('status', 'Active')
            ->assertJsonPath('role', 'Staff');

        $this->getJson('/staff')
            ->assertOk()
            ->assertJsonFragment(['email' => 'new.staff@example.com', 'role' => 'Staff', 'status' => 'Active']);
    }
}

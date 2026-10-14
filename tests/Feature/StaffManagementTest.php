<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
            'department' => 'Operations',
        ]);
        $existingPasswordHash = $inactiveAdmin->password;
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

        $this->assertSame($existingPasswordHash, $inactiveAdmin->fresh()->password);
        $this->assertSame('Operations', $inactiveAdmin->fresh()->department);

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

    public function test_only_active_super_admins_can_delete_and_active_accounts_are_rejected(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $inactiveStaff = User::factory()->create(['status' => User::STATUS_INACTIVE]);
        $activeStaff = User::factory()->create();

        $this->actingAs($admin)
            ->deleteJson("/staff/{$inactiveStaff->id}", ['confirmation' => 'DELETE'])
            ->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $inactiveStaff->id]);

        $inactiveSuperAdmin = User::factory()->create([
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_INACTIVE,
        ]);
        $this->actingAs($inactiveSuperAdmin)
            ->deleteJson("/staff/{$inactiveStaff->id}", ['confirmation' => 'DELETE'])
            ->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $inactiveStaff->id]);

        $superAdmin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN]);
        $this->actingAs($superAdmin)
            ->deleteJson("/staff/{$activeStaff->id}", ['confirmation' => 'DELETE'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user');
        $this->assertDatabaseHas('users', ['id' => $activeStaff->id]);

        $this->deleteJson("/staff/{$inactiveStaff->id}", ['confirmation' => 'delete'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('confirmation');
        $this->assertDatabaseHas('users', ['id' => $inactiveStaff->id]);
    }

    public function test_permanent_deletion_removes_only_target_access_and_preserves_activity_history(): void
    {
        config(['session.driver' => 'database']);
        $superAdmin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN]);
        $target = User::factory()->create([
            'status' => User::STATUS_INACTIVE,
            'email' => 'deactivated@example.com',
        ]);
        $other = User::factory()->create(['status' => User::STATUS_INACTIVE]);

        DB::table('sessions')->insert([
            [
                'id' => 'target-session',
                'user_id' => $target->id,
                'payload' => '',
                'last_activity' => time(),
            ],
            [
                'id' => 'other-session',
                'user_id' => $other->id,
                'payload' => '',
                'last_activity' => time(),
            ],
        ]);
        DB::table('password_reset_tokens')->insert([
            'email' => $target->email,
            'token' => 'target-reset-token',
        ]);
        DB::table('password_reset_otps')->insert([
            'email' => $target->email,
            'otp_hash' => 'hashed-otp',
            'expires_at' => now()->addMinutes(5),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('activity_logs')->insert([
            'user_id' => $target->id,
            'action' => 'stock.in',
            'description' => 'Historical stock activity',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($superAdmin)
            ->deleteJson("/staff/{$target->id}", ['confirmation' => 'DELETE'])
            ->assertOk()
            ->assertJson(['deleted' => true]);

        $this->assertDatabaseMissing('users', ['id' => $target->id]);
        $this->assertDatabaseHas('users', ['id' => $other->id]);
        $this->assertDatabaseMissing('sessions', ['id' => 'target-session']);
        $this->assertDatabaseHas('sessions', ['id' => 'other-session', 'user_id' => $other->id]);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $target->email]);
        $this->assertDatabaseMissing('password_reset_otps', ['email' => $target->email]);
        $this->assertDatabaseHas('activity_logs', [
            'user_id' => null,
            'action' => 'stock.in',
            'description' => 'Historical stock activity',
        ]);

        $deletionLog = DB::table('activity_logs')
            ->where('user_id', $superAdmin->id)
            ->where('action', 'staff.delete')
            ->first();
        $this->assertNotNull($deletionLog);
        $this->assertSame(
            $target->email,
            json_decode($deletionLog->meta, true)['deleted_user_email']
        );
    }
}

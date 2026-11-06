<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** System name (2026-11-06): one name for the whole system, chosen by the Super Admin. */
class SystemNameTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE]);
    }

    public function test_anyone_can_read_the_default_name_before_signing_in(): void
    {
        $this->getJson('/branding/name')
            ->assertOk()
            ->assertJsonPath('name', AppSetting::DEFAULT_SYSTEM_NAME)
            ->assertJsonPath('default', AppSetting::DEFAULT_SYSTEM_NAME);
    }

    public function test_super_admin_can_rename_and_everyone_sees_it(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);

        $this->actingAs($owner)
            ->putJson('/branding/name', ['name' => '  Piano   Stock Manager '])
            ->assertOk()
            ->assertJsonPath('name', 'Piano Stock Manager');   // extra spaces tidied

        $this->getJson('/branding/name')->assertJsonPath('name', 'Piano Stock Manager');
        $this->actingAs($this->user(User::ROLE_STAFF))
            ->getJson('/auth/user')
            ->assertOk()
            ->assertJsonPath('user.systemName', 'Piano Stock Manager');
        $this->assertDatabaseHas('activity_logs', ['action' => 'settings.name']);
    }

    public function test_admin_and_staff_cannot_rename(): void
    {
        $this->actingAs($this->user(User::ROLE_ADMIN))->putJson('/branding/name', ['name' => 'New Name'])->assertForbidden();
        $this->actingAs($this->user(User::ROLE_STAFF))->putJson('/branding/name', ['name' => 'New Name'])->assertForbidden();
        $this->assertSame(AppSetting::DEFAULT_SYSTEM_NAME, AppSetting::systemName());
    }

    public function test_guests_cannot_rename(): void
    {
        $this->putJson('/branding/name', ['name' => 'New Name'])->assertUnauthorized();
    }

    public function test_the_name_is_checked(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $this->actingAs($owner)->putJson('/branding/name', ['name' => '   '])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->actingAs($owner)->putJson('/branding/name', ['name' => 'A'])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->actingAs($owner)->putJson('/branding/name', ['name' => str_repeat('x', 61)])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->actingAs($owner)->putJson('/branding/name', ['name' => '<b>Shop</b>'])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->assertSame(AppSetting::DEFAULT_SYSTEM_NAME, AppSetting::systemName());
    }

    public function test_choosing_the_default_name_again_clears_the_setting(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $this->actingAs($owner)->putJson('/branding/name', ['name' => 'Other'])->assertOk();
        $this->actingAs($owner)->putJson('/branding/name', ['name' => AppSetting::DEFAULT_SYSTEM_NAME])->assertOk();

        $this->assertNull(AppSetting::get('system_name'));
        $this->assertSame(AppSetting::DEFAULT_SYSTEM_NAME, AppSetting::systemName());
    }
}

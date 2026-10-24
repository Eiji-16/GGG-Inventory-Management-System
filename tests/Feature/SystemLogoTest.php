<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Sidebar picture: one for the whole system, chosen by the Super Admin. */
class SystemLogoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'status' => User::STATUS_ACTIVE]);
    }

    public function test_default_is_no_picture(): void
    {
        $this->actingAs($this->user(User::ROLE_STAFF))
            ->getJson('/auth/user')
            ->assertOk()
            ->assertJsonPath('user.logoUrl', null);
    }

    public function test_super_admin_can_choose_a_picture_everyone_sees(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);

        $url = $this->actingAs($owner)
            ->post('/branding/logo', ['logo' => UploadedFile::fake()->image('shop.png', 200, 200)], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('logoUrl');

        $this->assertStringStartsWith('/branding/logo?v=', $url);
        Storage::disk('local')->assertExists(AppSetting::get('logo'));
        $this->assertDatabaseHas('activity_logs', ['action' => 'settings.logo']);

        // Staff see the same picture.
        $staff = $this->user(User::ROLE_STAFF);
        $this->actingAs($staff)->getJson('/auth/user')->assertJsonPath('user.logoUrl', $url);
        $this->actingAs($staff)->get('/branding/logo')->assertOk();
    }

    public function test_a_new_picture_replaces_the_old_file(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $this->actingAs($owner)->post('/branding/logo', ['logo' => UploadedFile::fake()->image('a.png')], ['Accept' => 'application/json'])->assertOk();
        $first = AppSetting::get('logo');

        $this->actingAs($owner)->post('/branding/logo', ['logo' => UploadedFile::fake()->image('b.jpg')], ['Accept' => 'application/json'])->assertOk();

        Storage::disk('local')->assertMissing($first);
        Storage::disk('local')->assertExists(AppSetting::get('logo'));
    }

    public function test_admin_and_staff_cannot_change_it(): void
    {
        foreach ([User::ROLE_ADMIN, User::ROLE_STAFF] as $role) {
            $this->actingAs($this->user($role))
                ->post('/branding/logo', ['logo' => UploadedFile::fake()->image('x.png')], ['Accept' => 'application/json'])
                ->assertForbidden();
            $this->actingAs($this->user($role))->deleteJson('/branding/logo')->assertForbidden();
        }

        $this->assertNull(AppSetting::get('logo'));
    }

    public function test_only_images_up_to_2mb_are_accepted(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);

        $this->actingAs($owner)
            ->post('/branding/logo', ['logo' => UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertUnprocessable();
        $this->actingAs($owner)
            ->post('/branding/logo', ['logo' => UploadedFile::fake()->image('big.png')->size(3000)], ['Accept' => 'application/json'])
            ->assertUnprocessable();

        $this->assertNull(AppSetting::get('logo'));
    }

    public function test_super_admin_can_remove_it(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $this->actingAs($owner)->post('/branding/logo', ['logo' => UploadedFile::fake()->image('a.png')], ['Accept' => 'application/json'])->assertOk();
        $path = AppSetting::get('logo');

        $this->actingAs($owner)->deleteJson('/branding/logo')->assertOk()->assertJsonPath('logoUrl', null);

        Storage::disk('local')->assertMissing($path);
        $this->actingAs($owner)->getJson('/auth/user')->assertJsonPath('user.logoUrl', null);
        $this->actingAs($owner)->get('/branding/logo')->assertNotFound();
    }
}

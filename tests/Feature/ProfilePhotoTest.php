<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Each user's own profile photo — separate from the system logo. */
class ProfilePhotoTest extends TestCase
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

    public function test_any_user_can_set_and_remove_their_own_photo(): void
    {
        $staff = $this->user(User::ROLE_STAFF);

        $this->actingAs($staff)->getJson('/profile')->assertJsonPath('avatarUrl', null);

        $url = $this->actingAs($staff)
            ->post('/profile/avatar', ['avatar' => UploadedFile::fake()->image('me.png')], ['Accept' => 'application/json'])
            ->assertOk()->json('avatarUrl');
        $this->assertStringStartsWith('/profile/avatar?v=', $url);
        $this->actingAs($staff)->getJson('/profile')->assertJsonPath('avatarUrl', $url);
        $this->actingAs($staff)->get('/profile/avatar')->assertOk();

        $this->actingAs($staff)->deleteJson('/profile/avatar')->assertOk();
        $this->actingAs($staff)->getJson('/profile')->assertJsonPath('avatarUrl', null);
        $this->assertSame([], Storage::disk('local')->allFiles('avatars'));
    }

    public function test_a_users_photo_is_not_the_system_logo_or_another_users_photo(): void
    {
        $owner = $this->user(User::ROLE_SUPER_ADMIN);
        $staff = $this->user(User::ROLE_STAFF);

        $this->actingAs($owner)
            ->post('/profile/avatar', ['avatar' => UploadedFile::fake()->image('owner.png')], ['Accept' => 'application/json'])
            ->assertOk();

        $this->assertNull(AppSetting::get('logo'), 'A profile photo must not change the system logo.');
        $this->actingAs($staff)->getJson('/profile')->assertJsonPath('avatarUrl', null);
        $this->actingAs($staff)->get('/profile/avatar')->assertNotFound();
    }
}

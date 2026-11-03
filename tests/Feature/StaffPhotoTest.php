<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Manage Staff: the Super Admin adds, changes and removes staff profile photos. */
class StaffPhotoTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE, 'name' => 'Maria Cruz']);
    }

    public function test_no_photo_means_null_so_the_screen_shows_initials(): void
    {
        $this->actingAs($this->super)->getJson('/staff')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Maria Cruz', 'avatarUrl' => null]);
    }

    public function test_super_admin_uploads_changes_and_removes_a_staff_photo(): void
    {
        $url = $this->actingAs($this->super)
            ->post("/staff/{$this->staff->id}/avatar", ['avatar' => UploadedFile::fake()->image('maria.jpg')], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('avatarUrl');
        $this->assertStringStartsWith("/staff/{$this->staff->id}/avatar?v=", $url);
        $first = $this->staff->avatarPath();
        Storage::disk('local')->assertExists($first);
        $this->actingAs($this->super)->get("/staff/{$this->staff->id}/avatar")->assertOk();

        // The same photo shows in the person's own Profile and sidebar.
        $this->actingAs($this->staff)->getJson('/profile')->assertJsonPath('avatarUrl', fn ($value) => is_string($value));
        $this->actingAs($this->staff)->getJson('/auth/user')->assertJsonPath('user.avatarUrl', fn ($value) => is_string($value));

        // Change: the old file is removed.
        $this->actingAs($this->super)
            ->post("/staff/{$this->staff->id}/avatar", ['avatar' => UploadedFile::fake()->image('new.png')], ['Accept' => 'application/json'])
            ->assertOk();
        Storage::disk('local')->assertMissing($first);

        // Remove: back to initials.
        $this->actingAs($this->super)->deleteJson("/staff/{$this->staff->id}/avatar")->assertOk()->assertJsonPath('avatarUrl', null);
        $this->assertNull(AppSetting::get($this->staff->avatarSettingKey()));
    }

    public function test_only_pictures_up_to_2_mb_are_accepted(): void
    {
        $this->actingAs($this->super)
            ->post("/staff/{$this->staff->id}/avatar", ['avatar' => UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertUnprocessable();
        $this->actingAs($this->super)
            ->post("/staff/{$this->staff->id}/avatar", ['avatar' => UploadedFile::fake()->image('big.jpg')->size(3000)], ['Accept' => 'application/json'])
            ->assertUnprocessable();
    }

    public function test_staff_and_admin_cannot_change_other_peoples_photos(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        foreach ([$this->staff, $admin] as $actor) {
            $this->actingAs($actor)
                ->post("/staff/{$this->super->id}/avatar", ['avatar' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])
                ->assertForbidden();
            $this->actingAs($actor)->deleteJson("/staff/{$this->super->id}/avatar")->assertForbidden();
        }
    }
}

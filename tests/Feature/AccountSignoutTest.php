<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\AccountSignout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A deactivated or deleted account is signed out at once, with the reason for the pop-up. */
class AccountSignoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_deactivated_account_gets_the_deactivated_reason(): void
    {
        $user = User::factory()->create(['status' => User::STATUS_ACTIVE]);
        $this->actingAs($user)->getJson('/auth/user')->assertOk();

        $user->forceFill(['status' => User::STATUS_INACTIVE])->save();
        $this->getJson('/auth/user')->assertUnauthorized()->assertJsonPath('code', AccountSignout::DEACTIVATED);
        $this->assertGuest();
    }

    public function test_deleted_account_gets_the_deleted_reason(): void
    {
        $user = User::factory()->create(['status' => User::STATUS_ACTIVE]);
        $this->actingAs($user);
        $user->delete();

        $this->getJson('/auth/user')->assertUnauthorized()->assertJsonPath('code', AccountSignout::DELETED);
    }

    public function test_a_removed_session_still_learns_why(): void
    {
        $sessionId = str_repeat('c', 40);
        AccountSignout::remember($sessionId, AccountSignout::DEACTIVATED);

        $this->withCredentials()->withCookie(config('session.cookie'), $sessionId)->getJson('/auth/user')->assertUnauthorized()->assertJsonPath('code', AccountSignout::DEACTIVATED);
    }
}

<?php

namespace Tests\Concerns;

use App\Models\User;

trait AuthenticatesBusinessApi
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs(User::factory()->make([
            'role' => User::ROLE_SUPER_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]));
    }
}

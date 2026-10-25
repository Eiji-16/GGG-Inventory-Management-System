<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierActivityLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_adding_editing_and_deleting_a_supplier_is_logged(): void
    {
        $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]));

        $id = $this->postJson('/api/suppliers', ['name' => 'Log Supplier'])->assertCreated()->json('id');
        $this->putJson("/api/suppliers/{$id}", ['name' => 'Log Supplier Co.'])->assertOk();
        $this->deleteJson("/api/suppliers/{$id}")->assertOk();

        $this->assertDatabaseHas('activity_logs', ['action' => 'supplier.add', 'description' => 'Added supplier — Log Supplier']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'supplier.edit', 'description' => 'Updated supplier — Log Supplier Co.']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'supplier.delete', 'description' => 'Deleted supplier — Log Supplier Co.']);
    }
}

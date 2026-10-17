<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryAgingReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_stock_without_stock_in_uses_product_creation_date_as_estimate(): void
    {
        $product = Product::create([
            'code' => 'PRD-AGING',
            'name' => 'Aging Estimate Product',
            'stock_on_hand' => 12,
        ]);
        $product->forceFill([
            'created_at' => now()->subDays(70),
            'updated_at' => now()->subDays(70),
        ])->save();

        $this->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('inventoryAging.rows.0.product', 'Aging Estimate Product')
            ->assertJsonPath('inventoryAging.rows.0.daysInStock', 70)
            ->assertJsonPath('inventoryAging.rows.0.ageEstimated', true)
            ->assertJsonPath('inventoryAging.rows.0.status', 'Aging');
    }
}

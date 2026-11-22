<?php

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/* ===== JUNK INPUT GETS A MESSAGE, NOT A CRASH (2026-11-22) =====
   Found by sending junk to every route: a list where text was expected
   crashed these two with a server error (500). */
class JunkInputTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_received_with_a_list_instead_of_text_is_refused_politely(): void
    {
        Product::create(['code' => 'PRD-J1', 'name' => 'Glue', 'stock_on_hand' => 0]);

        $this->postJson('/api/reorder/receive', ['productId' => ['a' => ['b']], 'qty' => 1, 'unitPrice' => 1])
            ->assertUnprocessable()->assertJsonValidationErrors('productId');
        $this->postJson('/api/reorder/receive', ['productId' => 'PRD-J1', 'variantName' => ['Large'], 'qty' => 1, 'unitPrice' => 1])
            ->assertUnprocessable()->assertJsonValidationErrors('variantName');
    }

    public function test_system_name_with_a_list_instead_of_text_is_refused_politely(): void
    {
        $this->putJson('/branding/name', ['name' => ['n']])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
    }
}

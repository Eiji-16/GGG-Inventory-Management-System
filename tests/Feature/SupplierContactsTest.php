<?php

namespace Tests\Feature;

use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesBusinessApi;
use Tests\TestCase;

/* ===== SUPPLIER WITH MORE THAN ONE CONTACT (2026-11-22) =====
   The Suppliers screen saves several contacts in the Contact field as
   "a; b; c". The server keeps them exactly and sends them back. */
class SupplierContactsTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesBusinessApi;

    public function test_several_contacts_are_saved_and_returned(): void
    {
        $id = $this->postJson('/api/suppliers', [
            'name' => '3M Philippines',
            'contact' => '09684347044; 09171234567',
            'leadTimeDays' => 7,
        ])->assertCreated()->assertJsonPath('contact', '09684347044; 09171234567')->json('id');

        $this->putJson("/api/suppliers/{$id}", [
            'name' => '3M Philippines',
            'contact' => '09684347044; 09171234567; orders@3m.com.ph',
            'leadTimeDays' => 7,
        ])->assertOk()->assertJsonPath('contact', '09684347044; 09171234567; orders@3m.com.ph');

        $this->assertSame('09684347044; 09171234567; orders@3m.com.ph', Supplier::find($id)->contact);
        $this->getJson('/api/suppliers')->assertOk()->assertJsonPath('0.contact', '09684347044; 09171234567; orders@3m.com.ph');
    }

    public function test_removing_every_contact_clears_it(): void
    {
        $supplier = Supplier::create(['name' => 'Bostik', 'contact' => '09667728867; 09180000000']);

        $this->putJson("/api/suppliers/{$supplier->id}", ['name' => 'Bostik', 'contact' => null])->assertOk();

        $this->assertNull($supplier->fresh()->contact);
    }

    public function test_five_contacts_are_allowed_and_six_are_refused(): void
    {
        $this->postJson('/api/suppliers', ['name' => 'Five', 'contact' => 'a1; a2; a3; a4; a5'])->assertCreated();
        $this->postJson('/api/suppliers', ['name' => 'Six', 'contact' => 'a1; a2; a3; a4; a5; a6'])
            ->assertUnprocessable()->assertJsonValidationErrors('contact');
    }

    public function test_contacts_longer_than_the_field_are_refused(): void
    {
        $this->postJson('/api/suppliers', [
            'name' => 'Too Many Contacts',
            'contact' => str_repeat('09171234567; ', 25),
        ])->assertUnprocessable()->assertJsonValidationErrors('contact');
    }
}

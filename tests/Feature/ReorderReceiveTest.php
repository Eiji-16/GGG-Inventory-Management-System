<?php

namespace Tests\Feature;

use App\Mail\RestockRequestMail;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Reorder List 2026-11-03: Received with a proof photo, saved Restock Report, Request emails. */
class ReorderReceiveTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE, 'name' => 'Maria']);
        $this->admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        Product::create(['code' => 'PRD-R1', 'name' => 'Router', 'stock_on_hand' => 1]);
    }

    private function receive(User $user, array $extra = [])
    {
        return $this->actingAs($user)->post('/api/reorder/receive', $extra + [
            'productId' => 'PRD-R1',
            'qty' => 6,
            'unitPrice' => 299,
            'date' => now('Asia/Manila')->toDateString(),
            'choice' => 'report',
            'suggestedQty' => 3,
            'photo' => UploadedFile::fake()->image('delivery.jpg', 640, 480),
        ], ['Accept' => 'application/json']);
    }

    public function test_staff_can_receive_with_a_photo_and_stock_goes_up(): void
    {
        $response = $this->receive($this->staff)->assertCreated()->assertJsonPath('hasProof', true);
        $id = $response->json('id');

        $this->assertSame(7, (int) Product::where('code', 'PRD-R1')->value('stock_on_hand'));
        $this->assertCount(1, Storage::disk('local')->files("delivery-proofs/{$id}"));
        $this->assertStringContainsString('System suggested: 3', $response->json('notes'));
        $this->assertStringContainsString('saved Restock Report', $response->json('notes'));

        $this->actingAs($this->admin)->get("/api/stock-movements/{$id}/proof")->assertOk();
        $this->actingAs($this->admin)->getJson('/api/stock-movements')->assertOk()->assertJsonPath('0.hasProof', true);
    }

    public function test_the_photo_is_optional(): void
    {
        // 2026-11-06: the proof photo is optional; the delivery is still recorded.
        $this->receive($this->staff, ['photo' => null])->assertCreated()->assertJsonPath('hasProof', false);
        $this->assertSame(7, (int) Product::where('code', 'PRD-R1')->value('stock_on_hand'));
    }

    public function test_only_pictures_are_accepted(): void
    {
        $this->receive($this->staff, ['photo' => UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf')])
            ->assertUnprocessable()->assertJsonValidationErrors('photo');
    }

    public function test_saved_report_quantity_is_kept_until_received(): void
    {
        $this->actingAs($this->admin)->postJson('/api/restock-report', ['items' => [['productId' => 'PRD-R1', 'qty' => 6, 'suggested' => 3]]])->assertOk();
        $this->actingAs($this->staff)->getJson('/api/restock-report')->assertOk()->assertJsonPath('PRD-R1.qty', 6);

        $this->receive($this->staff)->assertCreated();
        $this->actingAs($this->staff)->getJson('/api/restock-report')->assertOk()->assertJsonMissingPath('PRD-R1');
    }

    public function test_staff_cannot_save_a_restock_report(): void
    {
        $this->actingAs($this->staff)->postJson('/api/restock-report', ['items' => [['productId' => 'PRD-R1', 'qty' => 6]]])->assertForbidden();
    }

    public function test_request_emails_the_admins(): void
    {
        Mail::fake();
        $superAdmin = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_INACTIVE]);

        $this->actingAs($this->staff)->postJson('/api/restock-requests', ['productId' => 'PRD-R1', 'note' => 'Customer waiting'])
            ->assertCreated()
            ->assertJsonPath('emailed', 2);

        Mail::assertSent(RestockRequestMail::class, 2);
        Mail::assertSent(RestockRequestMail::class, fn ($mail) => $mail->hasTo($superAdmin->email) && $mail->note === 'Customer waiting');
    }
}

<?php

namespace Tests\Feature;

use App\Mail\DeliveryReceivedMail;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * 2026-11-12: when a Staff member presses "Received", the Admins and Super
 * Admins get an email with the proof photo (or "No picture was attached").
 */
class DeliveryReceivedEmailTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private User $admin;
    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
        $this->staff = User::factory()->create(['role' => User::ROLE_STAFF, 'status' => User::STATUS_ACTIVE, 'name' => 'Maria']);
        $this->admin = User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_ACTIVE]);
        $this->super = User::factory()->create(['role' => User::ROLE_SUPER_ADMIN, 'status' => User::STATUS_ACTIVE]);
        User::factory()->create(['role' => User::ROLE_ADMIN, 'status' => User::STATUS_INACTIVE]);
        Product::create(['code' => 'PRD-SHIRT', 'name' => 'GGG Shirt', 'stock_on_hand' => 2]);
    }

    private function receive(User $user, ?UploadedFile $photo)
    {
        return $this->actingAs($user)->post('/api/reorder/receive', [
            'productId' => 'PRD-SHIRT',
            'qty' => 10,
            'unitPrice' => 150,
            'date' => now('Asia/Manila')->toDateString(),
            'choice' => 'custom',
            'notes' => 'Box was slightly wet',
            'photo' => $photo,
        ], ['Accept' => 'application/json']);
    }

    public function test_staff_delivery_with_photo_emails_admins_and_super_admins(): void
    {
        $this->receive($this->staff, UploadedFile::fake()->image('delivery.jpg', 640, 480))
            ->assertCreated()
            ->assertJsonPath('emailed', 2);

        Mail::assertSent(DeliveryReceivedMail::class, 2);
        foreach ([$this->admin, $this->super] as $boss) {
            Mail::assertSent(DeliveryReceivedMail::class, fn (DeliveryReceivedMail $mail) => $mail->hasTo($boss->email)
                && $mail->hasPhoto()
                && $mail->qty === 10
                && $mail->stockNow === 12
                && $mail->receivedBy === 'Maria'
                && $mail->note === 'Box was slightly wet');
        }
    }

    public function test_staff_delivery_without_photo_says_no_picture(): void
    {
        $this->receive($this->staff, null)->assertCreated()->assertJsonPath('emailed', 2);
        Mail::assertSent(DeliveryReceivedMail::class, fn (DeliveryReceivedMail $mail) => ! $mail->hasPhoto());

        $html = (new DeliveryReceivedMail('GGG Shirt', 'PRD-SHIRT', null, 10, 12, 'Maria', null, 'Nov 12, 2026 5:00 PM', null, null, null))->render();
        $this->assertStringContainsString('No picture was attached', $html);
    }

    public function test_admin_or_super_admin_receiving_sends_no_email(): void
    {
        $this->receive($this->admin, null)->assertCreated()->assertJsonPath('emailed', 0);
        $this->receive($this->super, null)->assertCreated()->assertJsonPath('emailed', 0);
        Mail::assertNothingSent();
    }
}

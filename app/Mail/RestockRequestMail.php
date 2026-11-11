<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Staff pressed "Request" in the Reorder List: tell the Admins by email.
 *
 * 2026-11-11: the subject and the coloured banner show how urgent it is
 * (Out of stock / Critical / Low), and the email lists the stock levels,
 * supplier, lead time and who asked, so an Admin can act from the email.
 * The extra fields are optional, so older callers still work.
 */
class RestockRequestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $productName,
        public string $productCode,
        public ?int $stock,
        public string $requestedBy,
        public ?string $note,
        public ?string $status = null,          // out | critical | low | healthy
        public ?int $lowPoint = null,
        public ?int $criticalPoint = null,
        public ?string $category = null,
        public ?string $supplierName = null,
        public ?string $supplierContact = null,
        public ?int $leadTimeDays = null,
        public ?string $requesterEmail = null,
        public ?string $requestedAt = null,
    ) {
    }

    /** Label, colours and subject start for each stock status. */
    private function level(): array
    {
        return match ($this->status) {
            'out' => ['label' => 'Out of stock', 'tag' => 'URGENT', 'color' => '#b42318', 'soft' => '#fef3f2', 'line' => '#fda29b',
                'lead' => 'This product has run out. Customers cannot buy it until new stock arrives.'],
            'critical' => ['label' => 'Critical stock', 'tag' => 'ACTION NEEDED', 'color' => '#c4320a', 'soft' => '#fff6ed', 'line' => '#fdba74',
                'lead' => 'Stock is at or below the safety stock. It may run out before a delivery arrives.'],
            'low' => ['label' => 'Low stock', 'tag' => 'RESTOCK SOON', 'color' => '#a15c07', 'soft' => '#fffaeb', 'line' => '#fcd34d',
                'lead' => 'Stock has reached the reorder point. Now is the time to restock.'],
            default => ['label' => 'Restock request', 'tag' => 'REQUEST', 'color' => '#1d4ed8', 'soft' => '#eff6ff', 'line' => '#93c5fd',
                'lead' => 'A staff member asked for this product to be restocked.'],
        };
    }

    public function envelope(): Envelope
    {
        $level = $this->level();
        $prefix = match ($this->status) {
            'out' => 'URGENT: Out of stock',
            'critical' => 'Action needed: Critical stock',
            'low' => 'Restock soon: Low stock',
            default => 'Restock request',
        };

        return new Envelope(subject: "{$prefix} – {$this->productName} ({$this->productCode})");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.restock-request', with: [
            'productName' => $this->productName,
            'productCode' => $this->productCode,
            'stock' => $this->stock,
            'requestedBy' => $this->requestedBy,
            'note' => $this->note,
            'level' => $this->level(),
            'lowPoint' => $this->lowPoint,
            'criticalPoint' => $this->criticalPoint,
            'category' => $this->category,
            'supplierName' => $this->supplierName,
            'supplierContact' => $this->supplierContact,
            'leadTimeDays' => $this->leadTimeDays,
            'requesterEmail' => $this->requesterEmail,
            'requestedAt' => $this->requestedAt,
            'appUrl' => rtrim((string) config('app.url'), '/'),
        ]);
    }
}

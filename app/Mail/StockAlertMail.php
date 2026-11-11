<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Stock alert (2026-11-11): a product's stock just became Low, Critical or
 * Out of stock. Sent to the Super Admin with a "Restock this product" button.
 */
class StockAlertMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $productName,
        public string $productCode,
        public string $status,           // low | critical | out
        public int $stockBefore,
        public int $stock,
        public int $lowPoint,
        public int $criticalPoint,
        public ?string $category = null,
        public ?string $supplierName = null,
        public ?string $supplierContact = null,
        public ?int $leadTimeDays = null,
        public ?string $recordedBy = null,
        public ?string $change = null,
        public ?string $happenedAt = null,
    ) {
    }

    private function level(): array
    {
        return match ($this->status) {
            'out' => ['label' => 'Out of stock', 'tag' => 'URGENT', 'color' => '#b42318', 'soft' => '#fef3f2', 'line' => '#fda29b',
                'lead' => 'This product has run out. Customers cannot buy it until new stock arrives.'],
            'critical' => ['label' => 'Critical stock', 'tag' => 'ACTION NEEDED', 'color' => '#c4320a', 'soft' => '#fff6ed', 'line' => '#fdba74',
                'lead' => 'Stock is at or below the safety stock. It may run out before a delivery arrives.'],
            default => ['label' => 'Low stock', 'tag' => 'RESTOCK SOON', 'color' => '#a15c07', 'soft' => '#fffaeb', 'line' => '#fcd34d',
                'lead' => 'Stock has reached its low point (reorder point). Now is a good time to restock.'],
        };
    }

    public function envelope(): Envelope
    {
        $prefix = match ($this->status) {
            'out' => 'URGENT: Out of stock',
            'critical' => 'Action needed: Critical stock',
            default => 'Low stock',
        };

        return new Envelope(subject: "{$prefix} – {$this->productName} ({$this->productCode}) · Restock?");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.stock-alert', with: [
            'productName' => $this->productName,
            'productCode' => $this->productCode,
            'level' => $this->level(),
            'stockBefore' => $this->stockBefore,
            'stock' => $this->stock,
            'lowPoint' => $this->lowPoint,
            'criticalPoint' => $this->criticalPoint,
            'category' => $this->category,
            'supplierName' => $this->supplierName,
            'supplierContact' => $this->supplierContact,
            'leadTimeDays' => $this->leadTimeDays,
            'recordedBy' => $this->recordedBy,
            'change' => $this->change,
            'happenedAt' => $this->happenedAt,
            'appUrl' => rtrim((string) config('app.url'), '/'),
        ]);
    }
}

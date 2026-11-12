<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/**
 * 2026-11-12: a Staff member pressed "Received" in the Reorder List. The
 * Admins and Super Admins get an email with the delivery details and the
 * proof photo shown inside the email (or "No picture was attached").
 */
class DeliveryReceivedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $productName,
        public string $productCode,
        public ?string $variantName,
        public int $qty,
        public ?int $stockNow,
        public string $receivedBy,
        public ?string $receiverEmail,
        public string $receivedAt,
        public ?string $deliveryDate,
        public ?string $note,
        public ?string $photoPath,        // on the "local" disk, e.g. delivery-proofs/12/....jpg
    ) {
    }

    public function hasPhoto(): bool
    {
        return $this->photoPath !== null && $this->photoPath !== '';
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Delivery received – {$this->qty} × {$this->productName} ({$this->productCode})");
    }

    public function content(): Content
    {
        $file = $this->hasPhoto() ? Storage::disk('local')->path($this->photoPath) : null;

        return new Content(view: 'emails.delivery-received', with: [
            'productName' => $this->productName,
            'productCode' => $this->productCode,
            'variantName' => $this->variantName,
            'qty' => $this->qty,
            'stockNow' => $this->stockNow,
            'receivedBy' => $this->receivedBy,
            'receiverEmail' => $this->receiverEmail,
            'receivedAt' => $this->receivedAt,
            'deliveryDate' => $this->deliveryDate,
            'note' => $this->note,
            'photoFile' => $file && is_file($file) ? $file : null,
            'appUrl' => rtrim((string) config('app.url'), '/'),
        ]);
    }
}

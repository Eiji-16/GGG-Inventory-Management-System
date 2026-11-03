<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Staff pressed "Request" in the Reorder List: tell the Admins by email. */
class RestockRequestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $productName,
        public string $productCode,
        public ?int $stock,
        public string $requestedBy,
        public ?string $note,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Restock request: {$this->productName}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.restock-request', with: [
            'productName' => $this->productName,
            'productCode' => $this->productCode,
            'stock' => $this->stock,
            'requestedBy' => $this->requestedBy,
            'note' => $this->note,
            'appUrl' => rtrim((string) config('app.url'), '/'),
        ]);
    }
}

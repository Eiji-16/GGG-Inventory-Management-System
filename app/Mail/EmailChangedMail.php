<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "Your email was changed" (2026-11-19): sent to the OLD address right after
 * Profile → Change email, so the real owner knows if it wasn't them.
 */
class EmailChangedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $userName,
        public string $newEmail,
        public string $changedAt,
        public string $device,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your email was changed');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.email-changed', with: [
            'userName' => $this->userName,
            'newEmail' => $this->newEmail,
            'changedAt' => $this->changedAt,
            'device' => $this->device,
            'appUrl' => rtrim((string) config('app.url'), '/'),
        ]);
    }
}

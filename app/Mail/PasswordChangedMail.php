<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * "Your password was changed" (2026-11-16): sent to the account owner right
 * after Profile → Change Password, so the real owner knows if it wasn't them.
 */
class PasswordChangedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $userName,
        public string $changedAt,
        public string $device,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your password was changed');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.password-changed', with: [
            'userName' => $this->userName,
            'changedAt' => $this->changedAt,
            'device' => $this->device,
            'appUrl' => rtrim((string) config('app.url'), '/'),
        ]);
    }
}

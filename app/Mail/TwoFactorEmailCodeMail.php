<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * 2026-11-11: sign-in code sent by email, for a person who can't use their
 * authenticator app ("Send a code to my email" on the two-step window).
 */
class TwoFactorEmailCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $code, public int $expiresInMinutes = 10)
    {
    }

    public function envelope(): Envelope
    {
        // 2026-11-12: the code is in the subject, so it shows in the inbox and
        // phone notification (Gmail may offer its own "Copy code" there).
        return new Envelope(subject: "{$this->code} is your sign-in code");
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.two-factor-email-code',
            with: ['code' => $this->code, 'expiresInMinutes' => $this->expiresInMinutes],
        );
    }
}

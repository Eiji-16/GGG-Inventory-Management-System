<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * 2026-11-19: Profile → Change email. Sent to the NEW address so the owner
 * proves it is typed correctly and that they can open it.
 */
class EmailChangeCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $code, public int $expiresInMinutes = 10)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "{$this->code} is your code to change your email");
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.email-change-code',
            with: ['code' => $this->code, 'expiresInMinutes' => $this->expiresInMinutes],
        );
    }
}

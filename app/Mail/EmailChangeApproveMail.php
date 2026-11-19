<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * 2026-11-19: Profile → Change email, first confirmation. Sent to the
 * CURRENT address so the real owner approves the change before a new email
 * can even be typed.
 */
class EmailChangeApproveMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $userName,
        public string $code,
        public int $expiresInMinutes = 10,
        public string $device = 'a web browser',
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "{$this->code} is your code to approve an email change");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.email-change-approve', with: [
            'userName' => $this->userName,
            'code' => $this->code,
            'expiresInMinutes' => $this->expiresInMinutes,
            'device' => $this->device,
        ]);
    }
}

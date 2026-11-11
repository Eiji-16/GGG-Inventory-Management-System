<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * New account request (2026-11-12): someone clicked "Request Account Access"
 * on the login page. Sent to the Super Admin, and to Admins whose Role Access
 * lets them manage staff. Only the Super Admin can approve or reject it.
 */
class AccountRequestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $requesterName,
        public string $requesterEmail,
        public string $requestedAt,
        public bool $canApprove,          // true for the Super Admin
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: "New account request – {$this->requesterName}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.account-request', with: [
            'requesterName' => $this->requesterName,
            'requesterEmail' => $this->requesterEmail,
            'requestedAt' => $this->requestedAt,
            'canApprove' => $this->canApprove,
            'appUrl' => rtrim((string) config('app.url'), '/'),
        ]);
    }
}

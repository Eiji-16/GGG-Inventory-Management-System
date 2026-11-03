<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** The account request was approved: one-time link to finish the set-up. */
class AccountInviteMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $name, public string $link, public int $hours)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your inventory account request has been approved');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.account-invite', with: [
            'name' => $this->name,
            'link' => $this->link,
            'hours' => $this->hours,
        ]);
    }
}

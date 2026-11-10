<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * php artisan inventory:test-mail you@example.com
 *
 * Sends one short test email with the MAIL_* settings in .env (2026-11-10).
 * Run it once on the live server: if it arrives, the password reset codes,
 * "Verify my email" setup links and restock request emails will arrive too.
 * If it fails, it says what is most likely wrong, in plain words.
 */
class TestMail extends Command
{
    protected $signature = 'inventory:test-mail {email : Where to send the test email}';

    protected $description = 'Send a test email to check the MAIL_* settings (OTP codes, setup links, restock requests)';

    public function handle(): int
    {
        $email = (string) $this->argument('email');
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('That is not a valid email address.');

            return self::FAILURE;
        }

        $mailer = (string) config('mail.default');
        $this->line("Mailer: {$mailer} · host: ".config("mail.mailers.{$mailer}.host", '—').' · port: '.config("mail.mailers.{$mailer}.port", '—').' · from: '.config('mail.from.address'));
        if (in_array($mailer, ['log', 'array'], true)) {
            $this->warn("MAIL_MAILER={$mailer} only writes emails to the log file — nobody receives them. Use MAIL_MAILER=smtp on the live server.");
        }

        try {
            Mail::raw(
                'This is a test email from '.config('app.name').'. If you can read this, password reset codes, account setup links and restock request emails will arrive too.',
                fn ($message) => $message->to($email)->subject(config('app.name').' — test email'),
            );
        } catch (Throwable $exception) {
            $text = $exception->getMessage();
            $this->error('The email could not be sent: '.mb_substr($text, 0, 300));
            $this->line(match (true) {
                str_contains($text, '535') || str_contains($text, 'BadCredentials') || str_contains($text, 'Username and Password not accepted')
                    => 'Gmail refused the login: MAIL_USERNAME must be the Gmail address and MAIL_PASSWORD a 16-letter Gmail App Password (not the normal password).',
                str_contains($text, 'Connection could not be established') || str_contains($text, 'timed out') || str_contains($text, 'Network is unreachable')
                    => 'The server could not reach the mail server. Check MAIL_HOST / MAIL_PORT (587), and ask the host whether outgoing email ports (587/465) are blocked.',
                default => 'Check the MAIL_* settings in .env.',
            });
            $this->line('After changing .env run: php artisan config:clear');

            return self::FAILURE;
        }

        $this->info("Sent to {$email}. Check the inbox (and the spam folder).");

        return self::SUCCESS;
    }
}

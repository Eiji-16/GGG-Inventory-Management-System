<?php

namespace Tests\Feature;

use App\Support\Totp;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** 2026-11-10: checks for running the system on a live server. */
class HostingAuthTest extends TestCase
{
    /** The authenticator codes match the official test codes (RFC 6238). */
    public function test_authenticator_codes_match_the_standard(): void
    {
        $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';   // "12345678901234567890"

        $this->assertSame('287082', Totp::codeAt($secret, intdiv(59, 30)));
        $this->assertSame('081804', Totp::codeAt($secret, intdiv(1111111109, 30)));
        $this->assertSame('005924', Totp::codeAt($secret, intdiv(1234567890, 30)));
        // A phone clock 30 seconds off still works.
        $this->assertNotNull(Totp::verify($secret, Totp::codeAt($secret, intdiv(1234567890, 30) - 1), 1234567890));
    }

    public function test_the_test_mail_command_sends_an_email(): void
    {
        Mail::fake();

        $this->artisan('inventory:test-mail owner@example.com')
            ->expectsOutputToContain('Sent to owner@example.com')
            ->assertSuccessful();
    }

    public function test_the_test_mail_command_refuses_a_bad_address(): void
    {
        $this->artisan('inventory:test-mail not-an-email')->assertFailed();
    }
}

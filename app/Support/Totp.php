<?php

namespace App\Support;

/**
 * Authenticator-app codes (TOTP, RFC 6238) — the 6-digit codes that Google
 * Authenticator / Microsoft Authenticator show and change every 30 seconds.
 *
 * How it works, in plain words: the system and the phone share one secret
 * (the QR code). Every 30 seconds both sides mix the secret with the current
 * time (HMAC-SHA1) and turn the result into 6 numbers. If the numbers match,
 * the person really has the phone. No internet or library is needed.
 */
class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    public const PERIOD = 30;

    /** A new random secret, Base32 (32 characters = 160 bits). */
    public static function newSecret(): string
    {
        $bytes = random_bytes(20);
        $bits = '';
        foreach (str_split($bytes) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }
        $secret = '';
        foreach (str_split($bits, 5) as $chunk) {
            $secret .= self::ALPHABET[bindec(str_pad($chunk, 5, '0'))];
        }

        return $secret;
    }

    /** The otpauth:// link the QR code holds. */
    public static function uri(string $secret, string $account, string $issuer): string
    {
        $label = rawurlencode($issuer).':'.rawurlencode($account);

        return 'otpauth://totp/'.$label.'?secret='.$secret.'&issuer='.rawurlencode($issuer).'&algorithm=SHA1&digits=6&period='.self::PERIOD;
    }

    /** The code for one 30-second step. */
    public static function codeAt(string $secret, int $step): string
    {
        $key = self::base32Decode($secret);
        $counter = pack('N*', 0, $step);              // 8-byte big-endian counter
        $hash = hash_hmac('sha1', $counter, $key, true);
        $offset = ord($hash[19]) & 0x0f;
        $number = ((ord($hash[$offset]) & 0x7f) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);

        return str_pad((string) ($number % 1000000), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Check a typed code. One step before/after is also accepted so a phone
     * clock that is a few seconds off still works. Returns the matching step
     * (so the caller can refuse the same code twice) or null.
     */
    public static function verify(string $secret, string $code, ?int $now = null): ?int
    {
        $code = preg_replace('/\D/', '', $code);
        if (strlen($code) !== 6) {
            return null;
        }
        $current = intdiv($now ?? time(), self::PERIOD);
        foreach ([0, -1, 1] as $drift) {
            if (hash_equals(self::codeAt($secret, $current + $drift), $code)) {
                return $current + $drift;
            }
        }

        return null;
    }

    private static function base32Decode(string $secret): string
    {
        $secret = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $secret));
        $bits = '';
        foreach (str_split($secret) as $char) {
            $bits .= str_pad(decbin(strpos(self::ALPHABET, $char)), 5, '0', STR_PAD_LEFT);
        }
        $bytes = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $bytes .= chr(bindec($chunk));
            }
        }

        return $bytes;
    }
}

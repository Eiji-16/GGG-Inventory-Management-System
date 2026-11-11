@php($system = \App\Models\AppSetting::systemName())
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your sign-in code</title></head>
{{-- 2026-11-11: same layout as the password reset email. --}}
<body style="margin:0;padding:28px 12px;background:#eef1f7;font-family:Arial,Helvetica,sans-serif;color:#13203f">
    <div style="display:none;max-height:0;overflow:hidden">Your {{ $system }} sign-in code. It expires in {{ $expiresInMinutes }} minutes.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;border-collapse:collapse">
        <tr><td style="padding:0 4px 12px;color:#5b6785;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Global Growth Guide · {{ $system }}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #dfe4ee;border-radius:14px;padding:26px 24px">
            <h1 style="margin:0 0 10px;font-size:21px">Your sign-in code</h1>
            <p style="margin:0 0 4px;line-height:1.6;font-size:14px">Someone signed in to your inventory account with the correct password and asked for a code by email instead of the authenticator app. Type this code on the sign-in screen:</p>
            <p style="margin:22px 0;padding:18px;text-align:center;background:#f4f6fb;border:1px solid #dfe4ee;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:10px;color:#13203f">{{ $code }}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;color:#5b6785">
                <tr><td style="padding:4px 0">• The code expires in <strong style="color:#13203f">{{ $expiresInMinutes }} minutes</strong> and works only once.</td></tr>
                <tr><td style="padding:4px 0">• Never share this code. Our team will never ask you for it.</td></tr>
                <tr><td style="padding:4px 0">• <strong style="color:#13203f">Wasn't you?</strong> Someone knows your password. Change it right away and tell the Super Admin.</td></tr>
            </table>
        </td></tr>
        <tr><td style="padding:14px 6px 0;color:#8a94ab;font-size:11.5px;line-height:1.6;text-align:center">This message was sent by {{ $system }}, the inventory system of Global Growth Guide. Please do not reply to this email.</td></tr>
    </table>
</body>
</html>

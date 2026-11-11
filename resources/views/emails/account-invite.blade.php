@php($system = \App\Models\AppSetting::systemName())
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify your email</title></head>
{{-- 2026-11-11: same professional layout as the other emails. --}}
<body style="margin:0;padding:28px 12px;background:#eef1f7;font-family:Arial,Helvetica,sans-serif;color:#13203f">
    <div style="display:none;max-height:0;overflow:hidden">Your {{ $system }} account is ready. Verify your email within {{ $hours }} hours to finish the setup.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;border-collapse:collapse">
        <tr><td style="padding:0 4px 12px;color:#5b6785;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Global Growth Guide · {{ $system }}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #dfe4ee;border-radius:14px;padding:26px 24px">
            <h1 style="margin:0 0 10px;font-size:21px">Hi {{ $name }}, your account is ready</h1>
            <p style="margin:0 0 16px;line-height:1.6;font-size:14px">Your request for an inventory account was approved. Verify your email to finish the setup — it takes about 2 minutes:</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:0 0 20px">
                <tr><td style="padding:4px 10px 4px 0;vertical-align:top;color:#a07d12;font-weight:700">1</td><td style="padding:4px 0;line-height:1.5">Click <strong>Verify my email</strong> below.</td></tr>
                <tr><td style="padding:4px 10px 4px 0;vertical-align:top;color:#a07d12;font-weight:700">2</td><td style="padding:4px 0;line-height:1.5">Choose your password.</td></tr>
                <tr><td style="padding:4px 10px 4px 0;vertical-align:top;color:#a07d12;font-weight:700">3</td><td style="padding:4px 0;line-height:1.5">Scan the QR code with Google or Microsoft Authenticator on your phone.</td></tr>
            </table>
            <p style="margin:0 0 22px"><a href="{{ $link }}" style="display:inline-block;padding:13px 24px;background:#e8c547;color:#0a1530;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px">Verify my email</a></p>
            <p style="margin:0 0 10px;padding:10px 12px;background:#fffaeb;border:1px solid #fcd34d;border-radius:10px;line-height:1.55;font-size:13px;color:#7a4e05"><strong>This link expires in {{ $hours }} hours</strong> and works only once, in the first browser that opens it. Do not forward it.</p>
            <p style="margin:0;line-height:1.6;color:#5b6785;font-size:12px;word-break:break-all">If the button does not work, copy this address into your browser:<br><a href="{{ $link }}" style="color:#1d4ed8">{{ $link }}</a></p>
            <p style="margin:16px 0 0;line-height:1.6;color:#5b6785;font-size:12px">Didn't ask for an account? You can ignore this email. The account can't be used until this link is opened.</p>
        </td></tr>
        <tr><td style="padding:14px 6px 0;color:#8a94ab;font-size:11.5px;line-height:1.6;text-align:center">This message was sent by {{ $system }}, the inventory system of Global Growth Guide. Please do not reply to this email.</td></tr>
    </table>
</body>
</html>

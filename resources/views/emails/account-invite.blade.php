<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:32px 16px;background:#eef1f7;font-family:Arial,sans-serif;color:#13203f">
    <main style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border-top:4px solid #e8c547">
        <div style="padding:28px">
            <p style="margin:0;color:#5b6785;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Global Growth Guide · Inventory System</p>
            <h1 style="margin:8px 0 12px;font-size:22px">Hi {{ $name }}, you're approved</h1>
            <p style="line-height:1.6;margin:0 0 18px">Your inventory account request has been approved. Please click the button below to validate your identity and complete your setup: you will choose a password and connect an authenticator app (Google or Microsoft Authenticator).</p>
            <p style="margin:0 0 22px"><a href="{{ $link }}" style="display:inline-block;padding:13px 22px;background:#e8c547;color:#0a1530;text-decoration:none;font-weight:700;border-radius:10px">Complete my account setup</a></p>
            <p style="line-height:1.6;margin:0 0 8px;color:#5b6785;font-size:13px"><strong style="color:#13203f">This link expires in {{ $hours }} hours</strong> and works only once, in the first browser that opens it. Do not forward it.</p>
            <p style="line-height:1.6;margin:0;color:#5b6785;font-size:12px;word-break:break-all">If the button does not work, copy this address into your browser:<br>{{ $link }}</p>
            <p style="line-height:1.6;margin:18px 0 0;color:#5b6785;font-size:12px">Didn't ask for an account? You can ignore this email.</p>
        </div>
    </main>
</body>
</html>

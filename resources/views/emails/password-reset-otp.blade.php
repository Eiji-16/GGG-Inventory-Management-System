<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:32px;background:#f4f6fb;font-family:Arial,sans-serif;color:#1a2a4a">
    <main style="max-width:520px;margin:0 auto;padding:32px;background:#fff;border-radius:16px">
        <h1 style="margin:0 0 12px;font-size:24px">Reset your password</h1>
        <p style="line-height:1.6">Use this one-time code to reset your inventory system password:</p>
        <p style="margin:28px 0;padding:18px;text-align:center;background:#f4f6fb;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:10px">
            {{ $otp }}
        </p>
        <p style="line-height:1.6">This code expires in {{ $expiresInMinutes }} minutes. If you did not request a password reset, you can ignore this email.</p>
    </main>
</body>
</html>

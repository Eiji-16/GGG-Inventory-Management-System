@php
    $system = \App\Models\AppSetting::systemName();
@endphp
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>New account request: {{ $requesterName }}</title></head>
{{-- 2026-11-12: new "Request Account Access". Same layout as the stock alert email (no coloured top stripe). --}}
<body style="margin:0;padding:28px 12px;background:#eef1f7;font-family:Arial,Helvetica,sans-serif;color:#13203f">
    <div style="display:none;max-height:0;overflow:hidden">{{ $requesterName }} ({{ $requesterEmail }}) asked for an account.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;border-collapse:collapse">
        <tr><td style="padding:0 4px 12px;color:#5b6785;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Global Growth Guide · {{ $system }}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #dfe4ee;border-radius:14px;overflow:hidden">
            <div style="padding:22px 24px 6px">
                <span style="display:inline-block;padding:4px 10px;background:#16295c;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.08em;border-radius:999px">ACCOUNT REQUEST</span>
                <h1 style="margin:14px 0 8px;font-size:21px;line-height:1.3">{{ $requesterName }} asked for an account</h1>
                <p style="margin:0 0 18px;line-height:1.6;font-size:14px;color:#5b6785">Sent from “Request Account Access” on the sign-in page.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
                    <tr>
                        <td style="padding:10px 0;color:#5b6785">Name</td>
                        <td style="padding:10px 0;text-align:right"><strong>{{ $requesterName }}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Email</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6">{{ $requesterEmail }}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Asked on</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6">{{ $requestedAt }}</td>
                    </tr>
                </table>
            </div>

            <div style="margin:16px 24px 0;padding:16px;background:#f6f8fc;border:1px solid #dfe4ee;border-radius:12px">
                @if ($canApprove)
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700">Do you know this person?</p>
                    <p style="margin:0 0 14px;line-height:1.6;font-size:13px;color:#5b6785">Open <em>Staffs → Account requests</em>, choose the role, then click <em>Approve &amp; Invite</em> or <em>Reject</em>.</p>
                    <a href="{{ $appUrl }}" style="display:inline-block;padding:12px 22px;background:#16295c;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px">Review the request</a>
                @else
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700">For your information</p>
                    <p style="margin:0;line-height:1.6;font-size:13px;color:#5b6785">The Super Admin (or an Admin allowed in Role Access) approves or rejects account requests. If you know this person, you can tell the Super Admin.</p>
                @endif
            </div>
            <div style="height:24px"></div>
        </td></tr>
        <tr><td style="padding:14px 6px 0;color:#8a94ab;font-size:11.5px;line-height:1.6;text-align:center">
            This message was sent by {{ $system }}, the inventory system of Global Growth Guide, to the people who manage accounts. Please do not reply to this email.
        </td></tr>
    </table>
</body>
</html>

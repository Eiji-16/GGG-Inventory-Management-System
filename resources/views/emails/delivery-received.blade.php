@php
    $system = \App\Models\AppSetting::systemName();
@endphp
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Delivery received: {{ $productName }}</title></head>
{{-- 2026-11-12: Staff recorded a delivery (Received). Same layout as the other emails (no coloured top stripe). --}}
<body style="margin:0;padding:28px 12px;background:#eef1f7;font-family:Arial,Helvetica,sans-serif;color:#13203f">
    <div style="display:none;max-height:0;overflow:hidden">{{ $receivedBy }} received {{ $qty }} × {{ $productName }}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;border-collapse:collapse">
        <tr><td style="padding:0 4px 12px;color:#5b6785;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Global Growth Guide · {{ $system }}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #dfe4ee;border-radius:14px;overflow:hidden">
            <div style="padding:22px 24px 6px">
                <span style="display:inline-block;padding:4px 10px;background:#16295c;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.08em;border-radius:999px">DELIVERY RECEIVED</span>
                <h1 style="margin:14px 0 8px;font-size:21px;line-height:1.3">{{ $qty }} × {{ $productName }} arrived</h1>
                <p style="margin:0 0 18px;line-height:1.6;font-size:14px;color:#5b6785">{{ $receivedBy }} recorded this delivery in the Reorder List. It was added to Stock Control as a Stock In.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
                    <tr>
                        <td style="padding:10px 0;color:#5b6785">Product</td>
                        <td style="padding:10px 0;text-align:right"><strong>{{ $productName }}</strong> ({{ $productCode }}){{ $variantName ? ' · '.$variantName : '' }}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Quantity received</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6"><strong>{{ number_format($qty) }} units</strong></td>
                    </tr>
                    @if ($stockNow !== null)
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Stock now</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6">{{ number_format($stockNow) }} units</td>
                    </tr>
                    @endif
                    @if ($deliveryDate)
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Delivery date</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6">{{ $deliveryDate }}</td>
                    </tr>
                    @endif
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Received by</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6">{{ $receivedBy }}{{ $receiverEmail ? ' · '.$receiverEmail : '' }}</td>
                    </tr>
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Recorded on</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6">{{ $receivedAt }}</td>
                    </tr>
                    @if ($note)
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;border-top:1px solid #edf0f6">Note</td>
                        <td style="padding:10px 0;text-align:right;border-top:1px solid #edf0f6">{{ $note }}</td>
                    </tr>
                    @endif
                </table>
            </div>

            <div style="margin:16px 24px 0;padding:16px;background:#f6f8fc;border:1px solid #dfe4ee;border-radius:12px">
                <p style="margin:0 0 10px;font-size:15px;font-weight:700">Proof photo</p>
                @if ($photoFile && isset($message))
                    <img src="{{ $message->embed($photoFile) }}" alt="Proof photo of the delivery" style="display:block;max-width:100%;height:auto;border-radius:10px;border:1px solid #dfe4ee">
                @else
                    <p style="margin:0;line-height:1.6;font-size:13px;color:#5b6785">No picture was attached to this delivery.</p>
                @endif
            </div>

            <div style="padding:16px 24px 24px">
                <a href="{{ $appUrl }}" style="display:inline-block;padding:12px 22px;background:#16295c;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px">Open the inventory system</a>
            </div>
        </td></tr>
        <tr><td style="padding:14px 6px 0;color:#8a94ab;font-size:11.5px;line-height:1.6;text-align:center">
            This message was sent by {{ $system }}, the inventory system of Global Growth Guide, to its Admins and Super Admins. Please do not reply to this email.
        </td></tr>
    </table>
</body>
</html>

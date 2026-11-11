@php
    $system = \App\Models\AppSetting::systemName();
    $rows = array_values(array_filter([
        ['Product', '<strong>'.e($productName).'</strong> <span style="color:#5b6785">('.e($productCode).')</span>'],
        $category ? ['Category', e($category)] : null,
        ['Stock on hand', '<span style="color:#5b6785">'.e($stockBefore).' →</span> <strong style="color:'.$level['color'].'">'.e($stock).'</strong>'],
        ['Low level (reorder point)', e($lowPoint)],
        ['Critical level (safety stock)', e($criticalPoint)],
        $supplierName ? ['Supplier', e($supplierName).($supplierContact ? '<br><span style="color:#5b6785">'.e($supplierContact).'</span>' : '')] : null,
        $leadTimeDays !== null ? ['Delivery lead time', e($leadTimeDays).' '.($leadTimeDays === 1 ? 'day' : 'days')] : null,
    ]));
@endphp
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{ $level['label'] }}: {{ $productName }}</title></head>
{{-- 2026-11-11: stock alert for the Super Admin. Same layout as the restock request email. --}}
<body style="margin:0;padding:28px 12px;background:#eef1f7;font-family:Arial,Helvetica,sans-serif;color:#13203f">
    <div style="display:none;max-height:0;overflow:hidden">{{ $level['label'] }}: {{ $productName }} has {{ $stock }} left. Do you want to restock it?</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;border-collapse:collapse">
        <tr><td style="padding:0 4px 12px;color:#5b6785;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Global Growth Guide · {{ $system }}</td></tr>
        <tr><td style="background:#ffffff;border:1px solid #dfe4ee;border-radius:14px;overflow:hidden">

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
                <tr><td style="padding:16px 24px;background:{{ $level['soft'] }};border-bottom:1px solid {{ $level['line'] }}">
                    <span style="display:inline-block;padding:4px 10px;background:{{ $level['color'] }};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.08em;border-radius:999px">{{ $level['tag'] }}</span>
                    <span style="margin-left:8px;color:{{ $level['color'] }};font-size:14px;font-weight:700">{{ $level['label'] }}</span>
                </td></tr>
            </table>

            <div style="padding:22px 24px 6px">
                <h1 style="margin:0 0 8px;font-size:21px;line-height:1.3">{{ $productName }} is now {{ strtolower($level['label']) }}</h1>
                <p style="margin:0 0 6px;line-height:1.6;font-size:14px">{{ $level['lead'] }}</p>
                <p style="margin:0 0 18px;line-height:1.6;font-size:14px;color:#5b6785">
                    {{ $change ?: 'A stock change' }}{{ $recordedBy ? ' recorded by '.$recordedBy : '' }}{{ $happenedAt ? ' on '.$happenedAt : '' }}.
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
                    @foreach ($rows as $i => $row)
                    <tr>
                        <td style="padding:10px 0;color:#5b6785;vertical-align:top;{{ $i ? 'border-top:1px solid #edf0f6;' : '' }}">{{ $row[0] }}</td>
                        <td style="padding:10px 0;text-align:right;vertical-align:top;{{ $i ? 'border-top:1px solid #edf0f6;' : '' }}">{!! $row[1] !!}</td>
                    </tr>
                    @endforeach
                </table>
            </div>

            <div style="margin:16px 24px 0;padding:16px;background:#f6f8fc;border:1px solid #dfe4ee;border-radius:12px">
                <p style="margin:0 0 4px;font-size:15px;font-weight:700">Do you want to restock this product?</p>
                <p style="margin:0 0 14px;line-height:1.6;font-size:13px;color:#5b6785">Open the Reorder List and click <em>Calculate Now</em> to see how many to buy. When the delivery arrives, record it with <em>Received</em>.</p>
                <a href="{{ $appUrl }}" style="display:inline-block;padding:12px 22px;background:{{ $level['color'] }};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px">Yes, restock this product</a>
                <p style="margin:12px 0 0;line-height:1.6;font-size:12px;color:#5b6785">Not now? You can ignore this email. The product stays on the Reorder List until it is restocked.</p>
            </div>
            <div style="height:24px"></div>
        </td></tr>
        <tr><td style="padding:14px 6px 0;color:#8a94ab;font-size:11.5px;line-height:1.6;text-align:center">
            This message was sent by {{ $system }}, the inventory system of Global Growth Guide, to the Super Admin. You get one email each time a product becomes Low, Critical or Out of stock. Please do not reply to this email.
        </td></tr>
    </table>
</body>
</html>

<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:32px 16px;background:#eef1f7;font-family:Arial,sans-serif;color:#13203f">
    <main style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border-top:4px solid #e8c547">
        <div style="padding:28px 28px 8px">
            <p style="margin:0;color:#5b6785;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">{{ \App\Models\AppSetting::systemName() }} · Reorder List</p>
            <h1 style="margin:8px 0 12px;font-size:22px">Restock request</h1>
            <p style="line-height:1.6;margin:0 0 16px"><strong>{{ $requestedBy }}</strong> asked to restock this product:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;color:#5b6785">Product</td><td style="padding:8px 0;text-align:right"><strong>{{ $productName }}</strong> ({{ $productCode }})</td></tr>
                <tr><td style="padding:8px 0;color:#5b6785;border-top:1px solid #dfe4ee">Stock on hand</td><td style="padding:8px 0;text-align:right;border-top:1px solid #dfe4ee">{{ $stock ?? '—' }}</td></tr>
                @if ($note)
                <tr><td style="padding:8px 0;color:#5b6785;border-top:1px solid #dfe4ee">Note</td><td style="padding:8px 0;text-align:right;border-top:1px solid #dfe4ee">“{{ $note }}”</td></tr>
                @endif
            </table>
        </div>
        <div style="padding:16px 28px 28px">
            <p style="line-height:1.6;color:#5b6785;font-size:13px;margin:0 0 16px">Open the Reorder List to order it or mark the request as done. The request also shows in the notification bell.</p>
            <a href="{{ $appUrl }}" style="display:inline-block;padding:12px 20px;background:#e8c547;color:#0a1530;text-decoration:none;font-weight:700;border-radius:10px">Open the inventory system</a>
        </div>
    </main>
</body>
</html>

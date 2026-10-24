<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * PUT /api/settings/currency — the system-wide display currency.
 *
 * One business, one currency: the choice applies to every account. Only
 * Super Admin and Admin may change it. Amounts are not converted.
 */
class CurrencyPreferenceController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdminOrAbove(), 403, 'Only an Admin or Super Admin can change the system currency.');

        $data = $request->validate([
            'currency' => ['required', 'string', Rule::in(AppSetting::CURRENCIES)],
        ]);

        $previous = AppSetting::currency();
        AppSetting::put('currency', $data['currency']);
        if ($previous !== $data['currency']) {
            ActivityLog::record('settings.currency', "Changed system currency from {$previous} to {$data['currency']}", 'settings', [
                'from' => $previous,
                'to' => $data['currency'],
            ]);
        }

        return response()->json(['currency' => $data['currency']]);
    }
}

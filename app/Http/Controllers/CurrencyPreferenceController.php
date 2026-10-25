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
 * One business, one currency: the choice applies to every account. Who may
 * change it is set in Role Access ("Change currency"; checked on the route).
 * Amounts are not converted.
 */
class CurrencyPreferenceController extends Controller
{
    public function update(Request $request): JsonResponse
    {
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

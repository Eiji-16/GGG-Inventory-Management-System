<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CurrencyPreferenceController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'currency' => ['required', 'string', Rule::in(['USD', 'PHP', 'EUR', 'GBP', 'JPY'])],
        ]);

        $request->user()->update(['currency' => $data['currency']]);

        return response()->json(['currency' => $data['currency']]);
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * CalculationController — /calculations
 *
 * Records an Auto Calculator EOQ computation
 * to the activity log, tagged with the signed-in user ("computed by"). Runs on
 * a session-authed web route so Auth::id() is available. The actual math is done
 * in the browser (instant); this just persists the outcome for the EOQ Report.
 */
class CalculationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'formula' => ['required', Rule::in(['EOQ'])],
            'result'  => ['required', 'numeric'],
            'unit'    => ['nullable', 'string', 'max:50'],
            'product' => ['nullable', 'string', 'max:255'],
            'inputs'  => ['nullable', 'array'],
        ]);

        $unit = $data['unit'] ?? 'units';
        $product = $data['product'] ?? null;
        $detail = "Computed {$data['formula']} — ".round((float) $data['result'], 2)." {$unit}"
            .($product ? " for {$product}" : '');

        ActivityLog::record('formula.compute', $detail, 'calculator', [
            'formula' => $data['formula'],
            'product' => $product,
            'inputs'  => $data['inputs'] ?? null,
            'result'  => (float) $data['result'],
            'unit'    => $unit,
            'by'      => $request->user()?->name,
        ]);

        return response()->json(['saved' => true], 201);
    }
}

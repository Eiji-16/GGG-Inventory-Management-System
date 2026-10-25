<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Services\SalesForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CalculationController — /calculations
 *
 * Revalidates and records an Auto Calculator EOQ computation to the activity
 * log, tagged with the signed-in user ("computed by").
 */
class CalculationController extends Controller
{
    public function __construct(private readonly SalesForecastService $forecasts) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'formula' => ['required', Rule::in(['EOQ'])],
            'unit'    => ['nullable', 'string', 'max:50'],
            'productId' => ['nullable', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'demandSource' => ['sometimes', Rule::in(['historical', 'forecast'])],
            'inputs' => ['required', 'array'],
            'inputs.annualDemand' => ['required', 'numeric', 'gt:0'],
            'inputs.orderingCost' => ['required', 'numeric', 'gt:0'],
            'inputs.holdingCost' => ['required', 'numeric', 'gt:0'],
            'forecast' => ['required_if:demandSource,forecast', 'nullable', 'array'],
            'forecast.productId' => ['required_if:demandSource,forecast', 'string', 'same:productId'],
            'forecast.periodType' => ['required_if:demandSource,forecast', Rule::in(['week', 'month', 'year'])],
            'forecast.forecastPeriod' => ['required_if:demandSource,forecast', 'date_format:Y-m-d'],
            'forecast.baseForecast' => ['required_if:demandSource,forecast', 'numeric', 'min:0'],
            'forecast.adjustedForecast' => ['required_if:demandSource,forecast', 'numeric', 'min:0'],
            'forecast.seasonalEnabled' => ['required_if:demandSource,forecast', 'boolean'],
            'forecast.seasonalEvent' => ['nullable', 'string', 'max:2500'],
            'forecast.adjustmentPct' => ['required_if:demandSource,forecast', 'numeric', 'between:-100,1000'],
        ]);

        $inputs = $data['inputs'];
        foreach (['annualDemand', 'orderingCost', 'holdingCost'] as $field) {
            if (! is_finite((float) $inputs[$field])) {
                throw ValidationException::withMessages(["inputs.{$field}" => 'Enter a finite numeric value.']);
            }
        }

        $product = isset($data['productId'])
            ? Product::where('code', $data['productId'])->firstOrFail()
            : null;
        $demandSource = $data['demandSource'] ?? 'historical';
        $forecastDetails = null;
        $annualDemand = (float) $inputs['annualDemand'];

        if ($demandSource === 'forecast') {
            if (! $product) {
                throw ValidationException::withMessages([
                    'productId' => 'A valid product is required for a forecast-based economic order quantity.',
                ]);
            }

            $submittedForecast = $data['forecast'];
            if (! hash_equals($product->code, $submittedForecast['productId'])) {
                throw ValidationException::withMessages([
                    'forecast.productId' => 'The forecast does not belong to the selected product.',
                ]);
            }

            $currentForecast = $this->forecasts->forecast($product, $submittedForecast['periodType']);
            $baseForecast = (float) $submittedForecast['baseForecast'];
            if (
                $currentForecast['forecastPeriod'] !== $submittedForecast['forecastPeriod']
                || abs((float) $currentForecast['baseForecast'] - $baseForecast) > 0.00001
            ) {
                throw ValidationException::withMessages([
                    'forecast' => 'This forecast is out of date. Recompute it before calculating the economic order quantity.',
                ]);
            }

            $seasonalEnabled = (bool) $submittedForecast['seasonalEnabled'];
            $adjustmentPct = (float) $submittedForecast['adjustmentPct'];
            $seasonalEvent = $seasonalEnabled
                ? implode(', ', array_column($currentForecast['seasonalEvents'], 'name'))
                : null;
            if (
                $seasonalEnabled !== $currentForecast['seasonalEnabled']
                || abs($adjustmentPct - $currentForecast['adjustmentPct']) > 0.00001
                || abs((float) $submittedForecast['adjustedForecast'] - $currentForecast['adjustedForecast']) > 0.00001
                || ($submittedForecast['seasonalEvent'] ?? null) !== $seasonalEvent
            ) {
                throw ValidationException::withMessages([
                    'forecast' => 'Seasonal settings changed. Recompute the forecast before calculating the economic order quantity.',
                ]);
            }
            if ($seasonalEnabled && empty($submittedForecast['seasonalEvent'])) {
                throw ValidationException::withMessages([
                    'forecast.seasonalEvent' => 'Select a seasonal event for an enabled adjustment.',
                ]);
            }
            if (! $seasonalEnabled && $adjustmentPct !== 0.0) {
                throw ValidationException::withMessages([
                    'forecast.adjustmentPct' => 'Disabled seasonal adjustments must use zero percent.',
                ]);
            }

            $effectivePct = $seasonalEnabled ? $adjustmentPct : 0.0;
            $adjustedForecast = max(0, round($baseForecast * (1 + $effectivePct / 100), 1));
            if (abs((float) $submittedForecast['adjustedForecast'] - $adjustedForecast) > 0.00001) {
                throw ValidationException::withMessages([
                    'forecast.adjustedForecast' => 'The adjusted forecast does not match the selected adjustment.',
                ]);
            }

            $annualPeriods = match ($submittedForecast['periodType']) {
                'week' => 52,
                'year' => 1,
                default => 12,
            };
            $expectedAnnualDemand = (int) round($adjustedForecast * $annualPeriods);
            if (abs($annualDemand - $expectedAnnualDemand) > 0.00001) {
                throw ValidationException::withMessages([
                    'inputs.annualDemand' => 'Annual demand does not match the verified forecast and period.',
                ]);
            }
            $annualDemand = $expectedAnnualDemand;
            $forecastDetails = [
                'periodType' => $submittedForecast['periodType'],
                'forecastPeriod' => $currentForecast['forecastPeriod'],
                'baseForecast' => (float) $currentForecast['baseForecast'],
                'seasonalEnabled' => $seasonalEnabled,
                'seasonalEvent' => $seasonalEvent,
                'adjustmentPct' => $effectivePct,
                'adjustedForecast' => $adjustedForecast,
                'annualPeriods' => $annualPeriods,
            ];
        }

        $orderingCost = (float) $inputs['orderingCost'];
        $holdingCost = (float) $inputs['holdingCost'];
        $economicOrderQuantity = sqrt((2 * $annualDemand * $orderingCost) / $holdingCost);
        if (! is_finite($economicOrderQuantity) || $economicOrderQuantity <= 0) {
            throw ValidationException::withMessages([
                'inputs' => 'The values entered did not produce a valid economic order quantity.',
            ]);
        }
        $recommendedOrderQuantity = (int) round($economicOrderQuantity);
        $annualOrders = $annualDemand / $economicOrderQuantity;
        $user = $request->user();
        $productName = $product?->name;
        $unit = $data['unit'] ?? 'units';

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'formula.compute',
            'description' => "Computed order quantity — {$recommendedOrderQuantity} {$unit}"
                .($productName ? " for {$productName}" : ''),
            'icon' => 'calculator',
            'meta' => [
                'formula' => $data['formula'],
                'product' => $productName,
                'productId' => $product?->code,
                'demandSource' => $demandSource,
                'inputs' => [
                    'annualDemand' => $annualDemand,
                    'orderingCost' => $orderingCost,
                    'holdingCost' => $holdingCost,
                    'annualOrders' => $annualOrders,
                ],
                'forecast' => $forecastDetails,
                'result' => $economicOrderQuantity,
                'recommendedOrderQuantity' => $recommendedOrderQuantity,
                'unit' => $unit,
                'by' => $user->name,
            ],
        ]);

        return response()->json([
            'saved' => true,
            'result' => $economicOrderQuantity,
            'recommendedOrderQuantity' => $recommendedOrderQuantity,
        ], 201);
    }
}

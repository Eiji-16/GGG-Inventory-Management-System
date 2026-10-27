<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Services\SalesForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ForecastController extends Controller
{
    public function __construct(private readonly SalesForecastService $forecaster)
    {
    }

    /**
     * GET /api/forecasts/history?product={code}&periodType=month
     *
     * Stock-out sales per completed period with WMA weights, past WMA
     * forecasts and variances — shown before a forecast is computed.
     */
    public function history(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product' => ['required', 'string'],
            'periodType' => ['sometimes', 'in:week,month,year'],
        ]);

        $product = Product::where('code', $data['product'])->firstOrFail();

        return response()->json($this->forecaster->history($product, $data['periodType'] ?? 'month'));
    }

    /** POST /api/forecasts */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId' => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'periodType' => ['sometimes', 'in:week,month,year'],
        ]);

        $product = Product::where('code', $data['productId'])->firstOrFail();

        return response()->json($this->forecaster->forecast(
            $product,
            $data['periodType'] ?? 'month'
        ));
    }
}

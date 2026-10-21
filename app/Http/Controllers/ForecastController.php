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

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
            'productId' => ['required', 'string', 'exists:products,code'],
            'formula' => ['required', 'string', Rule::in(SalesForecastService::FORMULAS)],
        ]);

        $product = Product::where('code', $data['productId'])->firstOrFail();

        return response()->json($this->forecaster->forecast($product, $data['formula']));
    }
}

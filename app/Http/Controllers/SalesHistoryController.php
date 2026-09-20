<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SalesHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * SalesHistoryController — /api/sales-history
 *
 * Feeds the Forecasting tab: monthly units-sold per product. Records are stored
 * one row per product per month (period_date = first of the month). Adding a
 * point for a month that already exists overwrites it rather than duplicating.
 */
class SalesHistoryController extends Controller
{
    /**
     * GET /api/sales-history?product={code}
     *
     * Returns the monthly series (oldest first) for one product when ?product=
     * is given, otherwise every row.
     */
    public function index(Request $request)
    {
        $query = SalesHistory::query()->orderBy('period_date');

        if ($code = $request->query('product')) {
            $product = Product::where('code', $code)->firstOrFail();
            $query->where('product_id', $product->id);
        }

        return response()->json($query->get()->map(fn ($r) => $this->format($r)));
    }

    /** POST /api/sales-history */
    public function store(Request $request)
    {
        $data = $request->validate([
            'productId'  => ['required', 'string'],          // product code
            'periodDate' => ['required', 'date'],            // any day in the month
            'unitsSold'  => ['required', 'integer', 'min:0'],
        ]);

        $product = Product::where('code', $data['productId'])->firstOrFail();

        // Normalise to the first of the month so one month = one row.
        $period = Carbon::parse($data['periodDate'])->startOfMonth()->toDateString();

        $row = SalesHistory::updateOrCreate(
            ['product_id' => $product->id, 'period_date' => $period],
            ['units_sold' => $data['unitsSold']]
        );

        return response()->json($this->format($row), 201);
    }

    /** DELETE /api/sales-history/{salesHistory} */
    public function destroy(SalesHistory $salesHistory)
    {
        $salesHistory->delete();

        return response()->json(['deleted' => true]);
    }

    /** Shape a SalesHistory row for the Forecasting chart. */
    private function format(SalesHistory $r): array
    {
        return [
            'id'         => $r->id,
            'productId'  => $r->product?->code,
            'periodDate' => $r->period_date?->toDateString(),
            'unitsSold'  => $r->units_sold,
        ];
    }
}

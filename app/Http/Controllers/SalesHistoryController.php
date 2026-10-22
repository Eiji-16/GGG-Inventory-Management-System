<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\SalesHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * SalesHistoryController — /api/sales-history
 *
 * Feeds the Forecasting tab with weekly, monthly, and yearly sales periods.
 */
class SalesHistoryController extends Controller
{
    /**
     * GET /api/sales-history?product={code}
     *
     * Returns a product's selected-period series (oldest first).
     */
    public function index(Request $request)
    {
        $filters = $request->validate([
            'periodType' => ['sometimes', 'in:week,month,year'],
        ]);
        $periodType = $filters['periodType'] ?? 'month';
        $query = SalesHistory::query()
            ->where('period_type', $periodType)
            ->orderBy('period_date');

        if ($code = $request->query('product')) {
            $product = Product::withTrashed()->where('code', $code)->firstOrFail();
            $query->where('product_id', $product->id);
        }

        return response()->json($query->get()->map(fn ($r) => $this->format($r)));
    }

    /** POST /api/sales-history */
    public function store(Request $request)
    {
        $data = $request->validate([
            'productId'  => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'periodDate' => ['required', 'date'],
            'periodType' => ['sometimes', 'in:week,month,year'],
            'unitsSold'  => ['required', 'integer', 'min:0'],
        ]);

        $product = Product::where('code', $data['productId'])->firstOrFail();
        $periodType = $data['periodType'] ?? 'month';
        $period = $this->normalizePeriod($data['periodDate'], $periodType);

        $timestamp = now();
        DB::table('sales_history')->upsert(
            [[
                'product_id' => $product->id,
                'period_date' => $period,
                'period_type' => $periodType,
                'units_sold' => $data['unitsSold'],
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]],
            ['product_id', 'period_type', 'period_date'],
            ['units_sold', 'updated_at']
        );
        $row = SalesHistory::where('product_id', $product->id)
            ->where('period_type', $periodType)
            ->whereDate('period_date', $period)
            ->firstOrFail();

        return response()->json($this->format($row), 201);
    }

    public function bulkStore(Request $request)
    {
        $data = $request->validate([
            'productId' => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'periodType' => ['required', 'in:week,month,year'],
            'records' => ['present', 'array', 'max:53'],
            'records.*.periodDate' => ['required', 'date', 'distinct'],
            'records.*.unitsSold' => ['required', 'integer', 'min:0'],
            'deleteDates' => ['sometimes', 'array', 'max:53'],
            'deleteDates.*' => ['required', 'date', 'distinct'],
        ]);

        $product = Product::where('code', $data['productId'])->firstOrFail();
        $periodType = $data['periodType'];
        $timestamp = now();
        $records = collect($data['records'])->map(function (array $record) use ($product, $periodType, $timestamp): array {
            return [
                'product_id' => $product->id,
                'period_date' => $this->normalizePeriod($record['periodDate'], $periodType),
                'period_type' => $periodType,
                'units_sold' => $record['unitsSold'],
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ];
        });
        if ($records->pluck('period_date')->unique()->count() !== $records->count()) {
            throw ValidationException::withMessages([
                'records' => 'Each sales period can only be submitted once.',
            ]);
        }
        $deleteDates = collect($data['deleteDates'] ?? [])
            ->map(fn (string $date): string => $this->normalizePeriod($date, $periodType))
            ->all();
        if (array_intersect($records->pluck('period_date')->all(), $deleteDates) !== []) {
            throw ValidationException::withMessages([
                'deleteDates' => 'A period cannot be saved and deleted in the same request.',
            ]);
        }

        DB::transaction(function () use ($records, $deleteDates, $product, $periodType): void {
            if ($records->isNotEmpty()) {
                DB::table('sales_history')->upsert(
                    $records->all(),
                    ['product_id', 'period_type', 'period_date'],
                    ['units_sold', 'updated_at']
                );
            }
            if ($deleteDates !== []) {
                $deleteQuery = SalesHistory::query()
                    ->where('product_id', $product->id)
                    ->where('period_type', $periodType)
                    ->where(function ($query) use ($deleteDates): void {
                        foreach ($deleteDates as $date) {
                            $query->orWhereDate('period_date', $date);
                        }
                    });
                $deleteQuery->delete();
            }
        });

        $dates = $records->pluck('period_date')->merge($deleteDates)->unique()->all();
        $saved = SalesHistory::query()
            ->where('product_id', $product->id)
            ->where('period_type', $periodType)
            ->when($dates !== [], fn ($query) => $query->whereIn('period_date', $dates))
            ->orderBy('period_date')
            ->get()
            ->map(fn (SalesHistory $row): array => $this->format($row));

        return response()->json($saved);
    }

    /** DELETE /api/sales-history/products/{productCode} */
    public function clearProduct(string $productCode)
    {
        $product = Product::where('code', $productCode)->firstOrFail();
        $deleted = $product->salesHistory()->delete();

        return response()->json([
            'productId' => $product->code,
            'deleted' => $deleted,
        ]);
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
            'periodType' => $r->period_type,
            'unitsSold'  => $r->units_sold,
        ];
    }

    private function normalizePeriod(string $date, string $periodType): string
    {
        $period = Carbon::parse($date);

        return match ($periodType) {
            'week' => $period->startOfWeek(Carbon::MONDAY)->toDateString(),
            'year' => $period->startOfYear()->toDateString(),
            default => $period->startOfMonth()->toDateString(),
        };
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\PastSale;
use App\Models\Product;
use App\Services\SalesForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * PastSalesController — /api/past-sales
 *
 * Sales from before the product's Stock Control records begin, used as extra
 * forecasting history. Two ways in: a grid for one product (per MONTH or per
 * WEEK), or an Excel import of monthly sales for many products (the browser
 * reads the sheet and sends rows here; this controller matches products and
 * validates every row). Monthly rows feed the month/year forecasts, weekly
 * rows feed the weekly forecast.
 */
class PastSalesController extends Controller
{
    private const MONTH_PATTERN = '/^\d{4}-(0[1-9]|1[0-2])$/';

    private const WEEK_PATTERN = '/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/';

    public function __construct(private readonly SalesForecastService $forecasts) {}

    /** GET /api/past-sales?product={code}&periodType=month|week (month by default) */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product'    => ['required', 'string'],
            'periodType' => ['nullable', Rule::in(['month', 'week'])],
        ]);
        $product = Product::withTrashed()->where('code', $data['product'])->firstOrFail();

        if (($data['periodType'] ?? 'month') === 'week') {
            $cutoff = $this->forecasts->weeklyPastSalesCutoff($product);
            $rows = PastSale::where('product_id', $product->id)
                ->where('period_type', 'week')
                ->orderBy('period_date')
                ->get()
                ->map(fn (PastSale $sale) => [
                    'week'      => $sale->period_date->toDateString(),
                    'unitsSold' => $sale->units_sold,
                    'source'    => $sale->source,
                    'used'      => $sale->period_date->lt($cutoff),
                ]);

            return response()->json([
                'periodType'     => 'week',
                'productId'      => $product->code,
                'productName'    => $product->name,
                'cutoff'         => $cutoff->toDateString(),   // Monday of the first week NOT allowed
                'recordingStart' => $this->forecasts->firstMovementDate($product)?->toDateString(),
                'rows'           => $rows,
            ]);
        }

        $cutoff = $this->forecasts->pastSalesCutoff($product);

        $rows = PastSale::where('product_id', $product->id)
            ->where('period_type', 'month')
            ->orderBy('period_date')
            ->get()
            ->map(fn (PastSale $sale) => [
                'month'     => $sale->period_date->format('Y-m'),
                'unitsSold' => $sale->units_sold,
                'source'    => $sale->source,
                'used'      => $sale->period_date->lt($cutoff),
            ]);

        return response()->json([
            'periodType'     => 'month',
            'productId'      => $product->code,
            'productName'    => $product->name,
            'cutoff'         => $cutoff->format('Y-m'),
            'recordingStart' => $this->forecasts->recordingStart($product)?->format('Y-m'),
            'rows'           => $rows,
        ]);
    }

    /**
     * PUT /api/past-sales — save the month grid (or, with periodType=week,
     * the week grid) for one product. A null/blank unitsSold removes it.
     */
    public function save(Request $request): JsonResponse
    {
        if ($request->input('periodType') === 'week') {
            return $this->saveWeeks($request);
        }

        $data = $request->validate([
            'productId'           => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'records'             => ['required', 'array', 'max:120'],
            'records.*.month'     => ['required', 'string', 'distinct', 'regex:'.self::MONTH_PATTERN],
            'records.*.unitsSold' => ['nullable', 'integer', 'min:0', 'max:100000000'],
        ]);

        $product = Product::where('code', $data['productId'])->firstOrFail();
        $cutoff = $this->forecasts->pastSalesCutoff($product);

        foreach ($data['records'] as $index => $record) {
            if ($record['unitsSold'] !== null && ! Carbon::parse($record['month'].'-01')->lt($cutoff)) {
                throw ValidationException::withMessages([
                    "records.{$index}.month" => "Past sales can only be entered for months before {$cutoff->format('M Y')} — from then on, sales come from Stock Control.",
                ]);
            }
        }

        DB::transaction(function () use ($data, $product): void {
            $now = now();
            foreach ($data['records'] as $record) {
                $date = $record['month'].'-01';
                if ($record['unitsSold'] === null) {
                    PastSale::where('product_id', $product->id)->where('period_type', 'month')->whereDate('period_date', $date)->delete();
                    continue;
                }
                DB::table('past_sales')->upsert(
                    [[
                        'product_id'  => $product->id,
                        'period_type' => 'month',
                        'period_date' => $date,
                        'units_sold'  => $record['unitsSold'],
                        'source'      => 'manual',
                        'created_at'  => $now,
                        'updated_at'  => $now,
                    ]],
                    ['product_id', 'period_type', 'period_date'],
                    ['units_sold', 'source', 'updated_at']
                );
            }
        });

        ActivityLog::record('pastsales.save', "Updated past monthly sales — {$product->name}", 'boxes', ['product' => $product->name]);

        return $this->index(new Request(['product' => $product->code]));
    }

    /** The week grid: records = [{ week: 'YYYY-MM-DD' (a Monday), unitsSold }]. */
    private function saveWeeks(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId'           => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'periodType'          => ['required', Rule::in(['week'])],
            'records'             => ['required', 'array', 'max:260'],
            'records.*.week'      => ['required', 'string', 'distinct', 'regex:'.self::WEEK_PATTERN],
            'records.*.unitsSold' => ['nullable', 'integer', 'min:0', 'max:100000000'],
        ]);

        $product = Product::where('code', $data['productId'])->firstOrFail();
        $cutoff = $this->forecasts->weeklyPastSalesCutoff($product);

        foreach ($data['records'] as $index => $record) {
            $week = Carbon::parse($record['week']);
            if (! $week->isMonday()) {
                throw ValidationException::withMessages([
                    "records.{$index}.week" => 'A week must start on a Monday.',
                ]);
            }
            if ($record['unitsSold'] !== null && ! $week->lt($cutoff)) {
                throw ValidationException::withMessages([
                    "records.{$index}.week" => 'Past sales can only be entered for weeks before the week of '.$cutoff->format('M j, Y').' — from then on, sales come from Stock Control.',
                ]);
            }
        }

        DB::transaction(function () use ($data, $product): void {
            $now = now();
            foreach ($data['records'] as $record) {
                $date = Carbon::parse($record['week'])->toDateString();
                if ($record['unitsSold'] === null) {
                    PastSale::where('product_id', $product->id)->where('period_type', 'week')->whereDate('period_date', $date)->delete();
                    continue;
                }
                DB::table('past_sales')->upsert(
                    [[
                        'product_id'  => $product->id,
                        'period_type' => 'week',
                        'period_date' => $date,
                        'units_sold'  => $record['unitsSold'],
                        'source'      => 'manual',
                        'created_at'  => $now,
                        'updated_at'  => $now,
                    ]],
                    ['product_id', 'period_type', 'period_date'],
                    ['units_sold', 'source', 'updated_at']
                );
            }
        });

        ActivityLog::record('pastsales.save', "Updated past weekly sales — {$product->name}", 'boxes', ['product' => $product->name, 'periodType' => 'week']);

        return $this->index(new Request(['product' => $product->code, 'periodType' => 'week']));
    }

    /**
     * POST /api/past-sales/import
     *
     * rows: [{ row, productId?, productName?, month: 'YYYY-MM', unitsSold }]
     * commit=false → preview only; commit=true → save the ready rows.
     * Rows for the same product and month are added together, so a sheet of
     * individual sales (one row per sale) becomes monthly totals.
     */
    public function import(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rows'               => ['required', 'array', 'min:1', 'max:60000'],
            'rows.*.row'         => ['nullable', 'integer'],
            'rows.*.productId'   => ['nullable', 'string', 'max:255'],
            'rows.*.productName' => ['nullable', 'string', 'max:255'],
            'rows.*.month'       => ['nullable', 'string', 'max:20'],
            'rows.*.unitsSold'   => ['nullable'],
            'commit'             => ['sometimes', 'boolean'],
        ]);

        $products = Product::query()->get(['id', 'code', 'name']);
        $byCode = $products->keyBy(fn (Product $p) => mb_strtolower(trim($p->code)));
        $byName = $products->groupBy(fn (Product $p) => mb_strtolower(trim($p->name)));

        $cutoffs = [];
        $cutoffFor = function (Product $product) use (&$cutoffs): Carbon {
            return $cutoffs[$product->id] ??= $this->forecasts->pastSalesCutoff($product);
        };

        $issues = [];
        $ready = [];
        $issue = function (array $row, string $type, string $message) use (&$issues): void {
            $issues[] = [
                'row'     => $row['row'] ?? null,
                'product' => $row['productId'] ?? $row['productName'] ?? '',
                'month'   => $row['month'] ?? '',
                'type'    => $type,
                'message' => $message,
            ];
        };

        foreach ($data['rows'] as $row) {
            $code = mb_strtolower(trim((string) ($row['productId'] ?? '')));
            $name = mb_strtolower(trim((string) ($row['productName'] ?? '')));
            $product = $code !== '' ? $byCode->get($code) : null;
            if (! $product && $name !== '') {
                $matches = $byName->get($name);
                if ($matches && $matches->count() > 1) {
                    $issue($row, 'error', 'More than one product has this name — use the Product ID instead.');
                    continue;
                }
                $product = $matches?->first();
            }
            if (! $product) {
                $issue($row, 'error', $code === '' && $name === '' ? 'Missing product.' : 'Product not found in the system.');
                continue;
            }

            $month = (string) ($row['month'] ?? '');
            if (! preg_match(self::MONTH_PATTERN, $month)) {
                $issue($row, 'error', 'Month could not be read.');
                continue;
            }

            $units = $row['unitsSold'] ?? null;
            if ($units === null || $units === '') {
                continue; // blank cell — nothing sold recorded, skip quietly
            }
            if (! is_numeric($units) || (float) $units < 0 || floor((float) $units) != (float) $units) {
                $issue($row, 'error', 'Units sold must be a whole number of 0 or more.');
                continue;
            }

            $date = Carbon::parse($month.'-01');
            if (! $date->lt(now()->startOfMonth())) {
                $issue($row, 'skipped', 'This month is not finished yet.');
                continue;
            }
            $cutoff = $cutoffFor($product);
            if (! $date->lt($cutoff)) {
                $issue($row, 'skipped', "Already recorded in Stock Control from {$cutoff->format('M Y')}.");
                continue;
            }

            $key = $product->id.'|'.$month;
            $ready[$key] ??= ['productId' => $product->id, 'code' => $product->code, 'name' => $product->name, 'month' => $month, 'unitsSold' => 0, 'rows' => 0];
            $ready[$key]['unitsSold'] += (int) $units;
            $ready[$key]['rows']++;
        }

        $saved = 0;
        if ($request->boolean('commit') && $ready) {
            DB::transaction(function () use ($ready, &$saved): void {
                $now = now();
                foreach (array_chunk(array_values($ready), 500) as $chunk) {
                    DB::table('past_sales')->upsert(
                        array_map(fn (array $r) => [
                            'product_id'  => $r['productId'],
                            'period_type' => 'month',
                            'period_date' => $r['month'].'-01',
                            'units_sold'  => $r['unitsSold'],
                            'source'      => 'import',
                            'created_at'  => $now,
                            'updated_at'  => $now,
                        ], $chunk),
                        ['product_id', 'period_type', 'period_date'],
                        ['units_sold', 'source', 'updated_at']
                    );
                    $saved += count($chunk);
                }
            });
            ActivityLog::record('pastsales.import', "Imported {$saved} months of past sales from Excel", 'boxes', ['months' => $saved]);
        }

        $readyList = array_values($ready);
        usort($readyList, fn ($a, $b) => [$a['name'], $a['month']] <=> [$b['name'], $b['month']]);
        $errors = count(array_filter($issues, fn ($i) => $i['type'] === 'error'));

        return response()->json([
            'committed' => $request->boolean('commit'),
            'saved'     => $saved,
            'summary'   => [
                'rowsRead'     => count($data['rows']),
                'readyMonths'  => count($readyList),
                'products'     => count(array_unique(array_column($readyList, 'productId'))),
                'totalUnits'   => array_sum(array_column($readyList, 'unitsSold')),
                'errors'       => $errors,
                'skipped'      => count($issues) - $errors,
            ],
            'ready'     => array_map(fn ($r) => [
                'productId' => $r['code'],
                'product'   => $r['name'],
                'month'     => $r['month'],
                'unitsSold' => $r['unitsSold'],
                'rows'      => $r['rows'],
            ], array_slice($readyList, 0, 300)),
            'issues'    => array_slice($issues, 0, 500),
        ]);
    }
}

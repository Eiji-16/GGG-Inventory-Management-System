<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ReorderPointService;
use App\Services\SalesForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ReportController — /api/reports
 *
 * Computes every Reports & Analytics tab from real data in one call:
 * stock summary, movement trend, top movers, demand forecast, AutoCalculator
 * log, inventory aging, and reorder-point. Read-only / derived — no new tables.
 */
class ReportController extends Controller
{
    public function __construct(
        private readonly ReorderPointService $reorderPoints,
        private readonly SalesForecastService $forecasts,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $products = Product::with('safetyStock')->orderBy('name')->get();

        return response()->json([
            'stockSummary'   => $this->stockSummary($products),
            'stockMovement'  => $this->stockMovement(),
            'topMoving'      => $this->topMoving(),
            'fastSlowMoving' => $this->fastSlowMoving($products),
            'demandForecast' => $this->demandForecast($products),
            'autoCalculator' => $this->autoCalculatorLog(),
            'inventoryAging' => $this->inventoryAging($products),
            'reorderPoint'   => $this->reorderPoint($products),
        ]);
    }

    /** Uses demand during lead time plus safety stock; falls back to safety stock. */
    private function reorderPointFor(Product $p): int
    {
        return $this->reorderPoints->forProduct($p);
    }

    private function statusFor(Product $p): string
    {
        return match ($this->reorderPoints->statusFor($p)) {
            'out' => 'Out of Stock',
            'critical', 'low' => 'Low Stock',
            default => 'In Stock',
        };
    }

    private function stockSummary($products): array
    {
        $totalStock = 0;
        $low = 0;
        $out = 0;
        $value = 0.0;
        $rows = [];

        foreach ($products as $p) {
            $stock = (int) $p->stock_on_hand;
            $status = $this->statusFor($p);
            $totalStock += $stock;
            if ($status === 'Low Stock') $low++;
            if ($status === 'Out of Stock') $out++;
            $value += $stock * (float) ($p->unit_cost ?? 0);

            $rows[] = [
                'product'  => $p->name,
                'category' => $p->category ?? '—',
                'stock'    => $stock,
                'status'   => $status,
            ];
        }

        return [
            'kpis' => [
                'totalStock'     => $totalStock,
                'productCount'   => $products->count(),
                'lowStock'       => $low,
                'outOfStock'     => $out,
                'inventoryValue' => round($value, 2),
            ],
            'rows' => $rows,
        ];
    }

    /** Stock in/out/net grouped by ISO week (last 8 weeks with activity). */
    private function stockMovement(): array
    {
        $movements = StockMovement::where('is_adjustment', false)
            ->orderBy('movement_date')
            ->get(['movement_type', 'qty', 'movement_date']);

        $byWeek = [];
        foreach ($movements as $m) {
            $key = $m->movement_date->format('o-\WW'); // ISO year-week
            $byWeek[$key] ??= ['period' => $m->movement_date->format('M j'), 'in' => 0, 'out' => 0];
            if ($m->movement_type === 'in') {
                $byWeek[$key]['in'] += (int) $m->qty;
            } else {
                $byWeek[$key]['out'] += (int) $m->qty;
            }
        }

        $rows = array_values(array_map(function ($w) {
            $w['net'] = $w['in'] - $w['out'];
            return $w;
        }, $byWeek));

        return ['rows' => array_slice($rows, -8)];
    }

    /** Rank products by total units moved OUT (sales velocity). */
    private function topMoving(): array
    {
        $out = StockMovement::where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->selectRaw('product_id, product_name, SUM(qty) as units')
            ->groupBy('product_id', 'product_name')
            ->orderByDesc('units')
            ->get();

        $products = Product::withTrashed()->whereIn('id', $out->pluck('product_id'))->get()->keyBy('id');

        $rows = [];
        $rank = 1;
        foreach ($out as $o) {
            $cost = (float) ($products[$o->product_id]->unit_cost ?? 0);
            $rows[] = [
                'rank'      => $rank++,
                'product'   => $o->product_name,
                'unitsSold' => (int) $o->units,
                'value'     => round((int) $o->units * $cost, 2),
            ];
        }

        return ['rows' => $rows];
    }

    /**
     * Fast- vs slow-moving products and the weekly sales trend.
     * "Sales" are non-adjustment stock-out movements from Stock Movement Tracking.
     * Fast = most units sold in the last 90 days; slow = in-stock items with the
     * fewest units sold in the same window (including items with no sales).
     */
    private function fastSlowMoving($products): array
    {
        $windowDays = 90;
        $since = now()->subDays($windowDays)->toDateString();

        $sold = StockMovement::where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '>=', $since)
            ->selectRaw('product_id, SUM(qty) as units')
            ->groupBy('product_id')
            ->pluck('units', 'product_id');

        $items = $products->map(fn (Product $p) => [
            'product'   => $p->name,
            'category'  => $p->category ?? '—',
            'unitsSold' => (int) ($sold[$p->id] ?? 0),
            'stock'     => (int) $p->stock_on_hand,
        ]);

        // Rank every product that sold or still has stock, then split the
        // ranking: the top half (max 5) is fast-moving, the bottom half of the
        // in-stock items (max 5) is slow-moving. The lists never overlap, so a
        // small catalog still shows both sides.
        $ranked = $items->filter(fn ($i) => $i['unitsSold'] > 0 || $i['stock'] > 0)
            ->sortBy([['unitsSold', 'desc'], ['stock', 'asc']])
            ->values();
        $fastCount = min(5, (int) ceil($ranked->count() / 2));
        $fast = $ranked->take($fastCount)->filter(fn ($i) => $i['unitsSold'] > 0)->values();

        $fastNames = $fast->pluck('product')->all();
        $slow = $ranked->filter(fn ($i) => $i['stock'] > 0 && ! in_array($i['product'], $fastNames, true))
            ->sortBy([['unitsSold', 'asc'], ['stock', 'desc']])
            ->take(5)
            ->values();

        $rows = [];
        foreach ($fast as $i => $item) {
            $rows[] = ['rank' => $i + 1, 'movement' => 'Fast-Moving'] + $item;
        }
        foreach ($slow as $i => $item) {
            $rows[] = ['rank' => $i + 1, 'movement' => 'Slow-Moving'] + $item;
        }

        // Weekly sales trend: stock-out units for the last 8 weeks (Monday start).
        $weeks = 8;
        $firstWeek = now()->startOfWeek(\Illuminate\Support\Carbon::MONDAY)->subWeeks($weeks - 1);
        $trend = [];
        for ($w = 0; $w < $weeks; $w++) {
            $start = $firstWeek->copy()->addWeeks($w);
            $trend[$start->toDateString()] = ['period' => $start->format('M j'), 'units' => 0];
        }
        $outs = StockMovement::where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '>=', $firstWeek->toDateString())
            ->get(['qty', 'movement_date']);
        foreach ($outs as $m) {
            $key = \Illuminate\Support\Carbon::parse($m->movement_date)
                ->startOfWeek(\Illuminate\Support\Carbon::MONDAY)
                ->toDateString();
            if (isset($trend[$key])) {
                $trend[$key]['units'] += (int) $m->qty;
            }
        }

        return [
            'windowDays' => $windowDays,
            'fast'       => $fast->all(),
            'slow'       => $slow->all(),
            'rows'       => $rows,
            'trend'      => array_values($trend),
        ];
    }

    /** WMA of the latest three completed months of stock-out sales. */
    private function demandForecast($products): array
    {
        $rows = [];
        foreach ($products as $p) {
            $series = $this->forecasts->salesSeries($p, 'month');
            $periodCount = count($series);
            if ($periodCount === 0) continue;

            $forecast = round($this->forecasts->weightedMovingAverage(
                array_map(fn (array $row) => (float) $row['unitsSold'], $series)
            ), 1);
            $stock = (int) $p->stock_on_hand;
            $suggested = max(0, (int) ceil($forecast - $stock + $this->reorderPointFor($p)));
            $confidence = $this->forecasts->confidenceFor($periodCount);

            $rows[] = [
                'product'          => $p->name,
                'currentStock'     => $stock,
                'forecastedDemand' => $forecast,
                'suggestedReorder' => $suggested,
                'confidence'       => $confidence,
            ];
        }

        return ['rows' => $rows];
    }

    /** Every AutoCalculator computation logged (from the activity trail). */
    private function autoCalculatorLog(): array
    {
        $logs = ActivityLog::where('action', 'formula.compute')
            ->latest()
            ->limit(50)
            ->get();

        $rows = $logs->map(fn (ActivityLog $log) => [
            'formula' => $log->meta['formula'] ?? '—',
            'product' => $log->meta['product'] ?? '—',
            'productId' => $log->meta['productId'] ?? null,
            'result'  => isset($log->meta['result']) ? (float) $log->meta['result'] : null,
            'unit'    => $log->meta['unit'] ?? '',
            'demandSource' => $log->meta['demandSource'] ?? 'historical',
            'annualDemand' => $log->meta['inputs']['annualDemand'] ?? null,
            'forecast' => $log->meta['forecast'] ?? null,
            'recommendedOrderQuantity' => $log->meta['recommendedOrderQuantity'] ?? null,
            'by'      => $log->meta['by'] ?? ($log->user?->name ?? '—'),
            'date'    => $log->created_at?->format('n/j/Y g:i A'),
        ])->all();

        return ['rows' => $rows];
    }

    /** Use the latest stock-in date, falling back to product creation as an estimate. */
    private function inventoryAging($products): array
    {
        $rows = [];
        foreach ($products as $p) {
            if ((int) $p->stock_on_hand <= 0) continue;

            $lastIn = StockMovement::where('product_id', $p->id)
                ->where('movement_type', 'in')
                ->max('movement_date');
            $ageDate = $lastIn ?? $p->created_at?->toDateString();
            $ageEstimated = $lastIn === null;

            $days = $ageDate
                ? abs((int) now()->startOfDay()->diffInDays(\Illuminate\Support\Carbon::parse($ageDate)->startOfDay()))
                : null;

            $status = $days === null ? 'Unknown' : ($days > 120 ? 'Slow Mover' : ($days > 60 ? 'Aging' : 'Healthy'));

            $rows[] = [
                'product'    => $p->name,
                'daysInStock'=> $days,
                'ageEstimated' => $ageEstimated,
                'stock'      => (int) $p->stock_on_hand,
                'status'     => $status,
            ];
        }

        usort($rows, fn ($a, $b) => ($b['daysInStock'] ?? 0) <=> ($a['daysInStock'] ?? 0));

        return ['rows' => $rows];
    }

    /** Products at or below their reorder point. */
    private function reorderPoint($products): array
    {
        $rows = [];
        foreach ($products as $p) {
            $stock = (int) $p->stock_on_hand;
            $rop = $this->reorderPointFor($p);
            // Uses the product's status points (Automatic or Manual).
            $status = $this->reorderPoints->statusFor($p, $stock);
            if ($status === 'healthy') continue;

            $urgency = ['out' => 'Out of Stock', 'critical' => 'Critical', 'low' => 'Low'][$status];

            $rows[] = [
                'product'      => $p->name,
                'currentStock' => $stock,
                'reorderPoint' => $rop,
                'urgency'      => $urgency,
            ];
        }

        usort($rows, fn ($a, $b) => $a['currentStock'] <=> $b['currentStock']);

        return ['rows' => $rows];
    }
}

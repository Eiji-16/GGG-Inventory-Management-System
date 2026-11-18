<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockMovement;
use App\Services\ReorderPointService;
use App\Services\RoleAccessService;
use App\Services\SalesForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ReportController — /api/reports
 *
 * Computes every Reports & Analytics tab from real data in one call:
 * stock summary, movement trend, top movers (last 12 months), demand forecast, AutoCalculator
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
        $products = Product::query()
            ->whereNull('products.deleted_at')
            ->with(['safetyStock', 'supplier'])
            ->withoutPhoto()
            ->orderBy('name')
            ->get();
        // Speed: read every product's sales once instead of once per product.
        $this->reorderPoints->preload($products);
        $this->forecasts->preload($products);

        // Role Access: only build the tabs this user is allowed to see.
        $allowed = RoleAccessService::effectiveFor($request->user());
        $can = fn (string $section): bool => $allowed[RoleAccessService::REPORT_SECTIONS[$section]] ?? false;

        // Products with at least one stock entry ("tracked"). The Reorder List
        // and the Dashboard's Low Stock count only use these (2026-11-08), so
        // a brand-new product with no entries is not listed as needing a restock.
        $tracked = array_flip(StockMovement::query()->distinct()->pluck('product_id')->filter()->all());

        $builders = [
            'stockSummary'   => fn () => $this->stockSummary($products, $tracked),
            'stockMovement'  => fn () => $this->stockMovement(),
            'topMoving'      => fn () => $this->topMoving($products),
            'fastSlowMoving' => fn () => $this->fastSlowMoving($products),
            'demandForecast' => fn () => $this->demandForecast($products),
            'autoCalculator' => fn () => $this->autoCalculatorLog(),
            'inventoryAging' => fn () => $this->inventoryAging($products),
            'reorderPoint'   => fn () => $this->reorderPoint($products, $tracked),
        ];

        $payload = ['generatedAt' => now()->toIso8601String()];
        foreach ($builders as $section => $build) {
            if ($can($section)) {
                $payload[$section] = $build();
            }
        }

        return response()->json($payload);
    }

    /**
     * Today on the shop's clock (Philippines) as a plain date at midnight
     * (2026-11-08). The server clock is UTC, so before 8 AM it was still
     * "yesterday" there: on a Monday morning the weekly charts showed last week.
     */
    private function shopToday(): \Illuminate\Support\Carbon
    {
        return \Illuminate\Support\Carbon::parse(SalesForecastService::shopNow()->toDateString());
    }

    /* ===== TWO STOCK STATUSES ON SCREEN (2026-11-18) =====
       Shown as Low Stock or Out of Stock everywhere (as the panel asked).
       At or below safety stock still counts in the math (criticalStock,
       reorder point), it is just labelled "Low Stock". */
    private function statusFor(Product $p): string
    {
        return match ($this->reorderPoints->statusFor($p)) {
            'out' => 'Out of Stock',
            'critical', 'low' => 'Low Stock',
            default => 'In Stock',
        };
    }

    /**
     * Cost per unit for inventory value: the product's unit cost if one is
     * set, otherwise the unit price on its latest Stock In that has a price.
     * (The screens record prices on each stock transaction, so products.unit_cost
     * is usually empty — using it alone made Inventory Value always 0.)
     *
     * @return array<int, float>  product id => cost
     */
    private function unitCosts($products): array
    {
        $latestInPrice = StockMovement::query()
            ->where('movement_type', 'in')
            ->where('is_adjustment', false)
            ->where('unit_price', '>', 0)   // a price of 0 is "no price" (2026-11-17)
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get(['product_id', 'unit_price'])
            ->keyBy('product_id')        // last one wins = latest
            ->map(fn ($row) => (float) $row->unit_price);

        $costs = [];
        foreach ($products as $p) {
            $cost = $p->unit_cost !== null && (float) $p->unit_cost > 0 ? (float) $p->unit_cost : ($latestInPrice[$p->id] ?? null);
            if ($cost !== null) {
                $costs[$p->id] = $cost;
            }
        }

        return $costs;
    }

    private function stockSummary($products, array $tracked = []): array
    {
        $totalStock = 0;
        $low = 0;
        $critical = 0;
        $out = 0;
        $value = 0.0;
        $unpricedInStock = 0;
        $rows = [];
        $costs = $this->unitCosts($products);

        foreach ($products as $p) {
            $stock = (int) $p->stock_on_hand;
            // No Stock Control entries yet: "No Stock Records" instead of
            // Low/Critical/Out (2026-11-10). The cards already skip these
            // products, like the Dashboard and the Reorder List, so the table
            // now agrees with them.
            $status = isset($tracked[$p->id]) ? $this->statusFor($p) : 'No Stock Records';
            // Counted from the exact level, so criticalStock stays right.
            $level = isset($tracked[$p->id]) ? $this->reorderPoints->statusFor($p) : null;
            $totalStock += $stock;
            // Low / Critical / Out counts: tracked products only, the same
            // as the Dashboard's Low Stock Items and the Reorder List.
            if (isset($tracked[$p->id])) {
                if ($level === 'low') $low++;
                if ($level === 'critical') $critical++;
                if ($level === 'out') $out++;
            }
            $cost = $costs[$p->id] ?? null;
            if ($cost !== null) {
                $value += $stock * $cost;
            } elseif ($stock > 0) {
                $unpricedInStock++;
            }

            $rows[] = [
                'productId' => $p->code,
                'product'   => $p->name,
                'category'  => $p->category ?? '—',
                'stock'     => $stock,
                'unitCost'  => $cost,
                'value'     => $cost !== null ? round($stock * $cost, 2) : null,
                'status'    => $status,
            ];
        }

        return [
            'kpis' => [
                'totalStock'     => $totalStock,
                'productCount'   => $products->count(),
                // Low Stock Items = Low + Critical (both need reordering).
                'lowStock'       => $low + $critical,
                'criticalStock'  => $critical,
                'outOfStock'     => $out,
                'inventoryValue' => round($value, 2),
                // In-stock products with no cost yet (left out of the value).
                'unpricedProducts' => $unpricedInStock,
            ],
            'rows' => $rows,
        ];
    }

    /**
     * Stock in / out / net for each of the last 8 weeks (Monday start),
     * including weeks with no movement, labelled by the week's Monday.
     * Corrections (counted-stock adjustments) are not purchases or sales, so
     * they are left out.
     */
    private function stockMovement(): array
    {
        $weeks = 8;
        $firstWeek = $this->shopToday()->startOfWeek(\Illuminate\Support\Carbon::MONDAY)->subWeeks($weeks - 1);
        $byWeek = [];
        for ($w = 0; $w < $weeks; $w++) {
            $start = $firstWeek->copy()->addWeeks($w);
            $byWeek[$start->toDateString()] = [
                'period'    => $start->format('M j'),
                'weekStart' => $start->toDateString(),
                'in'        => 0,
                'out'       => 0,
            ];
        }

        $movements = StockMovement::where('is_adjustment', false)
            ->where('movement_date', '>=', $firstWeek->toDateString())
            ->get(['movement_type', 'qty', 'movement_date']);

        foreach ($movements as $m) {
            $key = $m->movement_date->copy()->startOfWeek(\Illuminate\Support\Carbon::MONDAY)->toDateString();
            if (! isset($byWeek[$key])) {
                continue;   // a future-dated entry
            }
            $byWeek[$key][$m->movement_type === 'in' ? 'in' : 'out'] += (int) $m->qty;
        }

        $rows = array_values(array_map(function ($w) {
            $w['net'] = $w['in'] - $w['out'];
            return $w;
        }, $byWeek));

        return ['rows' => $rows];
    }

    /**
     * Past Sales units of one product from $start (a plain date) up to today.
     * Months fully inside count fully; the month $start falls in counts only
     * for its days from $start (same rule as the annual demand). Only months
     * before the product's Stock Control records begin are given, so a sale
     * is never counted twice with Stock Out (2026-11-17).
     */
    private function pastUnitsSince(Product $p, \Illuminate\Support\Carbon $start): float
    {
        $units = 0.0;
        foreach ($this->forecasts->pastMonthlyTotals($p) as $month => $row) {
            $monthStart = \Illuminate\Support\Carbon::parse($month)->startOfMonth();
            $monthEnd = $monthStart->copy()->endOfMonth()->startOfDay();
            if ($monthEnd->lt($start)) {
                continue;
            }
            $share = 1.0;
            if ($monthStart->lt($start)) {
                $daysInside = (int) round($start->diffInDays($monthEnd, true)) + 1;
                $share = $daysInside / $monthStart->daysInMonth;
            }
            $units += (float) $row['unitsSold'] * $share;
        }

        return $units;
    }

    /**
     * Rank products by units sold in the last 12 months (this month and the
     * 11 before it — the same months as the Dashboard's Top Products Sold):
     * Stock Out (not corrections) plus Past Sales (2026-11-17; it used to
     * count Stock Out only, so imported sales history was missing).
     *
     * Sales Value = units × the selling price saved on each sale. Sales
     * without a price (and Past Sales, which have no price) use the product's
     * latest selling price, or its latest Stock In price if it was never sold
     * with a price — the row says which, so $0 is never shown for a product
     * that has a price.
     */
    private function topMoving($products): array
    {
        $today = $this->shopToday();
        $since = $today->copy()->startOfMonth()->subMonthsNoOverflow(11);

        $out = StockMovement::where('movement_type', 'out')
            ->where('is_adjustment', false)
            // "Before tomorrow" instead of "up to today": some databases save the
            // date with a time (2026-11-17 00:00:00), which is after "2026-11-17".
            ->where('movement_date', '>=', $since->toDateString())
            ->where('movement_date', '<', $today->copy()->addDay()->toDateString())
            ->selectRaw('product_id, SUM(qty) as units,
                SUM(CASE WHEN unit_price > 0 THEN qty ELSE 0 END) as priced_units,
                SUM(CASE WHEN unit_price > 0 THEN qty * unit_price ELSE 0 END) as priced_value')
            ->groupBy('product_id')
            ->get()
            ->keyBy('product_id');

        // Latest selling price of each product (any date).
        $lastSellingPrice = StockMovement::query()
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('unit_price', '>', 0)
            ->orderBy('movement_date')
            ->orderBy('id')
            ->get(['product_id', 'unit_price'])
            ->keyBy('product_id')        // last one wins = latest
            ->map(fn ($row) => (float) $row->unit_price);
        $costs = $this->unitCosts($products);

        $rows = [];
        foreach ($products as $p) {
            $o = $out[$p->id] ?? null;
            $pastUnits = (int) round($this->pastUnitsSince($p, $since));
            $units = (int) ($o->units ?? 0) + $pastUnits;
            if ($units <= 0) {
                continue;
            }
            $pricedUnits = (int) ($o->priced_units ?? 0);
            $recordedValue = round((float) ($o->priced_value ?? 0), 2);
            $missingUnits = $units - $pricedUnits;

            $fallback = $lastSellingPrice[$p->id] ?? null;
            $estimateFrom = $fallback !== null ? 'selling' : null;
            if ($fallback === null && isset($costs[$p->id])) {
                $fallback = $costs[$p->id];
                $estimateFrom = 'stockIn';
            }

            if ($missingUnits <= 0) {
                $value = $recordedValue;
                $estimateFrom = null;
            } elseif ($fallback !== null) {
                $value = round($recordedValue + $missingUnits * $fallback, 2);
            } else {
                // No price anywhere for this product: no value instead of $0.
                $value = $pricedUnits > 0 ? $recordedValue : null;
                $estimateFrom = null;
            }

            $rows[] = [
                'productId'     => $p->code,
                'product'       => $p->name,
                'deleted'       => false,
                'unitsSold'     => $units,
                'pastUnits'     => $pastUnits,
                'value'         => $value,
                // Part of the value saved on the sales themselves.
                'recordedValue' => $recordedValue,
                // Units valued at the latest price ('selling' | 'stockIn'), or
                // units with no price at all (estimateFrom null).
                'estimatedUnits' => $missingUnits > 0 ? $missingUnits : 0,
                'estimateFrom'  => $estimateFrom,
                'estimatePrice' => $estimateFrom ? $fallback : null,
            ];
        }

        usort($rows, fn ($a, $b) => $b['unitsSold'] <=> $a['unitsSold'] ?: strcasecmp($a['product'], $b['product']));
        foreach ($rows as $i => &$row) {
            $row = ['rank' => $i + 1] + $row;
        }
        unset($row);

        return ['periodStart' => $since->toDateString(), 'rows' => $rows];
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
        $since = $this->shopToday()->subDays($windowDays)->toDateString();

        $sold = StockMovement::where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '>=', $since)
            ->where('movement_date', '<', $this->shopToday()->addDay()->toDateString())   // up to today (see topMoving)
            ->selectRaw('product_id, SUM(qty) as units')
            ->groupBy('product_id')
            ->pluck('units', 'product_id');
        $sinceDate = \Illuminate\Support\Carbon::parse($since);

        // Units sold = Stock Out + Past Sales in the same 90 days (2026-11-17;
        // Past Sales were missing, so imported sales history looked like 0 sold).
        $items = $products->map(fn (Product $p) => [
            'productId' => $p->code,
            'product'   => $p->name,
            'category'  => $p->category ?? '—',
            'unitsSold' => (int) ($sold[$p->id] ?? 0) + (int) round($this->pastUnitsSince($p, $sinceDate)),
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

        $fastIds = $fast->pluck('productId')->all();
        $slow = $ranked->filter(fn ($i) => $i['stock'] > 0 && ! in_array($i['productId'], $fastIds, true))
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
        $firstWeek = $this->shopToday()->startOfWeek(\Illuminate\Support\Carbon::MONDAY)->subWeeks($weeks - 1);
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

    /**
     * This month's forecast for each product — the same number the
     * Forecasting page shows (3-period WMA, plus any active seasonal event).
     * Suggested Reorder uses the same rule as the Dashboard's Order Soon card:
     * enough to cover the lead time and next month while keeping safety stock.
     */
    private function demandForecast($products): array
    {
        $rows = [];
        foreach ($products as $p) {
            try {
                $forecast = $this->forecasts->forecast($p, 'month');
            } catch (\Illuminate\Validation\ValidationException) {
                continue;   // no completed month of sales yet
            }

            $monthly = (float) $forecast['adjustedForecast'];
            $periodDays = max(1, (int) ($forecast['periodDays'] ?? 30));
            $daily = $monthly / $periodDays;
            $stock = (int) $p->stock_on_hand;
            $safety = $this->reorderPoints->safetyStock($p);
            $lead = $this->reorderPoints->leadTimeDays($p) ?? 0;
            $suggested = max(0, (int) ceil($safety + $daily * $lead + $monthly - $stock));

            $rows[] = [
                'productId'        => $p->code,
                'product'          => $p->name,
                'forecastPeriod'   => $forecast['forecastPeriod'],
                'currentStock'     => $stock,
                'baseForecast'     => round((float) $forecast['baseForecast'], 1),
                'adjustmentPct'    => (float) ($forecast['adjustmentPct'] ?? 0),
                'forecastedDemand' => round($monthly, 1),
                'suggestedReorder' => $suggested,
                'confidence'       => $forecast['confidence'],
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

        // The table shows the newest 50; the card shows how many there are in all (2026-11-17).
        return [
            'total' => ActivityLog::where('action', 'formula.compute')->count(),
            'limit' => 50,
            'rows'  => $rows,
        ];
    }

    /** Use the latest stock-in date, falling back to product creation as an estimate. */
    private function inventoryAging($products): array
    {
        // Latest real Stock In per product (corrections are not deliveries).
        $lastIns = StockMovement::where('movement_type', 'in')
            ->where('is_adjustment', false)
            ->selectRaw('product_id, MAX(movement_date) as last_in')
            ->groupBy('product_id')
            ->pluck('last_in', 'product_id');

        $rows = [];
        foreach ($products as $p) {
            if ((int) $p->stock_on_hand <= 0) continue;

            $lastIn = $lastIns[$p->id] ?? null;
            $lastIn = $lastIn ? substr((string) $lastIn, 0, 10) : null;
            $ageDate = $lastIn ?? $p->created_at?->toDateString();
            $ageEstimated = $lastIn === null;

            $days = $ageDate
                ? abs((int) $this->shopToday()->diffInDays(\Illuminate\Support\Carbon::parse($ageDate)->startOfDay()))
                : null;

            $status = $days === null ? 'Unknown' : ($days > 120 ? 'Slow Mover' : ($days > 60 ? 'Aging' : 'Healthy'));

            $rows[] = [
                'productId'  => $p->code,
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

    /** Products at or below their reorder point — the same list as the Reorder List page. */
    private function reorderPoint($products, array $tracked = []): array
    {
        $rows = [];
        foreach ($products as $p) {
            // No stock entries yet = not in the Reorder List either (2026-11-08).
            if (! isset($tracked[$p->id])) continue;
            $stock = (int) $p->stock_on_hand;
            // Uses the product's status points (Automatic or Manual) — the
            // same points Stock Control and Reorder Alerts use.
            $points = $this->reorderPoints->statusPoints($p);
            $status = $this->reorderPoints->statusFor($p, $stock);
            if ($status === 'healthy') continue;

            // Two labels on screen (2026-11-18): Low Stock or Out of Stock.
            $urgency = ['out' => 'Out of Stock', 'critical' => 'Low Stock', 'low' => 'Low Stock'][$status];

            $rows[] = [
                'productId'     => $p->code,
                'product'       => $p->name,
                'currentStock'  => $stock,
                // The stock level where the product turns Low.
                'reorderPoint'  => (int) $points['low'],
                'criticalPoint' => (int) $points['critical'],
                // No Safety Stock Policy yet = the default 10 / 5 points, not
                // points typed by hand (2026-11-17: it said "manual").
                'mode'          => $p->safetyStock ? $points['mode'] : 'default',
                'urgency'       => $urgency,
            ];
        }

        usort($rows, fn ($a, $b) => $a['currentStock'] <=> $b['currentStock']);

        return ['rows' => $rows];
    }
}

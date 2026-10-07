<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\SalesHistory;
use App\Models\StockMovement;
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
    public function index(Request $request): JsonResponse
    {
        $products = Product::with('safetyStock')->orderBy('name')->get();

        return response()->json([
            'stockSummary'   => $this->stockSummary($products),
            'stockMovement'  => $this->stockMovement(),
            'topMoving'      => $this->topMoving(),
            'demandForecast' => $this->demandForecast($products),
            'autoCalculator' => $this->autoCalculatorLog(),
            'inventoryAging' => $this->inventoryAging($products),
            'reorderPoint'   => $this->reorderPoint($products),
        ]);
    }

    /** Reorder point for a product: its safety stock, else a default of 20. */
    private function reorderPointFor(Product $p): int
    {
        return (int) ($p->safetyStock->safety_stock ?? 20);
    }

    private function statusFor(Product $p): string
    {
        $stock = (int) $p->stock_on_hand;
        if ($stock <= 0) return 'Out of Stock';
        if ($stock <= $this->reorderPointFor($p)) return 'Low Stock';
        return 'In Stock';
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

        $products = Product::whereIn('id', $out->pluck('product_id'))->get()->keyBy('id');

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

    /** Simple forecast: average monthly units sold from sales history. */
    private function demandForecast($products): array
    {
        $rows = [];
        foreach ($products as $p) {
            $history = SalesHistory::where('product_id', $p->id)->pluck('units_sold');
            if ($history->isEmpty()) continue;

            $avg = round($history->avg(), 1);
            $stock = (int) $p->stock_on_hand;
            $suggested = max(0, (int) ceil($avg - $stock + $this->reorderPointFor($p)));
            $confidence = $history->count() >= 6 ? 'High' : ($history->count() >= 3 ? 'Medium' : 'Low');

            $rows[] = [
                'product'          => $p->name,
                'currentStock'     => $stock,
                'forecastedDemand' => $avg,
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
            'result'  => isset($log->meta['result']) ? round((float) $log->meta['result'], 2) : null,
            'unit'    => $log->meta['unit'] ?? '',
            'by'      => $log->meta['by'] ?? ($log->user?->name ?? '—'),
            'date'    => $log->created_at?->format('n/j/Y g:i A'),
        ])->all();

        return ['rows' => $rows];
    }

    /** Days since the last stock-in = how long current stock has sat. */
    private function inventoryAging($products): array
    {
        $rows = [];
        foreach ($products as $p) {
            if ((int) $p->stock_on_hand <= 0) continue;

            $lastIn = StockMovement::where('product_id', $p->id)
                ->where('movement_type', 'in')
                ->max('movement_date');

            $days = $lastIn ? (int) now()->startOfDay()->diffInDays(\Illuminate\Support\Carbon::parse($lastIn)->startOfDay()) : null;

            $status = $days === null ? 'Unknown' : ($days > 120 ? 'Slow Mover' : ($days > 60 ? 'Aging' : 'Healthy'));

            $rows[] = [
                'product'    => $p->name,
                'daysInStock'=> $days,
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
            if ($stock > $rop) continue;

            $urgency = $stock <= 0 ? 'Out of Stock' : ($stock <= $rop / 2 ? 'Critical' : 'Low');

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

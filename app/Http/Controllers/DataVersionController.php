<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * GET /api/data-version — a short fingerprint of the data the reports use.
 *
 * The main page asks for it every 5 seconds (while the tab is visible); when the fingerprint
 * changes, someone added, edited or deleted something, so the screen reloads.
 * It only counts rows and reads the latest update time — very cheap, and it
 * never returns the data itself.
 */
class DataVersionController extends Controller
{
    private const TABLES = [
        'products',
        'stock_movements',
        'safety_stock',
        'suppliers',
        'seasonal_events',
        'past_sales',
        'activity_logs',
        'restock_requests',   // Staff Notify
        'app_settings',       // currency, logo, Role Access
    ];

    public function __invoke(): JsonResponse
    {
        $parts = [];
        foreach (self::TABLES as $table) {
            try {
                $row = DB::table($table)->selectRaw('COUNT(*) as c, MAX(updated_at) as u')->first();
                $parts[] = $table.':'.($row->c ?? 0).':'.($row->u ?? '');
            } catch (\Throwable) {
                $parts[] = $table.':missing';   // table not migrated yet
            }
        }

        return response()->json(['version' => md5(implode('|', $parts))])
            ->header('Cache-Control', 'no-store');
    }
}

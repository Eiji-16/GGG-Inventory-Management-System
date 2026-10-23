<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\SeasonalEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * SeasonalEventController — /api/seasonal-events
 *
 * Create, list, edit and delete seasonal events (name, date range, adjustment
 * percentage and affected products) used by the Sales Forecasting module.
 */
class SeasonalEventController extends Controller
{
    /** GET /api/seasonal-events */
    public function index(): JsonResponse
    {
        $events = SeasonalEvent::orderByDesc('start_date')->get();
        $names = Product::pluck('name', 'code');

        return response()->json($events->map(fn (SeasonalEvent $event) => $this->format($event, $names)));
    }

    /** POST /api/seasonal-events */
    public function store(Request $request): JsonResponse
    {
        $event = SeasonalEvent::create($this->validated($request));
        ActivityLog::record('seasonal.create', "Added seasonal event — {$event->name}", 'calendar', ['event' => $event->name]);

        return response()->json($this->format($event, Product::pluck('name', 'code')), 201);
    }

    /** PUT/PATCH /api/seasonal-events/{seasonalEvent} */
    public function update(Request $request, SeasonalEvent $seasonalEvent): JsonResponse
    {
        $seasonalEvent->update($this->validated($request));
        ActivityLog::record('seasonal.update', "Updated seasonal event — {$seasonalEvent->name}", 'calendar', ['event' => $seasonalEvent->name]);

        return response()->json($this->format($seasonalEvent->fresh(), Product::pluck('name', 'code')));
    }

    /** DELETE /api/seasonal-events/{seasonalEvent} */
    public function destroy(SeasonalEvent $seasonalEvent): JsonResponse
    {
        $name = $seasonalEvent->name;
        $seasonalEvent->delete();
        ActivityLog::record('seasonal.delete', "Deleted seasonal event — {$name}", 'calendar', ['event' => $name]);

        return response()->json(['deleted' => true]);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:120'],
            'startDate'     => ['required', 'date'],
            'endDate'       => ['required', 'date', 'after_or_equal:startDate'],
            'adjustmentPct' => ['required', 'numeric', 'between:-100,1000'],
            'scope'         => ['required', Rule::in(['all', 'categories', 'products'])],
            'categories'    => ['exclude_unless:scope,categories', 'required', 'array', 'min:1'],
            'categories.*'  => ['string', 'max:255'],
            'productIds'    => ['exclude_unless:scope,products', 'required', 'array', 'min:1'],
            'productIds.*'  => ['string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'isActive'      => ['sometimes', 'boolean'],
        ]);

        return [
            'name'           => trim($data['name']),
            'start_date'     => $data['startDate'],
            'end_date'       => $data['endDate'],
            'adjustment_pct' => $data['adjustmentPct'],
            'scope'          => $data['scope'],
            'categories'     => $data['scope'] === 'categories' ? array_values(array_unique($data['categories'])) : null,
            'product_ids'    => $data['scope'] === 'products' ? array_values(array_unique($data['productIds'])) : null,
            'is_active'      => $data['isActive'] ?? true,
        ];
    }

    private function format(SeasonalEvent $event, $productNames): array
    {
        $productIds = $event->product_ids ?? [];

        return [
            'id'            => $event->id,
            'name'          => $event->name,
            'startDate'     => $event->start_date->toDateString(),
            'endDate'       => $event->end_date->toDateString(),
            'adjustmentPct' => (float) $event->adjustment_pct,
            'scope'         => $event->scope,
            'categories'    => $event->categories ?? [],
            'productIds'    => $productIds,
            'productNames'  => array_values(array_filter(array_map(fn ($code) => $productNames[$code] ?? null, $productIds))),
            'isActive'      => (bool) $event->is_active,
            'status'        => $event->status(),
        ];
    }
}

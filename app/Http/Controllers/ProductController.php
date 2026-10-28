<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * ProductController — /api/products
 */
class ProductController extends Controller
{
    /** GET /api/products */
    public function index()
    {
        // Without the photos themselves: each product gets a short photo link.
        $products = Product::with(['supplier', 'safetyStock'])
            ->withoutPhoto()
            ->orderBy('name')
            ->get();

        // Annual demand from real history: total units sold (stock out, non-adjustment)
        // in the trailing 12 months, per product — used by Auto Calculator auto-fill.
        $demand = \App\Models\StockMovement::query()
            ->where('movement_type', 'out')
            ->where('is_adjustment', false)
            ->where('movement_date', '>=', now()->subYear()->toDateString())
            ->selectRaw('product_id, SUM(qty) as total')
            ->groupBy('product_id')
            ->pluck('total', 'product_id');

        // Variants (e.g. colors) recorded for each product in Stock Movement.
        $variants = \App\Models\StockMovement::query()
            ->whereNotNull('variant_name')
            ->where('variant_name', '!=', '')
            ->select('product_id', 'variant_name')
            ->distinct()
            ->orderBy('variant_name')
            ->get()
            ->groupBy('product_id')
            ->map(fn ($rows) => $rows->pluck('variant_name')
                ->map(fn ($name) => trim($name))
                ->unique(fn ($name) => mb_strtolower($name))
                ->values()
                ->all());

        // Products with at least one stock entry ("tracked"). Only these can
        // be reorder alerts — the same rule as the Dashboard card and the bell.
        $tracked = array_flip(\App\Models\StockMovement::query()->distinct()->pluck('product_id')->filter()->all());

        return response()->json($products->map(fn ($p) => $this->format(
            $p,
            (int) ($demand[$p->id] ?? 0),
            $variants[$p->id] ?? [],
            isset($tracked[$p->id])
        )));
    }

    /** GET /api/products/{code} */
    public function show(string $code)
    {
        $product = Product::with(['supplier', 'safetyStock'])
            ->withoutPhoto()
            ->where('code', $code)
            ->firstOrFail();

        return response()->json($this->format(
            $product,
            app(\App\Services\ReorderPointService::class)->annualDemand($product)
        ));
    }

    /** POST /api/products */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'            => ['required', 'string', 'max:255'],
            'category'        => ['nullable', 'string', 'max:255'],
            'brand'           => ['nullable', 'string', 'max:255'],
            'model'           => ['nullable', 'string', 'max:255'],
            'unitMeasure'     => ['nullable', 'string', 'max:255'],
            'image'           => ['nullable', 'string', 'max:5000000'],  // data URL or http(s) URL
            'supplierName'    => ['nullable', 'string', 'max:255'],
            'supplierContact' => ['nullable', 'string', 'max:255'],
            'unitCost'        => ['nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'stock'           => ['nullable', 'integer', 'min:0'],   // ← ADDED
            'variants'        => ['nullable', 'array', 'max:50'],
            'variants.*'      => ['nullable', 'string', 'max:100'],
        ]);

        // Block an exact copy of an existing product (checked before a new
        // supplier could be created, so a refused save leaves nothing behind).
        $this->ensureNotDuplicate([
            'name'         => $data['name'],
            'category'     => $data['category'] ?? null,
            'brand'        => $data['brand'] ?? null,
            'model'        => $data['model'] ?? null,
            'unit_measure' => $data['unitMeasure'] ?? null,
            'supplier_id'  => $this->existingSupplierId($data['supplierName'] ?? null),
        ]);

        $supplier = $this->resolveSupplier($data);
        $code = $this->generateCode();

        $product = Product::create([
            'code'          => $code,
            'name'          => $data['name'],
            'category'      => $data['category'] ?? null,
            'brand'         => $data['brand'] ?? null,
            'model'         => $data['model'] ?? null,
            'unit_measure'  => $data['unitMeasure'] ?? null,
            'variants'      => $this->cleanVariants($data['variants'] ?? []),
            // A chosen picture is saved as an image file (see ProductPhotoService).
            'image'         => $this->photos()->prepare($data['image'] ?? null, $code, null),
            'supplier_id'   => $supplier?->id,
            'stock_on_hand' => $data['stock'] ?? 0,                  // ← ADDED
            'unit_cost'     => $data['unitCost'] ?? null,
        ]);

        \App\Models\ActivityLog::record('product.create', "Added product — {$product->name}", 'boxes', ['product' => $product->name]);

        return response()->json($this->format($product->load(['supplier', 'safetyStock'])), 201);
    }

    /** PUT/PATCH /api/products/{code} */
    public function update(Request $request, string $code)
    {
        $product = Product::where('code', $code)->firstOrFail();

        $data = $request->validate([
            'name'            => ['sometimes', 'string', 'max:255'],
            'category'        => ['nullable', 'string', 'max:255'],
            'brand'           => ['nullable', 'string', 'max:255'],
            'model'           => ['nullable', 'string', 'max:255'],
            'unitMeasure'     => ['nullable', 'string', 'max:255'],
            'image'           => ['nullable', 'string', 'max:5000000'],  // data URL or http(s) URL
            'supplierName'    => ['nullable', 'string', 'max:255'],
            'supplierContact' => ['nullable', 'string', 'max:255'],
            'unitCost'        => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999999999.99'],
            'stock'           => ['sometimes', 'integer', 'min:0'],   // opening balance
            'variants'        => ['sometimes', 'nullable', 'array', 'max:50'],
            'variants.*'      => ['nullable', 'string', 'max:100'],
        ]);

        // The values the product will have after this save. A field LEFT OUT
        // keeps its current value; a field SENT EMPTY clears it (so the owner
        // can remove a category, brand, model, unit or supplier). The name
        // can't be cleared.
        $optionalText = [
            'category'     => 'category',
            'brand'        => 'brand',
            'model'        => 'model',
            'unitMeasure'  => 'unit_measure',
        ];
        $after = ['name' => ($data['name'] ?? null) ?: $product->name];
        foreach ($optionalText as $field => $column) {
            $after[$column] = array_key_exists($field, $data)
                ? (trim((string) $data[$field]) === '' ? null : $data[$field])
                : $product->{$column};
        }
        $supplierSent = array_key_exists('supplierName', $data);
        $supplierName = trim((string) ($data['supplierName'] ?? ''));
        $after['supplier_id'] = $supplierSent
            ? ($supplierName === '' ? null : $this->existingSupplierId($supplierName))
            : $product->supplier_id;
        $this->ensureNotDuplicate($after, $product->id);

        $supplier = $this->resolveSupplier($data);

        // Opening stock may only be set while the product has no movements yet.
        // Once a ledger exists, stock_on_hand is governed by StockMovementService
        // so the cached balance can never drift out of sync with the ledger.
        if (array_key_exists('stock', $data)) {
            if ($product->stockMovements()->exists()) {
                throw ValidationException::withMessages([
                    'stock' => 'Opening stock can only be set before the first stock movement is recorded.',
                ]);
            }
            $product->stock_on_hand = $data['stock'];
            $product->save();
        }

        $changes = [
            'name'         => $after['name'],
            'category'     => $after['category'],
            'brand'        => $after['brand'],
            'model'        => $after['model'],
            'unit_measure' => $after['unit_measure'],
        ];
        if ($supplierSent) {
            $changes['supplier_id'] = $supplier?->id;   // empty supplier = no supplier
        }
        if (array_key_exists('unitCost', $data)) {
            $changes['unit_cost'] = $data['unitCost'];
        }
        $product->update($changes);

        // Variants can be set or cleared (empty list), so handle them here too.
        if (array_key_exists('variants', $data)) {
            $product->variants = $this->cleanVariants($data['variants'] ?? []);
            $product->save();
        }

        // Image can be set OR cleared, so handle it outside array_filter (which
        // would drop an intentional empty string / null).
        // The form sends the photo link back unchanged when the photo wasn't touched.
        if (array_key_exists('image', $data)) {
            $previous = $product->image;
            $next = $this->photos()->prepare($data['image'], $product->code, $previous);
            if ($next !== $previous) {
                $product->image = $next;
                $product->save();
                $this->photos()->deleteIfStored($previous);
            }
        }

        return response()->json($this->format($product->fresh()->load(['supplier', 'safetyStock'])));
    }

    /** GET /products/{code}/image — the product's photo (also for deleted products' history). */
    public function image(string $code)
    {
        $product = Product::withTrashed()->where('code', $code)->firstOrFail();

        return $this->photos()->response($product);
    }

    private function photos(): \App\Services\ProductPhotoService
    {
        return app(\App\Services\ProductPhotoService::class);
    }

    /** DELETE /api/products/{code} — moves the product (and its stock entries) to the Trash Bin. */
    public function destroy(Request $request, string $code)
    {
        $product = Product::where('code', $code)->firstOrFail();
        $productName = $product->name;
        $stockOnHand = $product->stock_on_hand;
        $entryCount = app(\App\Services\StockMovementService::class)->trashProduct($product, $request->user());

        \App\Models\ActivityLog::record(
            'product.delete',
            "Moved product to the Trash Bin — {$productName}",
            'boxes',
            ['productId' => $code, 'product' => $productName, 'stockOnHand' => $stockOnHand, 'trashedEntries' => $entryCount]
        );

        return response()->json(['deleted' => true, 'trashed' => true, 'trashedEntries' => $entryCount]);
    }

    /**
     * Trim, drop blanks and remove case-insensitive duplicates, keeping the
     * owner's order. Returns null when the list is empty.
     *
     * @param  array<int, mixed>  $variants
     */
    private function cleanVariants(array $variants): ?array
    {
        $clean = [];
        $seen = [];
        foreach ($variants as $variant) {
            $name = trim((string) $variant);
            $key = mb_strtolower($name);
            if ($name === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $clean[] = $name;
        }

        return $clean ?: null;
    }

    /**
     * Refuse the save when another product matches on ALL of: name, category,
     * brand, model, unit measure and supplier. Text is compared ignoring
     * upper/lower case and extra spaces at the ends; empty counts as blank.
     * If even one of these differs, the product is allowed.
     *
     * A supplier id of 0 means "a supplier that doesn't exist yet", which can
     * never match an existing product.
     *
     * @param  array{name: ?string, category: ?string, brand: ?string, model: ?string, unit_measure: ?string, supplier_id: ?int}  $values
     */
    public function ensureNotDuplicate(array $values, ?int $ignoreProductId = null): void
    {
        $query = Product::query();

        foreach (['name', 'category', 'brand', 'model', 'unit_measure'] as $column) {
            $value = mb_strtolower(trim((string) ($values[$column] ?? '')));
            $query->whereRaw("LOWER(TRIM(COALESCE({$column}, ''))) = ?", [$value]);
        }

        $supplierId = $values['supplier_id'] ?? null;
        $supplierId === null
            ? $query->whereNull('supplier_id')
            : $query->where('supplier_id', $supplierId);

        if ($ignoreProductId !== null) {
            $query->where('id', '!=', $ignoreProductId);
        }

        $existingCode = $query->value('code');
        if ($existingCode) {
            throw ValidationException::withMessages([
                'name' => "This product already exists ({$existingCode}).",
            ]);
        }
    }

    /** Id of the supplier with this name, 0 if it doesn't exist yet, null if no name. */
    private function existingSupplierId(?string $name): ?int
    {
        if (! $name) {
            return null;
        }

        return (int) (Supplier::withTrashed()->where('name', $name)->value('id') ?? 0);
    }

    private function resolveSupplier(array $data): ?Supplier
    {
        $name = $data['supplierName'] ?? null;
        if (! $name) {
            return null;
        }

        // Typing the name of a supplier that is in the Trash Bin brings it
        // back instead of failing on the duplicate name.
        $trashed = Supplier::onlyTrashed()->where('name', $name)->first();
        if ($trashed) {
            $trashed->restore();
            $trashed->forceFill(['deleted_by' => null, 'deleted_by_name' => null])->save();
            \App\Models\ActivityLog::record('trash.restore', "Restored supplier from the Trash Bin (used on a product) — {$name}", 'users', ['supplier' => $name]);

            return $trashed;
        }

        return Supplier::firstOrCreate(
            ['name' => $name],
            ['contact' => $data['supplierContact'] ?? null, 'company' => $name]
        );
    }

    private function generateCode(): string
    {
        do {
            $code = 'PRD-'.random_int(1000, 9999);
        } while (Product::withTrashed()->where('code', $code)->exists());

        return $code;
    }

    private function format(Product $p, int $demandFromHistory = 0, ?array $variants = null, ?bool $inStockControl = null): array
    {
        $inStockControl ??= \App\Models\StockMovement::where('product_id', $p->id)->exists();
        // $variants here = names already typed on stock movements (older data).
        $variants ??= \App\Models\StockMovement::query()
            ->where('product_id', $p->id)
            ->whereNotNull('variant_name')
            ->where('variant_name', '!=', '')
            ->orderBy('variant_name')
            ->pluck('variant_name')
            ->map(fn ($name) => trim($name))
            ->unique(fn ($name) => mb_strtolower($name))
            ->values()
            ->all();
        $defined = array_values($p->variants ?? []);

        return [
            'id'              => $p->code,
            'sku'             => $p->code,
            'name'            => $p->name,
            'category'        => $p->category,
            'brand'           => $p->brand,
            'model'           => $p->model,
            'unitMeasure'     => $p->unit_measure,
            'unitCost'        => $p->unit_cost,
            'image'           => $this->photos()->url($p),   // a short link, not the photo itself
            // definedVariants: the product's own list (edited in the product modal;
            // Stock Control picks from it). recordedVariants: names found on
            // existing stock movements. variants: both, for the table/search.
            'definedVariants'  => $defined,
            'recordedVariants' => $variants,
            'variants'        => $this->mergeVariants($defined, $variants),
            'stock'           => $p->stock_on_hand,
            'supplierId'      => $p->supplier_id,
            'supplierName'    => $p->supplier?->name,
            'supplierContact' => $p->supplier?->contact,
            'company'         => $p->supplier?->company,
            'supplierInfo'    => $p->supplier?->name,
            'safetyStock'     => $p->safetyStock?->safety_stock ?? \App\Services\ReorderPointService::DEFAULT_SAFETY_STOCK,
            // Annual demand = real sales (trailing 12 months); the old typed
            // policy value is no longer used.
            'annualDemand'    => $demandFromHistory ?: null,
            // Product policy lead time first, then the supplier's lead time.
            'leadTimeDays'    => $p->safetyStock?->lead_time_days ?? $p->supplier?->lead_time_days,
            'supplierLeadTimeDays' => $p->supplier?->lead_time_days,
            'orderingCost'    => auth()->user()?->isAdminOrAbove() ? $p->safetyStock?->ordering_cost : null,
            'holdingCost'     => auth()->user()?->isAdminOrAbove() ? $p->safetyStock?->holding_cost : null,
            // Units sold (stock out) in the trailing 12 months — real demand.
            'demandFromHistory' => $demandFromHistory,
            // True once the product has a stock entry (see index()).
            'inStockControl'  => $inStockControl,
        ];
    }

    /** Defined variants first, then any recorded ones not already listed. */
    private function mergeVariants(array $defined, array $recorded): array
    {
        $seen = array_flip(array_map('mb_strtolower', $defined));
        foreach ($recorded as $name) {
            if (! isset($seen[mb_strtolower($name)])) {
                $defined[] = $name;
                $seen[mb_strtolower($name)] = true;
            }
        }

        return $defined;
    }
}

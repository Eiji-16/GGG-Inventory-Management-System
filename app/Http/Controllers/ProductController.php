<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * ProductController — /api/products
 */
class ProductController extends Controller
{
    /** GET /api/products */
    public function index()
    {
        $products = Product::with(['supplier', 'safetyStock'])
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

        return response()->json($products->map(fn ($p) => $this->format($p, (int) ($demand[$p->id] ?? 0))));
    }

    /** GET /api/products/{code} */
    public function show(string $code)
    {
        $product = Product::with(['supplier', 'safetyStock'])
            ->where('code', $code)
            ->firstOrFail();

        return response()->json($this->format($product));
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
            'stock'           => ['nullable', 'integer', 'min:0'],   // ← ADDED
        ]);

        $supplier = $this->resolveSupplier($data);

        $product = Product::create([
            'code'          => $this->generateCode(),
            'name'          => $data['name'],
            'category'      => $data['category'] ?? null,
            'brand'         => $data['brand'] ?? null,
            'model'         => $data['model'] ?? null,
            'unit_measure'  => $data['unitMeasure'] ?? null,
            'image'         => $this->sanitizeImage($data['image'] ?? null),
            'supplier_id'   => $supplier?->id,
            'stock_on_hand' => $data['stock'] ?? 0,                  // ← ADDED
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
            'stock'           => ['sometimes', 'integer', 'min:0'],   // opening balance
        ]);

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

        $product->update(array_filter([
            'name'         => $data['name'] ?? null,
            'category'     => $data['category'] ?? null,
            'brand'        => $data['brand'] ?? null,
            'model'        => $data['model'] ?? null,
            'unit_measure' => $data['unitMeasure'] ?? null,
            'supplier_id'  => $supplier?->id,
        ], fn ($v) => $v !== null));

        // Image can be set OR cleared, so handle it outside array_filter (which
        // would drop an intentional empty string / null).
        if (array_key_exists('image', $data)) {
            $product->image = $this->sanitizeImage($data['image']);
            $product->save();
        }

        return response()->json($this->format($product->fresh()->load(['supplier', 'safetyStock'])));
    }

    /** DELETE /api/products/{code} */
    public function destroy(string $code)
    {
        Product::where('code', $code)->firstOrFail()->delete();

        return response()->json(['deleted' => true]);
    }

    private function resolveSupplier(array $data): ?Supplier
    {
        $name = $data['supplierName'] ?? null;
        if (! $name) {
            return null;
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
        } while (Product::where('code', $code)->exists());

        return $code;
    }

    /**
     * Accept only a safe image reference: an http(s) URL or a base64 image data
     * URL. Anything else (e.g. javascript:) is rejected to null.
     */
    private function sanitizeImage(?string $image): ?string
    {
        $image = $image !== null ? trim($image) : null;
        if ($image === null || $image === '') {
            return null;
        }
        if (preg_match('#^https?://#i', $image) || preg_match('#^data:image/[a-z0-9.+-]+;base64,#i', $image)) {
            return $image;
        }

        return null;
    }

    private function format(Product $p, int $demandFromHistory = 0): array
    {
        return [
            'id'              => $p->code,
            'name'            => $p->name,
            'category'        => $p->category,
            'brand'           => $p->brand,
            'model'           => $p->model,
            'unitMeasure'     => $p->unit_measure,
            'image'           => $p->image,
            'stock'           => $p->stock_on_hand,
            'supplierName'    => $p->supplier?->name,
            'supplierContact' => $p->supplier?->contact,
            'company'         => $p->supplier?->company,
            'supplierInfo'    => $p->supplier?->name,
            'safetyStock'     => $p->safetyStock?->safety_stock,
            'annualDemand'    => $p->safetyStock?->annual_demand,
            // Units sold (stock out) in the trailing 12 months — real demand.
            'demandFromHistory' => $demandFromHistory,
        ];
    }
}
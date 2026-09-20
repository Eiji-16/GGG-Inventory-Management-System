<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * ProductController — /api/products
 *
 * Returns products in the SAME shape the frontend already consumes
 * (public/productSupplier.json): id = product.code, plus the flat supplier
 * fields (supplierName/supplierContact/company/supplierInfo) reconstructed from
 * the related supplier. safetyStock/annualDemand are joined from safety_stock so
 * the Auto Calculator can auto-fill demand.
 */
class ProductController extends Controller
{
    /** GET /api/products */
    public function index()
    {
        $products = Product::with(['supplier', 'safetyStock'])
            ->orderBy('name')
            ->get();

        return response()->json($products->map(fn ($p) => $this->format($p)));
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
            'supplierName'    => ['nullable', 'string', 'max:255'],
            'supplierContact' => ['nullable', 'string', 'max:255'],
        ]);

        $supplier = $this->resolveSupplier($data);

        $product = Product::create([
            'code'         => $this->generateCode(),
            'name'         => $data['name'],
            'category'     => $data['category'] ?? null,
            'brand'        => $data['brand'] ?? null,
            'model'        => $data['model'] ?? null,
            'unit_measure' => $data['unitMeasure'] ?? null,
            'supplier_id'  => $supplier?->id,
        ]);

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
            'supplierName'    => ['nullable', 'string', 'max:255'],
            'supplierContact' => ['nullable', 'string', 'max:255'],
        ]);

        $supplier = $this->resolveSupplier($data);

        $product->update(array_filter([
            'name'         => $data['name'] ?? null,
            'category'     => $data['category'] ?? null,
            'brand'        => $data['brand'] ?? null,
            'model'        => $data['model'] ?? null,
            'unit_measure' => $data['unitMeasure'] ?? null,
            'supplier_id'  => $supplier?->id,
        ], fn ($v) => $v !== null));

        return response()->json($this->format($product->fresh()->load(['supplier', 'safetyStock'])));
    }

    /** DELETE /api/products/{code} */
    public function destroy(string $code)
    {
        Product::where('code', $code)->firstOrFail()->delete();

        return response()->json(['deleted' => true]);
    }

    /**
     * Find or create a supplier from the incoming flat fields so the frontend
     * can keep sending supplierName/supplierContact without knowing about ids.
     */
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

    /** Generate a unique "PRD-XXXX" code. */
    private function generateCode(): string
    {
        do {
            $code = 'PRD-'.random_int(1000, 9999);
        } while (Product::where('code', $code)->exists());

        return $code;
    }

    /** Shape a Product into the JSON the frontend expects. */
    private function format(Product $p): array
    {
        return [
            'id'              => $p->code,
            'name'            => $p->name,
            'category'        => $p->category,
            'brand'           => $p->brand,
            'model'           => $p->model,
            'unitMeasure'     => $p->unit_measure,
            'stock'           => $p->stock_on_hand,
            'supplierName'    => $p->supplier?->name,
            'supplierContact' => $p->supplier?->contact,
            'company'         => $p->supplier?->company,
            'supplierInfo'    => $p->supplier?->name,
            'safetyStock'     => $p->safetyStock?->safety_stock,
            'annualDemand'    => $p->safetyStock?->annual_demand,
        ];
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use Illuminate\Http\Request;

/**
 * SupplierController — /api/suppliers
 *
 * Lets the Product & Supplier tab list, add, edit, and remove suppliers on
 * their own. Products reference a supplier by id; deleting a supplier is
 * allowed and just detaches it from its products (the products migration uses
 * nullOnDelete), so no product rows are lost.
 */
class SupplierController extends Controller
{
    /** GET /api/suppliers */
    public function index()
    {
        $suppliers = Supplier::orderBy('name')->get();

        return response()->json($suppliers->map(fn ($s) => $this->format($s)));
    }

    /** GET /api/suppliers/{supplier} */
    public function show(Supplier $supplier)
    {
        return response()->json($this->format($supplier));
    }

    /** POST /api/suppliers */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name'    => ['required', 'string', 'max:255', 'unique:suppliers,name'],
            'contact' => ['nullable', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
        ]);

        $supplier = Supplier::create([
            'name'    => $data['name'],
            'contact' => $data['contact'] ?? null,
            'company' => $data['company'] ?? $data['name'],
        ]);

        return response()->json($this->format($supplier), 201);
    }

    /** PUT/PATCH /api/suppliers/{supplier} */
    public function update(Request $request, Supplier $supplier)
    {
        $data = $request->validate([
            'name'    => ['sometimes', 'string', 'max:255', 'unique:suppliers,name,'.$supplier->id],
            'contact' => ['nullable', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
        ]);

        $supplier->update(array_filter([
            'name'    => $data['name'] ?? null,
            'contact' => $data['contact'] ?? null,
            'company' => $data['company'] ?? null,
        ], fn ($v) => $v !== null));

        return response()->json($this->format($supplier->fresh()));
    }

    /** DELETE /api/suppliers/{supplier} */
    public function destroy(Supplier $supplier)
    {
        $supplier->delete();

        return response()->json(['deleted' => true]);
    }

    /** Shape a Supplier for the frontend. */
    private function format(Supplier $s): array
    {
        return [
            'id'           => $s->id,
            'name'         => $s->name,
            'contact'      => $s->contact,
            'company'      => $s->company,
            'productCount' => $s->products()->count(),
        ];
    }
}

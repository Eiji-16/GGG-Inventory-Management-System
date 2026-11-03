<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\RestockRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Restock requests (Staff "Notify" in Reorder Alerts).
 *
 * GET  /api/restock-requests           open requests (bell + Reorder Alerts)
 * POST /api/restock-requests           send one: productId + optional note
 * PUT  /api/restock-requests/{id}/done close it
 *
 * Who can do what is set in Role Access ("Send restock requests" and
 * "See and close restock requests"); the routes check those boxes.
 */
class RestockRequestController extends Controller
{
    public function index(): JsonResponse
    {
        $requests = RestockRequest::with(['product:id,code,name,stock_on_hand,deleted_at', 'requester:id,name'])
            ->where('status', RestockRequest::STATUS_OPEN)
            ->latest()
            ->limit(100)
            ->get()
            ->filter(fn (RestockRequest $r) => $r->product && ! $r->product->trashed())
            ->values();

        return response()->json($requests->map(fn (RestockRequest $r) => $this->format($r)))
            ->header('Cache-Control', 'no-store');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId' => ['required', 'string', Rule::exists('products', 'code')->whereNull('deleted_at')],
            'note'      => ['nullable', 'string', 'max:255'],
        ]);
        $product = Product::where('code', $data['productId'])->firstOrFail();
        $note = trim((string) ($data['note'] ?? '')) ?: null;

        // One open request per product: a second Notify just updates the note,
        // so Admins don't get the same alert twice.
        $existing = RestockRequest::where('product_id', $product->id)
            ->where('status', RestockRequest::STATUS_OPEN)
            ->first();
        if ($existing) {
            if ($note !== null && $note !== $existing->note) {
                $existing->update(['note' => $note]);
            }

            return response()->json($this->format($existing->fresh(['product', 'requester'])) + ['alreadyOpen' => true]);
        }

        $restock = RestockRequest::create([
            'product_id'   => $product->id,
            'requested_by' => $request->user()->id,
            'note'         => $note,
            'status'       => RestockRequest::STATUS_OPEN,
        ]);
        ActivityLog::record('restock.request', "Asked to restock {$product->name}".($note ? " — {$note}" : ''), 'boxes', [
            'productId' => $product->code,
            'product'   => $product->name,
            'note'      => $note,
        ]);

        $emailed = $this->emailAdmins($product, $request->user(), $note);

        return response()->json($this->format($restock->load(['product', 'requester'])) + ['emailed' => $emailed], 201);
    }

    public function done(Request $request, RestockRequest $restockRequest): JsonResponse
    {
        if ($restockRequest->status === RestockRequest::STATUS_OPEN) {
            $restockRequest->update([
                'status'      => RestockRequest::STATUS_DONE,
                'resolved_by' => $request->user()->id,
                'resolved_at' => now(),
            ]);
            $name = $restockRequest->product?->name ?? 'a product';
            ActivityLog::record('restock.done', "Closed the restock request for {$name}", 'boxes', [
                'productId' => $restockRequest->product?->code,
                'product'   => $name,
            ]);
        }

        return response()->json($this->format($restockRequest->fresh(['product', 'requester'])));
    }

    /**
     * Email every active Admin and Super Admin about a new request (the bell
     * shows it too). A mail problem never blocks the request itself; it is
     * written to the log instead. Returns how many emails were sent.
     */
    private function emailAdmins(Product $product, ?\App\Models\User $requester, ?string $note): int
    {
        $admins = \App\Models\User::query()
            ->whereIn('role', [\App\Models\User::ROLE_ADMIN, \App\Models\User::ROLE_SUPER_ADMIN])
            ->where('status', \App\Models\User::STATUS_ACTIVE)
            ->when($requester, fn ($query) => $query->whereKeyNot($requester->id))
            ->pluck('email')
            ->filter()
            ->unique();

        $sent = 0;
        foreach ($admins as $email) {
            try {
                \Illuminate\Support\Facades\Mail::to($email)->send(new \App\Mail\RestockRequestMail(
                    $product->name,
                    $product->code,
                    $product->stock_on_hand !== null ? (int) $product->stock_on_hand : null,
                    $requester?->name ?: 'A staff member',
                    $note,
                ));
                $sent++;
            } catch (\Throwable $exception) {
                \Illuminate\Support\Facades\Log::warning('Restock request email could not be sent to an Admin. Check the MAIL_* settings in .env.', [
                    'exception' => $exception->getMessage(),
                ]);
            }
        }

        return $sent;
    }

    private function format(RestockRequest $r): array
    {
        return [
            'id'          => $r->id,
            'productId'   => $r->product?->code,
            'productName' => $r->product?->name,
            'stock'       => $r->product?->stock_on_hand,
            'note'        => $r->note,
            'requestedBy' => $r->requester?->name ?? 'A staff member',
            'status'      => $r->status,
            'createdAt'   => $r->created_at?->toIso8601String(),
        ];
    }
}

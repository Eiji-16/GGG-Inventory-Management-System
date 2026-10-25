<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Product photos are kept as image files instead of inside the database.
 *
 * products.image holds one of:
 *   "stored:product-photos/PRD-1234-ab12….png"  a file on the private "local" disk (new)
 *   "data:image/png;base64,…"                     an older photo saved inside the database
 *   "https://…"                                   a picture link the owner pasted
 *
 * Product lists send only a short link (GET /products/{code}/image?v=…) for
 * the first two, so a list no longer carries every photo. Older photos keep
 * working as they are; `php artisan inventory:move-photos` can move them
 * into files (preview first).
 */
class ProductPhotoService
{
    public const PREFIX = 'stored:';

    private const DISK = 'local';
    private const FOLDER = 'product-photos';
    private const TYPES = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/jpg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'];

    /**
     * What to save in products.image for what the product form sent.
     * The form sends back the photo link unchanged when the photo wasn't
     * touched, a data URL for a newly chosen picture, a pasted http(s) link,
     * or nothing to remove the photo.
     */
    public function prepare(?string $sent, string $productCode, ?string $current): ?string
    {
        $sent = $sent === null ? null : trim($sent);
        if ($sent === null || $sent === '') {
            return null;
        }
        if ($this->isOwnLink($sent, $productCode)) {
            return $current;   // photo not changed
        }
        if (preg_match('#^https?://#i', $sent)) {
            return $sent;
        }
        if (preg_match('#^data:(image/[a-z0-9.+-]+);base64,#i', $sent, $match)) {
            $path = $this->storeDataUrl($sent, strtolower($match[1]), $productCode);

            return self::PREFIX.$path;
        }

        return null;   // anything else (e.g. "javascript:") is never saved
    }

    /** Remove a photo file that is no longer used (only files this system stored). */
    public function deleteIfStored(?string $value): void
    {
        if ($value !== null && str_starts_with($value, self::PREFIX)) {
            Storage::disk(self::DISK)->delete(substr($value, strlen(self::PREFIX)));
        }
    }

    /**
     * The link a screen uses to show the photo, or null for none.
     * Works with a full product row or a list row read with
     * Product::withoutPhoto() (which gives "image_ref" instead of the photo).
     */
    public function url(Product $product): ?string
    {
        $value = array_key_exists('image_ref', $product->getAttributes())
            ? $product->getAttribute('image_ref')
            : $product->image;
        if ($value === null || $value === '') {
            return null;
        }
        if (preg_match('#^https?://#i', $value)) {
            return $value;
        }
        // ?v= changes when the photo changes, so browsers don't show an old one.
        $version = str_starts_with($value, self::PREFIX)
            ? substr(md5($value), 0, 10)
            : (string) ($product->updated_at?->getTimestamp() ?? 0);

        return '/products/'.rawurlencode($product->code).'/image?v='.$version;
    }

    /** The photo itself, for GET /products/{code}/image. */
    public function response(Product $product): Response
    {
        $value = (string) $product->image;
        $headers = [
            'Cache-Control' => 'private, max-age=31536000',
            'X-Content-Type-Options' => 'nosniff',
            // A picture never runs scripts, even an old SVG.
            'Content-Security-Policy' => "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        ];

        if (str_starts_with($value, self::PREFIX)) {
            $path = substr($value, strlen(self::PREFIX));
            abort_unless(Storage::disk(self::DISK)->exists($path), 404);

            return Storage::disk(self::DISK)->response($path, null, $headers);
        }

        if (preg_match('#^data:(image/[a-z0-9.+-]+);base64,(.*)$#is', $value, $match)) {
            $bytes = base64_decode($match[2], true);
            abort_if($bytes === false, 404);

            return response($bytes, 200, $headers + ['Content-Type' => strtolower($match[1])]);
        }

        abort(404);
    }

    /** Save an older in-database photo as a file (used by inventory:move-photos). */
    public function moveToFile(Product $product): ?string
    {
        $value = (string) $product->image;
        if (! preg_match('#^data:(image/[a-z0-9.+-]+);base64,#i', $value, $match)) {
            return null;
        }

        return self::PREFIX.$this->storeDataUrl($value, strtolower($match[1]), $product->code);
    }

    private function storeDataUrl(string $dataUrl, string $type, string $productCode): string
    {
        $bytes = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
        if (! isset(self::TYPES[$type]) || $bytes === false || @getimagesizefromstring($bytes) === false) {
            throw ValidationException::withMessages([
                'image' => 'Please choose a JPG, PNG, WEBP or GIF picture.',
            ]);
        }

        $safeCode = preg_replace('/[^A-Za-z0-9_-]/', '', $productCode) ?: 'product';
        $path = self::FOLDER.'/'.$safeCode.'-'.Str::lower(Str::random(12)).'.'.self::TYPES[$type];
        Storage::disk(self::DISK)->put($path, $bytes);

        return $path;
    }

    private function isOwnLink(string $sent, string $productCode): bool
    {
        $path = parse_url($sent, PHP_URL_PATH) ?: '';

        return $path === '/products/'.rawurlencode($productCode).'/image'
            && ! preg_match('#^https?://#i', $sent);
    }
}

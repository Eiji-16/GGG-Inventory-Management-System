<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Services\ProductPhotoService;
use Illuminate\Console\Command;
use Illuminate\Validation\ValidationException;

/**
 * php artisan inventory:move-photos           → preview only (changes nothing)
 * php artisan inventory:move-photos --apply   → move the photos into files
 *
 * Older product photos were saved inside the database. New ones are saved as
 * image files (storage/app/private/product-photos). This copies each older
 * photo into a file and then points the product at that file. A photo that
 * can't be read as a JPG, PNG, WEBP or GIF is left exactly as it is.
 * Old photos keep working without this; it only makes the database smaller.
 * Back up the database first.
 */
class MoveProductPhotos extends Command
{
    protected $signature = 'inventory:move-photos {--apply : Actually move the photos (otherwise only a preview)}';

    protected $description = 'Move product photos saved inside the database into image files (preview unless --apply)';

    public function handle(ProductPhotoService $photos): int
    {
        $apply = (bool) $this->option('apply');
        $this->info($apply ? 'Moving product photos into files…' : 'PREVIEW — nothing will be changed. Add --apply to move them.');

        $ids = Product::withTrashed()->where('image', 'like', 'data:%')->pluck('id');
        if ($ids->isEmpty()) {
            $this->info('Nothing to move — no photos are saved inside the database.');

            return self::SUCCESS;
        }

        $moved = 0;
        $skipped = 0;
        foreach ($ids as $id) {
            // One product at a time, so large photos don't all sit in memory together.
            $product = Product::withTrashed()->find($id);
            $sizeKb = (int) ceil(strlen((string) $product->image) / 1024);
            if (! $apply) {
                $this->line("  {$product->code}  {$product->name}  ({$sizeKb} KB)");
                $moved++;
                continue;
            }

            try {
                $stored = $photos->moveToFile($product);
            } catch (ValidationException) {
                $stored = null;
            }
            if ($stored === null) {
                $this->warn("  Skipped {$product->code} {$product->name}: not a JPG, PNG, WEBP or GIF picture (left as it is).");
                $skipped++;
                continue;
            }

            // saveQuietly + keep updated_at: moving a photo isn't an edit of the product.
            $product->timestamps = false;
            $product->image = $stored;
            $product->saveQuietly();
            $moved++;
        }

        $this->info($apply
            ? "Done: moved {$moved} photo(s)".($skipped ? ", skipped {$skipped}" : '').'.'
            : "{$moved} photo(s) would be moved. Run again with --apply to move them.");

        return self::SUCCESS;
    }
}

<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Whole-system backup (export / import) and System Reset.
 * Used only by SystemDataController, which is Super Admin only.
 *
 * BACKUP FILE (.gggbackup = gzip-compressed JSON):
 *   {
 *     "format":   "ggg-inventory-backup",
 *     "version":  1,
 *     "meta":     { createdAt, createdBy, appName, tables: {name: rowCount}, files: count },
 *     "checksum": sha256 of "payload" (exact text),
 *     "payload":  JSON text: { tables: { name: { columns: [...], rows: [[...], ...] } },
 *                             files:  { "product-photos/x.png": base64, ... } }
 *   }
 * The payload is kept as text so the checksum is checked on exactly the
 * same characters that were saved: one changed or missing character and the
 * import refuses the file.
 *
 * Never exported, imported or reset: login sessions, cache, queue jobs,
 * password-reset codes and the migrations list (they belong to the running
 * server, not to the shop's data).
 */
class SystemDataService
{
    public const FORMAT = 'ggg-inventory-backup';
    public const VERSION = 1;

    private const DISK = 'local';

    /** Data tables, parents first (insert in this order, delete in reverse). */
    private const TABLES = [
        'users',
        'suppliers',
        'products',
        'safety_stock',
        'stock_movements',
        'sales_history',
        'past_sales',
        'sales_seasonal_adjustments',
        'seasonal_events',
        'custom_formulas',
        'restock_requests',
        'activity_logs',
        'app_settings',
    ];

    /** Folders on the private disk whose files belong to the data (photos, logo). */
    private const FILE_FOLDERS = ['product-photos', 'avatars', 'branding'];

    /**
     * What System Reset can erase, in plain words for the screen.
     * Products & suppliers also erase everything linked to products, so the
     * stock and sales groups are always included with it.
     */
    public const RESET_GROUPS = [
        'stock' => [
            'label' => 'Stock records',
            'description' => 'Every Stock In / Stock Out / Correction entry, saved monthly sales and restock requests. Every product goes back to 0 stock.',
            'tables' => ['stock_movements', 'sales_history', 'restock_requests'],
        ],
        'sales' => [
            'label' => 'Past Sales and seasonal events',
            'description' => 'Past Sales history used by forecasting, seasonal adjustments and seasonal events.',
            'tables' => ['past_sales', 'sales_seasonal_adjustments', 'seasonal_events'],
        ],
        'history' => [
            'label' => 'Reports and activity history',
            'description' => 'Activity history and saved calculator results shown in Reports.',
            'tables' => ['activity_logs'],
        ],
        'catalog' => [
            'label' => 'Products and suppliers',
            'description' => 'All products (including the Trash Bin), their photos and policies, and all suppliers. Also erases stock records and Past Sales.',
            'tables' => ['products', 'safety_stock', 'suppliers'],
        ],
        'accounts' => [
            'label' => 'Admin and Staff accounts',
            'description' => 'Every Admin and Staff account and their profile photos. Super Admin accounts are always kept.',
            'tables' => [],
        ],
    ];

    /** Tables that exist in this database (a backup only ever touches these). */
    public function tables(): array
    {
        return array_values(array_filter(self::TABLES, fn (string $table) => Schema::hasTable($table)));
    }

    /** Row counts for the Settings screen, so the Super Admin sees what is at stake. */
    public function overview(): array
    {
        $counts = [];
        foreach ($this->tables() as $table) {
            $counts[$table] = DB::table($table)->count();
        }

        $groups = [];
        foreach (self::RESET_GROUPS as $key => $group) {
            $rows = $key === 'accounts'
                ? (Schema::hasTable('users') ? DB::table('users')->where('role', '!=', User::ROLE_SUPER_ADMIN)->count() : 0)
                : array_sum(array_map(fn ($table) => $counts[$table] ?? 0, $group['tables']));
            $groups[] = ['key' => $key, 'label' => $group['label'], 'description' => $group['description'], 'rows' => $rows];
        }

        return [
            'tables' => $counts,
            'groups' => $groups,
            'uploadLimitBytes' => $this->uploadLimitBytes(),
        ];
    }

    /* ======================================================================
       EXPORT
       ====================================================================== */

    /** Build the backup file contents (gzip-compressed text). */
    public function export(User $by): string
    {
        $tables = [];
        $rowCounts = [];
        foreach ($this->tables() as $table) {
            $columns = Schema::getColumnListing($table);
            $rows = [];
            // Read in pages so a large ledger doesn't need one huge query.
            $query = DB::table($table)->select($columns);
            $orderColumn = in_array('id', $columns, true) ? 'id' : $columns[0];
            $query->orderBy($orderColumn)->chunk(500, function ($chunk) use (&$rows, $columns): void {
                foreach ($chunk as $row) {
                    $row = (array) $row;
                    $rows[] = array_map(fn (string $column) => $row[$column], $columns);
                }
            });
            $tables[$table] = ['columns' => $columns, 'rows' => $rows];
            $rowCounts[$table] = count($rows);
        }

        $files = [];
        foreach ($this->referencedFiles($tables) as $path) {
            $disk = Storage::disk(self::DISK);
            if ($disk->exists($path)) {
                $files[$path] = base64_encode($disk->get($path));
            }
        }

        $payload = json_encode(['tables' => $tables, 'files' => $files], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

        $document = json_encode([
            'format' => self::FORMAT,
            'version' => self::VERSION,
            'meta' => [
                'createdAt' => now()->toIso8601String(),
                'createdBy' => ['name' => $by->name, 'email' => $by->email],
                'appName' => config('app.name'),
                'tables' => $rowCounts,
                'files' => count($files),
            ],
            'checksum' => hash('sha256', $payload),
            'payload' => $payload,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

        return gzencode($document, 6);
    }

    /* ======================================================================
       IMPORT
       ====================================================================== */

    /**
     * Read and fully check a backup WITHOUT changing anything.
     * Throws RuntimeException with a plain message when the file can't be used.
     *
     * @return array{meta: array, tables: array, files: array}
     */
    public function readBackup(string $contents): array
    {
        // Accept the compressed file (normal) or plain JSON text.
        if (str_starts_with($contents, "\x1f\x8b")) {
            $decoded = @gzdecode($contents);
            if ($decoded === false) {
                throw new RuntimeException('The backup file is damaged (it could not be uncompressed).');
            }
            $contents = $decoded;
        }

        $document = json_decode($contents, true);
        if (! is_array($document) || ($document['format'] ?? null) !== self::FORMAT) {
            throw new RuntimeException('This is not a GGG Inventory backup file.');
        }
        if ((int) ($document['version'] ?? 0) !== self::VERSION) {
            throw new RuntimeException('This backup was made by a different version of the system and cannot be imported here.');
        }
        $payloadText = $document['payload'] ?? null;
        if (! is_string($payloadText) || ! is_string($document['checksum'] ?? null)
            || ! hash_equals($document['checksum'], hash('sha256', $payloadText))) {
            throw new RuntimeException('The backup file was changed or damaged after it was exported (its checksum does not match). Nothing was imported.');
        }

        $payload = json_decode($payloadText, true);
        if (! is_array($payload) || ! is_array($payload['tables'] ?? null)) {
            throw new RuntimeException('The backup file is damaged (its data could not be read).');
        }

        $current = $this->tables();
        foreach ($payload['tables'] as $table => $data) {
            if (! in_array($table, $current, true)) {
                throw new RuntimeException("The backup has a table this system doesn't know (\"{$table}\"). Nothing was imported.");
            }
            $columns = $data['columns'] ?? null;
            if (! is_array($columns) || ! is_array($data['rows'] ?? null)) {
                throw new RuntimeException("The backup's \"{$table}\" table is damaged. Nothing was imported.");
            }
            $unknown = array_diff($columns, Schema::getColumnListing($table));
            if ($unknown) {
                throw new RuntimeException("The backup's \"{$table}\" table has columns this database doesn't have (".implode(', ', $unknown).'). Run "php artisan migrate" first, then try again.');
            }
            foreach ($data['rows'] as $row) {
                if (! is_array($row) || count($row) !== count($columns)) {
                    throw new RuntimeException("The backup's \"{$table}\" table is damaged. Nothing was imported.");
                }
            }
        }

        // There must be a Super Admin who can log in afterwards.
        $users = $payload['tables']['users'] ?? null;
        $hasOwner = false;
        if ($users) {
            $roleAt = array_search('role', $users['columns'], true);
            $statusAt = array_search('status', $users['columns'], true);
            foreach ($users['rows'] as $row) {
                if ($roleAt !== false && $row[$roleAt] === User::ROLE_SUPER_ADMIN
                    && ($statusAt === false || $row[$statusAt] === User::STATUS_ACTIVE)) {
                    $hasOwner = true;
                    break;
                }
            }
        }
        if (! $hasOwner) {
            throw new RuntimeException('The backup has no active Super Admin account, so nobody could log in after importing it. Nothing was imported.');
        }

        $files = is_array($payload['files'] ?? null) ? $payload['files'] : [];
        foreach ($files as $path => $base64) {
            if (! $this->isSafeFilePath((string) $path) || ! is_string($base64) || base64_decode($base64, true) === false) {
                throw new RuntimeException('The backup has a file that is not allowed. Nothing was imported.');
            }
        }

        return ['meta' => $document['meta'] ?? [], 'tables' => $payload['tables'], 'files' => $files];
    }

    /** Replace ALL data with the backup's data, in one database transaction. */
    public function import(array $backup): void
    {
        $tables = $this->tables();

        Schema::disableForeignKeyConstraints();
        try {
            DB::transaction(function () use ($tables, $backup): void {
                foreach (array_reverse($tables) as $table) {
                    DB::table($table)->delete();
                }
                foreach ($tables as $table) {
                    $data = $backup['tables'][$table] ?? null;
                    if (! $data || ! $data['rows']) {
                        continue;
                    }
                    foreach (array_chunk($data['rows'], 200) as $chunk) {
                        DB::table($table)->insert(array_map(
                            fn (array $row) => array_combine($data['columns'], $row),
                            $chunk
                        ));
                    }
                }
            });
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        // Photos and the logo: written after the data is safely in.
        $disk = Storage::disk(self::DISK);
        foreach ($backup['files'] as $path => $base64) {
            $disk->put($path, base64_decode($base64, true));
        }
    }

    /* ======================================================================
       RESET
       ====================================================================== */

    /** Normalise the chosen groups (catalog always includes stock + sales). */
    public function resolveGroups(array $groups): array
    {
        $groups = array_values(array_intersect(array_keys(self::RESET_GROUPS), $groups));
        if (in_array('catalog', $groups, true)) {
            $groups = array_values(array_unique(array_merge($groups, ['stock', 'sales'])));
        }

        return $groups;
    }

    /** @return array<string,int> rows erased per group */
    public function reset(array $groups, User $keep): array
    {
        $groups = $this->resolveGroups($groups);
        $erased = [];
        $photoFiles = [];
        $avatarFiles = [];

        if (in_array('catalog', $groups, true) && Schema::hasTable('products')) {
            $photoFiles = DB::table('products')->where('image', 'like', ProductPhotoService::PREFIX.'%')
                ->pluck('image')->map(fn ($v) => substr($v, strlen(ProductPhotoService::PREFIX)))->all();
        }
        if (in_array('accounts', $groups, true)) {
            $removedIds = DB::table('users')->where('role', '!=', User::ROLE_SUPER_ADMIN)->where('id', '!=', $keep->id)->pluck('id');
            $avatarFiles = DB::table('app_settings')->whereIn('key', $removedIds->map(fn ($id) => 'avatar.user.'.$id))->pluck('value')->filter()->all();
        }

        DB::transaction(function () use ($groups, $keep, &$erased): void {
            // Children before parents.
            foreach (['stock', 'sales', 'history', 'catalog'] as $key) {
                if (! in_array($key, $groups, true)) {
                    continue;
                }
                $erased[$key] = 0;
                foreach (self::RESET_GROUPS[$key]['tables'] as $table) {
                    if (Schema::hasTable($table)) {
                        $erased[$key] += DB::table($table)->delete();
                    }
                }
            }
            // Stock is a running total of the ledger: with no entries left,
            // every remaining product is back to 0.
            if (in_array('stock', $groups, true) && ! in_array('catalog', $groups, true) && Schema::hasTable('products')) {
                DB::table('products')->update(['stock_on_hand' => 0]);
            }
            if (in_array('accounts', $groups, true)) {
                $ids = DB::table('users')->where('role', '!=', User::ROLE_SUPER_ADMIN)->where('id', '!=', $keep->id)->pluck('id');
                DB::table('app_settings')->whereIn('key', $ids->map(fn ($id) => 'avatar.user.'.$id))->delete();
                $erased['accounts'] = DB::table('users')->whereIn('id', $ids)->delete();
            }
        });

        $disk = Storage::disk(self::DISK);
        foreach (array_merge($photoFiles, $avatarFiles) as $path) {
            if ($this->isSafeFilePath($path)) {
                $disk->delete($path);
            }
        }

        return $erased;
    }

    /* ======================================================================
       SAFETY COPY (kept on the server before every reset / import)
       ====================================================================== */

    /** Save a backup on the server first; keeps the newest 5. Returns its file name. */
    public function saveSafetyCopy(User $by, string $reason): string
    {
        $disk = Storage::disk(self::DISK);
        $name = 'system-backups/before-'.$reason.'-'.now()->format('Y-m-d_His').'.gggbackup';
        $disk->put($name, $this->export($by));

        $copies = collect($disk->files('system-backups'))->sort()->values();
        foreach ($copies->slice(0, max(0, $copies->count() - 5)) as $old) {
            $disk->delete($old);
        }

        return basename($name);
    }

    /* ====================================================================== */

    /** Files on the private disk that the data points to (product photos, avatars, logo). */
    private function referencedFiles(array $tables): array
    {
        $paths = [];
        if (isset($tables['products'])) {
            $at = array_search('image', $tables['products']['columns'], true);
            foreach ($tables['products']['rows'] as $row) {
                $value = $at === false ? null : $row[$at];
                if (is_string($value) && str_starts_with($value, ProductPhotoService::PREFIX)) {
                    $paths[] = substr($value, strlen(ProductPhotoService::PREFIX));
                }
            }
        }
        if (isset($tables['app_settings'])) {
            $keyAt = array_search('key', $tables['app_settings']['columns'], true);
            $valueAt = array_search('value', $tables['app_settings']['columns'], true);
            foreach ($tables['app_settings']['rows'] as $row) {
                if ($row[$keyAt] === 'logo' || str_starts_with((string) $row[$keyAt], 'avatar.user.')) {
                    $paths[] = (string) $row[$valueAt];
                }
            }
        }

        return array_values(array_unique(array_filter($paths, fn ($path) => $this->isSafeFilePath($path))));
    }

    /** Only plain file names inside the photo / logo folders. */
    private function isSafeFilePath(string $path): bool
    {
        return (bool) preg_match('#^('.implode('|', self::FILE_FOLDERS).')/[A-Za-z0-9._-]+$#', $path)
            && ! str_contains($path, '..');
    }

    /** The smaller of PHP's upload limits, so the screen can warn before uploading. */
    public function uploadLimitBytes(): int
    {
        $toBytes = function ($value): int {
            $value = trim((string) $value);
            if ($value === '' || $value === '0') {
                return PHP_INT_MAX;
            }
            $number = (int) $value;

            return match (strtolower(substr($value, -1))) {
                'g' => $number * 1024 ** 3,
                'm' => $number * 1024 ** 2,
                'k' => $number * 1024,
                default => $number,
            };
        };

        return min($toBytes(ini_get('upload_max_filesize')), $toBytes(ini_get('post_max_size')));
    }
}

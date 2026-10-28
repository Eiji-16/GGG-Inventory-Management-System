<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\User;

/**
 * Role Access — which features Admin and Staff may use.
 *
 * The Super Admin ticks boxes in Settings → Role Access. The choices are
 * saved in app_settings (one short row per role, see SETTING_PREFIX), so no
 * new table or migration is needed. Anything not saved yet uses DEFAULTS, which match how the
 * system worked before this screen existed.
 *
 * Rules:
 *  - The Super Admin can always do everything (cannot be locked out).
 *  - A smaller feature only works if its page is also on ("parent").
 *    e.g. "Add product" needs "Open Products & Suppliers".
 *  - Super-Admin-only features (Staffs, Safety Stock Policy, system logo,
 *    this screen) are not in this list at all.
 */
class RoleAccessService
{
    /**
     * Saved as one app_settings row per role ("role_access_admin",
     * "role_access_staff"). The value column holds at most 255 characters,
     * so each feature has a short fixed 'code' and the row stores the codes
     * that are ON, then "|", then the codes that are OFF, e.g. "kv,kc|pv,pc".
     * A feature in neither list was added after the last save, so it uses its
     * default. (Rows saved before the "|" format list only the ON codes; their
     * OFF codes are the ORIGINAL_CODES that are not ON.)
     * Never change or reuse a code: saved choices depend on it.
     * Retired codes (never use again): 'ro' (Mark as ordered, removed Oct 25).
     */
    public const SETTING_PREFIX = 'role_access_';

    /** The 35 codes that existed when Role Access was first released. */
    private const ORIGINAL_CODES = [
        'pv', 'pc', 'pe', 'pd', 'px', 'sv', 'sm', 'kv', 'kc', 'ke', 'kd', 'kl', 'kx', 'kh', 'rv',
        'cu', 'cs', 'ch', 'cx', 'fv', 'fx', 'fp', 'fe', 'tv', 't1', 't2', 't3', 't4', 't5', 't6',
        't7', 't8', 'tx', 'nv', 'sc',
    ];

    /** Roles the Super Admin can configure. */
    public const ROLES = [User::ROLE_ADMIN, User::ROLE_STAFF];

    /**
     * Every feature that can be switched on/off, in screen order.
     * group  = heading on the Role Access screen
     * parent = the feature that must also be on (usually "Open the page")
     */
    public const FEATURES = [
        // Products & Suppliers
        'products.view'   => ['code' => 'pv', 'group' => 'Products & Suppliers', 'label' => 'Open Products & Suppliers'],
        'products.create' => ['code' => 'pc', 'group' => 'Products & Suppliers', 'label' => 'Add products', 'parent' => 'products.view'],
        'products.edit'   => ['code' => 'pe', 'group' => 'Products & Suppliers', 'label' => 'Edit products', 'parent' => 'products.view'],
        'products.delete' => ['code' => 'pd', 'group' => 'Products & Suppliers', 'label' => 'Delete products', 'parent' => 'products.view'],
        'products.export' => ['code' => 'px', 'group' => 'Products & Suppliers', 'label' => 'Export products to Excel', 'parent' => 'products.view'],
        'suppliers.view'  => ['code' => 'sv', 'group' => 'Products & Suppliers', 'label' => 'View suppliers', 'parent' => 'products.view'],
        'suppliers.manage' => ['code' => 'sm', 'group' => 'Products & Suppliers', 'label' => 'Add, edit and delete suppliers', 'parent' => 'suppliers.view'],

        // Stock Control
        'stock.view'    => ['code' => 'kv', 'group' => 'Stock Control', 'label' => 'Open Stock Control'],
        'stock.create'  => ['code' => 'kc', 'group' => 'Stock Control', 'label' => 'Add Stock In / Stock Out', 'parent' => 'stock.view'],
        'stock.edit'    => ['code' => 'ke', 'group' => 'Stock Control', 'label' => 'Edit an entry', 'parent' => 'stock.view'],
        'stock.delete'  => ['code' => 'kd', 'group' => 'Stock Control', 'label' => 'Delete one entry', 'parent' => 'stock.view'],
        'stock.clear'   => ['code' => 'kl', 'group' => 'Stock Control', 'label' => 'Clear all stock for a product', 'parent' => 'stock.view'],
        'stock.export'  => ['code' => 'kx', 'group' => 'Stock Control', 'label' => 'Export to Excel', 'parent' => 'stock.view'],
        'stock.history' => ['code' => 'kh', 'group' => 'Stock Control', 'label' => 'Activity history', 'parent' => 'stock.view'],

        // Reorder List (was "Auto Reorder Alerts"; the keys and codes stay the same)
        'reorder.view' => ['code' => 'rv', 'group' => 'Reorder List', 'label' => 'Open Reorder List'],
        'reorder.notify'   => ['code' => 'rn', 'group' => 'Reorder List', 'label' => 'Send restock requests (Notify button)', 'parent' => 'reorder.view'],
        'reorder.requests' => ['code' => 'rr', 'group' => 'Reorder List', 'label' => 'See and close restock requests (bell)', 'parent' => 'reorder.view'],

        // Order Quantity Calculator (also controls "Order Now" and the row calculator buttons)
        'calculator.use'        => ['code' => 'cu', 'group' => 'Order Quantity Calculator', 'label' => 'Open and compute (also "Order Now")'],
        'calculator.save_costs' => ['code' => 'cs', 'group' => 'Order Quantity Calculator', 'label' => 'Save ordering and holding cost defaults', 'parent' => 'calculator.use'],
        'calculator.history'    => ['code' => 'ch', 'group' => 'Order Quantity Calculator', 'label' => 'View and clear history', 'parent' => 'calculator.use'],
        'calculator.export'     => ['code' => 'cx', 'group' => 'Order Quantity Calculator', 'label' => 'Export Excel / PDF', 'parent' => 'calculator.use'],

        // Forecasting
        'forecast.view'       => ['code' => 'fv', 'group' => 'Forecasting', 'label' => 'Open Forecasting'],
        'forecast.export'     => ['code' => 'fx', 'group' => 'Forecasting', 'label' => 'Export forecast Excel / PDF', 'parent' => 'forecast.view'],
        'forecast.past_sales' => ['code' => 'fp', 'group' => 'Forecasting', 'label' => 'Past Sales: edit and import', 'parent' => 'forecast.view'],
        'forecast.events'     => ['code' => 'fe', 'group' => 'Forecasting', 'label' => 'Seasonal events: add, edit, delete', 'parent' => 'forecast.view'],

        // Reports
        'reports.view'                => ['code' => 'tv', 'group' => 'Reports', 'label' => 'Open Reports'],
        'reports.tab.stock_summary'   => ['code' => 't1', 'group' => 'Reports', 'label' => 'Stock Summary section', 'parent' => 'reports.view'],
        'reports.tab.stock_movement'  => ['code' => 't2', 'group' => 'Reports', 'label' => 'Stock Movement section', 'parent' => 'reports.view'],
        'reports.tab.top_moving'      => ['code' => 't3', 'group' => 'Reports', 'label' => 'Top Moving Products section', 'parent' => 'reports.view'],
        'reports.tab.fast_slow'       => ['code' => 't4', 'group' => 'Reports', 'label' => 'Fast & Slow Moving section', 'parent' => 'reports.view'],
        'reports.tab.demand_forecast' => ['code' => 't5', 'group' => 'Reports', 'label' => 'Demand Forecast Summary section', 'parent' => 'reports.view'],
        'reports.tab.order_quantity'  => ['code' => 't6', 'group' => 'Reports', 'label' => 'Order Quantity Calculator Summary section', 'parent' => 'reports.view'],
        'reports.tab.inventory_aging' => ['code' => 't7', 'group' => 'Reports', 'label' => 'Inventory Aging Report section', 'parent' => 'reports.view'],
        'reports.tab.reorder_point'   => ['code' => 't8', 'group' => 'Reports', 'label' => 'Reorder Point Report section', 'parent' => 'reports.view'],
        'reports.export'              => ['code' => 'tx', 'group' => 'Reports', 'label' => 'Export PDF / Excel', 'parent' => 'reports.view'],

        // Trash Bin (deleted products and stock entries)
        'trash.view'    => ['code' => 'bv', 'group' => 'Trash Bin', 'label' => 'Open Trash Bin'],
        'trash.restore' => ['code' => 'br', 'group' => 'Trash Bin', 'label' => 'Restore deleted items', 'parent' => 'trash.view'],
        'trash.purge'   => ['code' => 'bp', 'group' => 'Trash Bin', 'label' => 'Permanently delete items', 'parent' => 'trash.view'],

        // Other
        'notifications.view' => ['code' => 'nv', 'group' => 'Other', 'label' => 'Notification bell'],
        'settings.currency'  => ['code' => 'sc', 'group' => 'Other', 'label' => 'Change currency'],
    ];

    /** Which report section (in /api/reports) each tab permission unlocks. */
    public const REPORT_SECTIONS = [
        'stockSummary'   => 'reports.tab.stock_summary',
        'stockMovement'  => 'reports.tab.stock_movement',
        'topMoving'      => 'reports.tab.top_moving',
        'fastSlowMoving' => 'reports.tab.fast_slow',
        'demandForecast' => 'reports.tab.demand_forecast',
        'autoCalculator' => 'reports.tab.order_quantity',
        'inventoryAging' => 'reports.tab.inventory_aging',
        'reorderPoint'   => 'reports.tab.reorder_point',
    ];

    /** Staff defaults = what Staff could do before Role Access existed. */
    private const STAFF_ON = [
        'stock.view', 'stock.create', 'stock.edit', 'stock.delete', 'stock.export', 'stock.history',
        'reorder.view', 'reorder.notify',
        'reports.view', 'reports.tab.stock_summary', 'reports.tab.stock_movement', 'reports.tab.top_moving',
        'reports.tab.fast_slow', 'reports.tab.demand_forecast', 'reports.tab.order_quantity',
        'reports.tab.inventory_aging', 'reports.tab.reorder_point', 'reports.export',
        'notifications.view',
    ];

    /** Admin defaults: every feature EXCEPT these (erasing for good stays with the Super Admin). */
    private const ADMIN_OFF = ['trash.purge'];

    /** @return array{admin: array<string,bool>, staff: array<string,bool>} */
    public static function defaults(): array
    {
        $admin = [];
        $staff = [];
        foreach (array_keys(self::FEATURES) as $key) {
            $admin[$key] = ! in_array($key, self::ADMIN_OFF, true); // Admin could use every listed feature before
            $staff[$key] = in_array($key, self::STAFF_ON, true);
        }

        return [User::ROLE_ADMIN => $admin, User::ROLE_STAFF => $staff];
    }

    /**
     * The boxes as the Super Admin saved them (missing boxes use defaults).
     *
     * @return array{admin: array<string,bool>, staff: array<string,bool>}
     */
    public static function matrix(): array
    {
        $matrix = self::defaults();
        $byCode = [];
        foreach (self::FEATURES as $key => $feature) {
            $byCode[$feature['code']] = $key;
        }

        foreach (self::ROLES as $role) {
            $saved = AppSetting::get(self::SETTING_PREFIX.$role);
            if ($saved === null) {
                continue; // never saved for this role: keep the defaults
            }
            $split = fn (string $list) => array_values(array_filter(array_map('trim', explode(',', $list))));
            if (str_contains($saved, '|')) {
                [$onPart, $offPart] = explode('|', $saved, 2);
                $on = $split($onPart);
                $off = $split($offPart);
            } else {
                $on = $split($saved);
                $off = array_values(array_diff(self::ORIGINAL_CODES, $on));
            }
            foreach ($on as $code) {
                if (isset($byCode[$code])) {
                    $matrix[$role][$byCode[$code]] = true;
                }
            }
            foreach ($off as $code) {
                if (isset($byCode[$code])) {
                    $matrix[$role][$byCode[$code]] = false;
                }
            }
        }

        return $matrix;
    }

    /** Save new boxes. Unknown keys are ignored; missing keys keep their value. */
    public static function save(array $input): array
    {
        $matrix = self::matrix();
        foreach (self::ROLES as $role) {
            foreach (array_keys(self::FEATURES) as $key) {
                if (isset($input[$role][$key])) {
                    $matrix[$role][$key] = (bool) $input[$role][$key];
                }
            }
        }

        foreach (self::ROLES as $role) {
            AppSetting::put(self::SETTING_PREFIX.$role, self::encode($matrix[$role]));
        }

        return $matrix;
    }

    /** ON codes, "|", OFF codes, e.g. "kv,kc,rv|pv,pc". */
    public static function encode(array $boxes): string
    {
        $on = [];
        $off = [];
        foreach (self::FEATURES as $key => $feature) {
            if ($boxes[$key] ?? false) {
                $on[] = $feature['code'];
            } else {
                $off[] = $feature['code'];
            }
        }

        return implode(',', $on).'|'.implode(',', $off);
    }

    /** Same Super Admin rule as the role middleware (role column or configured email). */
    public static function isSuperAdmin(?User $user): bool
    {
        if ($user === null) {
            return false;
        }
        if ($user->role === User::ROLE_SUPER_ADMIN) {
            return true;
        }
        $email = config('auth.super_admin_email');

        return is_string($email) && $email !== '' && hash_equals(strtolower($email), strtolower((string) $user->email));
    }

    /**
     * What this user can actually do: their box AND every parent box.
     *
     * @return array<string,bool>
     */
    public static function effectiveFor(?User $user): array
    {
        $all = array_fill_keys(array_keys(self::FEATURES), false);
        if ($user === null) {
            return $all;
        }
        if (self::isSuperAdmin($user)) {
            return array_fill_keys(array_keys(self::FEATURES), true);
        }

        $role = in_array($user->role, self::ROLES, true) ? $user->role : User::ROLE_STAFF;
        $boxes = self::matrix()[$role];

        foreach (array_keys(self::FEATURES) as $key) {
            $all[$key] = self::onWithParents($key, $boxes);
        }

        return $all;
    }

    public static function allows(?User $user, string $key): bool
    {
        return self::effectiveFor($user)[$key] ?? false;
    }

    private static function onWithParents(string $key, array $boxes): bool
    {
        $seen = [];
        while ($key !== null && ! isset($seen[$key])) {
            $seen[$key] = true;
            if (! ($boxes[$key] ?? false)) {
                return false;
            }
            $key = self::FEATURES[$key]['parent'] ?? null;
        }

        return true;
    }

    /** Feature list for the Role Access screen. */
    public static function catalog(): array
    {
        $items = [];
        foreach (self::FEATURES as $key => $feature) {
            $items[] = [
                'key' => $key,
                'group' => $feature['group'],
                'label' => $feature['label'],
                'parent' => $feature['parent'] ?? null,
            ];
        }

        return $items;
    }
}

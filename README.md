# GGG Inventory Management System

Web-based inventory management system with sales forecasting for **Global Growth Guide**, an online merchandise business. Capstone project (BS Information Technology, Cavite State University – CCAT Campus).

Built with **React** (frontend), **Laravel 13** (backend) and **MySQL** (database).

## Features

- **Dashboard** – stock overview, sales trend, stock alerts, recent movements
- **Products & Suppliers** – products with variants, photos and suppliers; duplicate products are blocked
- **Stock Control** – Stock In / Stock Out / count corrections with a running balance; same-day entries merge; back-dated entries can't make any day go below zero; no future dates
- **Reorder Alerts** – products at or below their reorder point; Staff can **Notify** Admins (with an optional note), shown in the Admins' notification bell
- **Order Quantity Calculator** – economic order quantity, reorder point and safety stock, using the forecast as annual demand
- **Forecasting** – weighted moving average forecast, Past Sales import, seasonal events (promotions/holidays)
- **Reports** – 8 report tabs, export to PDF and Excel
- **Staffs** – accounts and roles (Super Admin only)
- **Settings** – theme, currency, field descriptions, Safety Stock Policy (Super Admin), **Role Access** (Super Admin)

## Roles and Role Access

| Role | Access |
|---|---|
| Super Admin | Everything. Always. Manages Staffs, Safety Stock Policy, the system logo and Role Access |
| Admin | What the Super Admin allows in Settings → Role Access (default: everything except the Super Admin–only pages) |
| Staff | What the Super Admin allows (default: Stock Control, Reorder Alerts with Notify, Reports) |

Every Role Access box is checked on the server, not only hidden on screen.

## Requirements

- PHP **8.3+** (with OPcache), Composer
- MySQL 8 (or MariaDB 10.6+)
- Node.js 20+ and npm
- For local development: [Laragon](https://laragon.org) (Windows)

## Setup (local, Laragon)

```bash
composer install
npm install
copy .env.example .env        # then set DB_*, MAIL_* and SUPER_ADMIN_EMAIL
php artisan key:generate
php artisan migrate
php artisan inventory:create-admin   # first Super Admin account (new database only)
npm run build                 # or: npm run dev while developing
```

Open the site from Laragon (e.g. `http://ggg-inventory-management-system.test`).

## Useful commands

| Command | What it does |
|---|---|
| `php artisan test` | Runs the automated tests |
| `npm run build` | Builds the frontend into `public/build` |
| `php artisan inventory:check` | Checks stock, balances and sales data for problems (changes nothing) |
| `php artisan inventory:create-admin` | Creates a Super Admin account (asks for name, email and password) |
| `php artisan inventory:add-opening-stock` | Previews adding the missing Opening stock entry where a product's entries don't add up to its stock (add `--apply` to save; stock on hand doesn't change) |
| `php artisan inventory:sync-sales` | Previews rebuilding monthly sales from Stock Out (add `--apply` to save) |
| `php artisan inventory:move-photos` | Previews moving older product photos out of the database into files (add `--apply` to move; back up first) |
| `php artisan optimize` / `optimize:clear` | Caches / clears Laravel's config and routes (use `optimize` on the live server) |

## Going live (checklist)

1. Host with PHP 8.3, MySQL and Composer/SSH access; a Singapore data center is fastest for the Philippines.
2. Build the screens on your own computer first: `npm run build` (the `public/build` folder is uploaded with the code, so the server does not need Node.js).
3. Upload the project (without `node_modules`, `.env` and `storage/logs`), then on the server:
   ```bash
   cp .env.example .env          # then edit it: see below
   composer install --no-dev --optimize-autoloader
   php artisan key:generate
   php artisan migrate --force
   php artisan inventory:create-admin   # only on a new, empty database
   php artisan optimize
   ```
4. In `.env`: `APP_ENV=production`, `APP_DEBUG=false`, `LOG_LEVEL=error`, the real `https://` `APP_URL`, `SESSION_SECURE_COOKIE=true`, the database and mail settings.
5. Point the web root (document root) to the `public/` folder — never the project folder itself.
6. Make sure the web server can write to `storage/` and `bootstrap/cache/`.
7. Back up regularly: the database **and** `storage/app/private` (product photos, the system logo and profile photos are saved there).
8. After every update: upload, `php artisan migrate --force`, then `php artisan optimize`.

## Security notes

- Never commit `.env`, database dumps (`*.sql`) or tokens. They are listed in `.gitignore`.
- Login is limited to 5 wrong tries per minute per email.

## Team

Wrenz AJ C. Aquino · Renchel B. Bongat · Jeynard G. Cadatal

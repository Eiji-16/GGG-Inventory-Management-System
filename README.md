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
npm run build                 # or: npm run dev while developing
```

Open the site from Laragon (e.g. `http://ggg-inventory-management-system.test`).

## Useful commands

| Command | What it does |
|---|---|
| `php artisan test` | Runs the automated tests |
| `npm run build` | Builds the frontend into `public/build` |
| `php artisan inventory:check` | Checks stock, balances and sales data for problems (changes nothing) |
| `php artisan inventory:sync-sales` | Previews rebuilding monthly sales from Stock Out (add `--apply` to save) |
| `php artisan optimize` / `optimize:clear` | Caches / clears Laravel's config and routes (use `optimize` on the live server) |

## Going live (checklist)

1. Host with PHP 8.3, MySQL and Composer/SSH access; a Singapore data center is fastest for the Philippines.
2. In `.env`: `APP_ENV=production`, `APP_DEBUG=false`, real `APP_URL`, database and mail settings.
3. `composer install --no-dev --optimize-autoloader`, `php artisan migrate --force`, `npm run build`, `php artisan optimize`.
4. Point the web root to the `public/` folder.
5. Set up regular database backups (hosting backups or a scheduled export).

## Security notes

- Never commit `.env`, database dumps (`*.sql`) or tokens. They are listed in `.gitignore`.
- Login is limited to 5 wrong tries per minute per email.

## Team

Wrenz AJ C. Aquino · Renchel B. Bongat · Jeynard G. Cadatal

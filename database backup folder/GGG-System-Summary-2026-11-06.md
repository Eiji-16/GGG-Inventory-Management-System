# GGG Inventory Management System — Handoff Summary (for the next thread)

Team capstone: **Web-Based Inventory Management System with Sales Forecasting for Global Growth Guide**. Chapter 1–3 documentation is the reference for the system.
_Last updated: 2026-11-06 (replaces the 2026-11-03 summary)._

## 0. FIRST THINGS TO DO
1. **Restart `npm run dev`** (new files were added on 2026-11-06) and press **Ctrl+F5** in the browser.
2. Run `php artisan test` → expect **all passing** (328 tests on 2026-11-06; in a copy without built assets only `ExampleTest` fails with "Vite manifest not found").
3. Delete the one leftover unused file (from the undone "Prepared Orders" attempt):
   ```
   del src\utils\orderReport.js
   ```
   (The other 2026-11-03 leftovers — OrderPlan files, migration, test — are already gone.)
4. **Git safety (not done yet, needs your OK):** `database backup folder\` is NOT in `.gitignore`, and `.gitignore` even allows `database backup folder/db.sql` (accounts' emails + password hashes) to be committed. Suggested: add `/database backup folder/` to `.gitignore`, run `git ls-files "database backup folder"`, and if anything is listed run `git rm -r --cached "database backup folder"` (keeps the files on disk). Consider moving the folder outside the project (e.g. `F:\laragon\GGG-backups\`).
5. **No new migrations** since 2026-11-03 (all 2026-11-06 work uses existing tables / `app_settings`).

## 1. How I like to work (please follow)
- I'm a beginner programmer: explain technical decisions in simple language.
- Inspect existing code first, reuse existing patterns, make the **smallest safe change**. **Never remodel what we already finished — only add improvements.**
- **Ask first** when a request is unclear, could break things, or goes outside the asked scope. Offer choices with a recommended one. Keep questions simple.
- Run tests and report errors honestly; always say which files changed and how to test.
- **Never commit, push, or pull without asking me first.** (I commit myself; give me a commit message when asked.)
- **Never delete/recreate the database, erase records, or run destructive SQL/migrations without explicit permission.** Never expose `.env` secrets. New migrations: only with my OK; I run them myself.
- Tech critique rules: **no acronyms in on-screen text** (write "Economic Order Quantity", "Weighted Moving Average"; "PDF" is the only exception); **tables: first 2 columns left-aligned, the rest centred** (global rule).
- **Wording rule:** never use **"Smart"**, **"Auto"/"Automatic"/"automatically"**, and avoid **"Order"** wording for buying (the system does not place orders) — e.g. the button is **"Calculate Now"**, not "Order Now".
- **Design rule (2026-11-06): no thick coloured left stripe** on rounded boxes (the "bracket" look) anywhere **except Stock Control**.
- **Show field descriptions:** every helper note gets the class `hint-text` so the Settings switch hides it.
- **Messages:** page messages and form errors show as **bottom-right pop-ups** (see §7). Keep the field's red outline; only "could not load…" content messages (with Retry) stay on the page.
- The client's Replenishment Excel file is confidential.
- Keep a copy of the original before changes. Backups are zips in `database backup folder\` (unzip over the project to restore). 2026-11-06 zips: `ui-backup-before-2026-11-06-` + `restock-requests`, `toasts-staff-tabs-cleanup`, `no-left-stripes`, `gap-6px`, `dashboard-arrows`, `logo-background`, `history-drawer`, `phone-menu-60`, `thin-scrollbar`, `recent-searches`, `system-name`, `error-popups`, `dark-theme`, `stock-dropdowns`. The old 2026-10-28…10-30 zips are no longer useful (later work would be undone) and can be deleted after committing.
- Check layouts at **100% browser zoom** on a laptop, and phone/tablet sizes.
- Working setup on 2026-11-06: the computer's terminal (device shell) did not start, so the cloud session copied files in, edited them, ran the full PHP test suite on a copy (composer install there), checked screen files with a TypeScript syntax/undefined-name check, rendered UI pieces with Playwright, and wrote files back through the desktop app. It could not delete files or run npm on your computer.

## 2. Stack & running it
- **Backend:** Laravel 13 (PHP 8.3), MySQL in Laragon (tests use in-memory SQLite). Folder: `F:\laragon\www\GGG-Inventory-Management-System`.
- **Frontend:** React 19 + Vite 8 (`laravel-vite-plugin`), source in `src/`. Entry `src/layouts/App.jsx`; global CSS `src/styles/index.css` + `motion.css` + `polish.css`.
- Libraries: `lucide-react`, `xlsx-js-style`. **No new libraries added.**
- Font: Plus Jakarta Sans (`--font-sans`).
- Run: `npm run dev` (restart after new files) + Laragon. Tests: `php artisan test`.
- Login: email + password (+ authenticator code if set). Super Admin created with `php artisan inventory:create-admin`.

## 3. Roles & Role Access
- **Super Admin, Admin, Staff.** Role Access (Settings) decides features for Admin/Staff; the server checks the same rules (`RoleAccessService`, `EnsureFeatureAccess`).
- `staff.manage` ("Manage Staff"): Admin-only switch, off by default; Admin then manages **Staff accounts only**.
- `reorder.notify` (Request button), `reorder.requests` (see/close requests + bell), `reorder.receive` ("Received: record a delivery, with an optional proof photo"), `calculator.use` ("Economic Order Quantity tab in Forecasting (also "Calculate Now")").
- **Dashboard follows Role Access (2026-11-06):** a KPI card / card arrow / clickable row only opens (and only shows its arrow) when the role may open that page; otherwise it is a plain card (`canOpen` = the sidebar's `canAccess`).

## 4. Modules (sidebar)
1. **Dashboard** — KPI cards (Products · Stock on Hand · Stock Health · Units Sold This Month), Sales History, Supplier Coverage, Inventory by Category, Reorder List, Recent Activity, Top Products Sold, Stock Movements. Arrows/cards respect Role Access.
2. **Product & Supplier** — products, variants, suppliers; search panel with **Recent searches** + Categories/Suppliers chips.
3. **Stock Control** — Stock | History tabs; Add/Edit form uses **themed dropdowns** for Product (with a search box + product code tags), Variant and Type (`CustomSelect`, new optional `searchable` prop); form errors also pop up; Transaction History drawer is now **floating with rounded corners** (gap top/bottom/right); low-stock alert shows as a pop-up with **Calculate Now**. Search panel with Recent searches. (Stock Control keeps its left-stripe styles.)
4. **Reorder List** — products at/below reorder point; statuses here are **Low Stock / Out of Stock** only.
   - **Calculate Now** (was "Order Now") → Economic Order Quantity tab.
   - **Restock Report** (1+ ticked products; System suggested vs Owner's quantity; Save Report = keeps quantities + PDF).
   - **Request flow (2026-11-06):** Staff **Request** (+note, emails Admins, bell) → Admin saves a Restock Report → row shows **"In Restock Report (date), waiting for delivery"** and Staff see **"Waiting for delivery"** instead of Request → **Received** (or any Stock In) closes the request and clears the waiting label. **Close request** (was "Mark done") is only for "won't restock / by mistake".
   - **Received:** proof photo is now **optional** (grey "Optional" label); quantity choices System suggested / Saved report / Custom.
5. **Forecasting** — Sales Forecasting · Past Sales · Seasonal Adjustments · Economic Order Quantity (calculator tab; forecast notes show as pop-ups).
6. **Reports & Analytics** — 8 sections + Overall Inventory Report; PDF/Excel exports print the **system name**.
7. **Staffs** — Super Admin sees tabs **Accounts | Account requests** (same style as Stock | History). Account requests is its own **table** (waiting first, finished below, Status column, red count on the tab). Profile photos, Manage Staff rules unchanged.
8. **Trash Bin**, **Profile**, **Settings**:
   - Preferences: Appearance (**8 themes** incl. new **Dark**), Currency, **System name (Super Admin)**, Font size, Show field descriptions.
   - Safety Stock Policy (search box fixed to a 30px square), Role Access, Data & System.
- **Login page:** Global Growth Guide + the **system name**; errors as pop-ups.
- **Account setup page** (emailed link) has its own pop-up area.

## 5. Formulas (plain words for the defense) — unchanged
- **Forecast (Weighted Moving Average):** (oldest × 1 + middle × 2 + newest × 3) ÷ 6 over the last 3 completed periods; seasonal events add/subtract their percentage.
- **Annual demand** = monthly forecast × 12 (or last 12 months of sales).
- **Economic Order Quantity** = √(2 × annual demand × ordering cost ÷ holding cost); also orders per year (D ÷ EOQ) and total annual cost ((D ÷ EOQ) × S + (EOQ ÷ 2) × H).
- **Reorder point** = safety stock + (annual demand ÷ 365 × lead time days), rounded up.
- **Stock status:** Low at the reorder point, Critical at safety stock, Out at 0.

## 6. Scope decisions
- Not a shopping platform: buying happens outside; the system suggests quantities, produces the Restock Report, records deliveries with Received / Stock In. **No purchase-order records.**
- Variants are counted separately, not separate stock items.
- No AI / "smart" / "auto" claims on screen. Logo background removal is a plain-colour tool (no AI library).
- Custom colour themes were discussed and **not** added (52 colour settings per theme; risky). If ever needed: accent-colour only.

## 7. UI system
- **Themes (8):** Soft White, Lavender, Teal Citrus, Olive, Graphite, Midnight Blue (default), Ember, **Dark** (`noir`: pure black, white text, grey borders, white buttons with black text; red/amber/green kept for statuses). Saved per account (`users.theme`; allowed list in `User::THEMES` and `src/theme.js`).
- **System name (2026-11-06):** Settings → Preferences → System name (Super Admin; 2–60 chars, no `<`/`>`, ↺ resets to "GGG Inventory Management System"). Saved in `app_settings` key `system_name`. `GET /branding/name` (public), `PUT /branding/name` (Super Admin). Used in: browser tab (server-rendered `<title>`), sidebar (2-line clamp), Login + account setup, PDF/Excel/EOQ reports, emails, authenticator label (new setups). Frontend helper `src/systemName.js` (`useSystemName`, `setSystemName`, `getSystemName`). Business name "Global Growth Guide" and Data & System safety phrases stay fixed.
- **System logo:** sidebar logo window now previews first; **Remove plain background** switch + Strength slider (`src/utils/removePlainBackground.js`, flood fill from the edges, saves a PNG ≤512px). The **browser tab icon follows the logo** while signed in.
- **Notification pop-ups (bottom-right, like Windows):** `src/utils/toast.js` (`showToast`, `<PageToast message type title action onShown />`) + `src/components/Toaster/` (mounted in `App.jsx`, also on the account setup page). Types info/success/warning/error; auto-close 6–10 s; hover pauses; max 4. Used for page messages, form/field errors, forecast notes, safety alert.
- **Bell:** red number = **unread** notifications only (Mark all read clears it). Reorder List count stays in the sidebar.
- **Search panels:** `SearchSuggestions` shows **Recent searches** (last 6 per search bar, × to remove, Clear; localStorage `ggg-recent-search:<key>`, keys stock/products/suppliers/reorder) + preset chips. Browser's grey autofill list is turned off on all 11 search boxes.
- **Spacing:** all single `gap: 8px` / `0.5rem` changed to **6px** (140 rules) — revert with `ui-backup-before-2026-11-06-gap-6px.zip` if wanted.
- **Scrollbars:** thin (3px visible), and kept 12px away from the ends of every scrolling box so they stay inside rounded corners (page scrollbar full length). Sidebar 16px, phone menu 18px.
- **Phone menu:** 60% of the screen width on phones (≤640px); tablets keep the wider menu.
- **Expandable search bars** (`xs-search`), Trash Bin search opens to 12rem; Past Sales search nudged 2px right.
- **No left stripes** outside Stock Control (bell rows, pop-ups, Dashboard reorder rows, chart hover boxes, EOQ sentence, Trash Bin warning, Reorder List selected row now use thin full borders or nothing).
- Global table alignment, nested frame, sidebar zoom-safe, font size, chart hover box, polish/motion layers — unchanged.

## 8. Chapter 1–3 paper (2026-11-04 review)
- Agreed fixes applied by the team: calculator limitation text, safety stock sentence, timeline sentence, Reorder List "Low and Out", Stock Correction mentions, formulas paragraph in System Technical Background (before Synthesis), Figure 14 fishbone, references sorted A–Z (Balaji removed, Wynn added).
- Still to fix in the paper (last check): use-case paragraph wording ("The actors are the Super Admin, Admin, and Staff…", six use cases listed), stray "S" on page 4, Definition of Terms ending ("…for an accurate movement history."), Development Phase item 5 ("Low Stock or Out of Stock"), "Bachelor **of** Science".
- Kept by choice: old mockups as samples; evaluation criteria (adviser suggested 3) — note Objective 5, System Evaluation text and Table 3 still list different qualities.
- Paper wording to keep in sync with the system: the button is now **"Calculate Now"**; proof photo is **optional**; system name is editable.

## 9. Open items / known problems
1. Delete `src/utils/orderReport.js` (§0); add the backup folder to `.gitignore` (§0).
2. Remaining tech-critique items not started: **3** Trash Bin → Archive → Permanent delete for accounts/products, **6** OTP fix on Login, **11** email verification (6-digit code on first login), **12** Super Admin account/product management + sign out a deleted/deactivated user immediately. Items 3, 11, 12 may need small migrations — ask first. (Item 8 proof photo: now exists and is optional.)
3. A saved Restock Report keeps "waiting for delivery" until a delivery is recorded or a new report is saved — no "cancel" yet (offered).
4. Variants vs reorder: Reorder List, bell and "Low stock" still count per product.
5. Data & System import/reset tested on SQLite only — test once on a copy of the MySQL database.
6. Real email sending (Gmail App Password) must be tested by hand.
7. Firefox ignores the scrollbar corner gap (Chrome/Edge only); page-edge fade is Chrome/Edge only.
8. Other search bars (Staffs, Trash Bin, Forecasting, Past Sales, Settings) have autofill off but no Recent searches panel yet (offered).
9. Phone width check suggested for: Transaction History drawer (full width on phones), Staffs tabs, Settings System name row, Dark theme across pages.

## 10. Files changed on 2026-11-06 (review before committing)
- **Backend:** `app/Models/AppSetting.php`, `app/Models/User.php`, `app/Http/Controllers/SystemNameController.php` (new), `AuthController.php`, `AccountRequestController.php`, `StockMovementController.php`, `app/Services/RoleAccessService.php`, `routes/web.php`, `resources/views/welcome.blade.php`, `resources/views/emails/account-invite.blade.php`, `resources/views/emails/restock-request.blade.php`.
- **Tests:** `tests/Feature/SystemNameTest.php` (new), `RestockRequestTest.php`, `ReorderReceiveTest.php`, `ThemePreferenceTest.php`.
- **Frontend (new):** `src/systemName.js`, `src/utils/toast.js`, `src/utils/removePlainBackground.js`, `src/components/Toaster/{Toaster.jsx,toaster.css}`.
- **Frontend (changed):** `src/layouts/App.jsx`, `src/theme.js`, `src/styles/{index.css,polish.css}`, `src/utils/{exportReportWorkbook.js,simplePdf.js}`, and components: `AutoCalculator/{autoCal.jsx,autoCal.css}`, `Dashboard/{dashboard.jsx,dashboard.css}`, `Forecasting/{forecasting.jsx,forecasting.css,pastSales.jsx,CustomSelect.jsx,customSelect.css}`, `LandingPage/{landingPage.jsx,landingPage.css}`, `Login/{Login.jsx,AccountSetup.jsx,RequestAccess.jsx,TwoFactorPrompt.jsx,ResetPass/resetPass.jsx,index.css,login.css,authModal.css}`, `ProductSupplier/{productSupplier.jsx,productSupplier.css,supplierRecords.jsx}`, `Profile/{profile.jsx,profile.css}`, `ReorderAlerts/{reorderAlerts.jsx,reorderAlerts.css,ReceiveDelivery.jsx,bulkOrder.jsx}`, `Reports/{reports.jsx,reports.css}`, `SearchSuggestions/{SearchSuggestions.jsx,searchSuggestions.css}`, `Settings/{Settings.jsx,settings.css,roleAccess.jsx,systemData.jsx}`, `Staffs/{staffs.jsx,AccountRequests.jsx,staff.css}`, `StockControl/{stockControl.jsx,stockControl.css}`, `TrashBin/{trashBin.jsx,trashBin.css}`.
- No new migrations. No new libraries.

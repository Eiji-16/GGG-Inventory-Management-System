# GGG Inventory Management System — Handoff Summary (for the next thread)

Team capstone: **Web-Based Inventory Management System with Sales Forecasting for Global Growth Guide** (a gadget/peripherals shop). Chapter 1–3 documentation is the reference for the system.
_Last updated: 2026-11-03 (evening)._

## 0. FIRST THING TO DO (left over from 2026-11-03)
1. **Run `php artisan migrate`** (Laragon terminal, project folder). Three add-only migrations are waiting:
   - `2026_11_03_000001_add_trash_archive_metadata` (Trash → Archive columns)
   - `2026_11_03_000002_add_auth_version_to_users_table` (sign-out of deactivated accounts)
   - `2026_11_03_000003_create_account_requests_and_two_factor` (account requests + 2FA columns)
   Until this runs: deactivating a user fails ("Unknown column auth_version") and Staffs → Account requests shows an error (table missing).
2. **Fix Gmail in `.env`** (the log shows `535 BadCredentials`): `MAIL_PASSWORD` must be a **16-letter Gmail App Password** (Google Account → Security → 2-Step Verification on → App passwords), not the normal password; `MAIL_FROM_ADDRESS` = same Gmail as `MAIL_USERNAME`; `APP_URL` = the address the system is opened with (e.g. `http://ggg-inventory-management-system.test`, used in emailed links). Then `php artisan config:clear`.
3. After pulling new files: stop and restart `npm run dev`, then **Ctrl+F5** in the browser (the browser showed old CSS once).
4. Optional `.env`: `ACCOUNT_REQUEST_DOMAINS=company.com` (only that email domain may request an account; empty = any).
5. `php artisan test` → **317 passing**.

## 1. How I like to work (please follow)
- Beginner programmer: explain technical decisions in simple language.
- Inspect existing code first, reuse existing patterns, **smallest safe change**. Don't redesign whole pages unless asked. **Never remodel what we already finished — only add improvements.**
- **Ask first** when a request is unclear, could break things, or goes outside scope. Offer choices with a recommended one.
- Run tests and report errors honestly; always say which files changed and how to test.
- **Never commit, push, or pull without asking me first** (I commit myself; give me a commit message).
- **Never delete/recreate the database, erase records, or run destructive SQL/migrations without explicit permission.** Never expose `.env` secrets. New migrations: only with my OK; I run them myself.
- Tech critique rules: **no acronyms on screen** (write "Economic Order Quantity", "Weighted Moving Average"; "PDF" as a file type is OK); **tables: first 2 columns left-aligned, the rest centred**.
- **Wording:** never "Smart", "Auto"/"Automatic"/"automatically" on screen.
- Every new helper note gets class `hint-text` (Settings → "Show field descriptions" hides it).
- The client's Replenishment Excel file is confidential.
- Keep a copy of originals before big changes → `database backup folder\` (zips). 2026-11-03: `ui-backup-before-2026-11-03-otp-reorder-accounts.zip`, `…-layout-round2.zip`, `…-layout-round3.zip`.
- Check layouts at 100% zoom on a laptop **and** phone/tablet sizes (360–1366px), dark + light themes.
- Working setup: the computer's shell (device bash) was not available in the cloud session, so files were copied in, edited, tested in a cloud copy (SQLite demo data + a small preview bundler), and written back. The npm registry was blocked there, so **no new libraries** were added (QR code and PDF are written by hand).

## 2. Stack & running it
- Laravel 13 (PHP 8.3), MySQL in Laragon (tests: in-memory SQLite). Folder `F:\laragon\www\GGG-Inventory-Management-System`.
- React 19 + Vite 8, source in `src/`. Entry `src/layouts/App.jsx`; global CSS `src/styles/index.css` + `motion.css` + `polish.css`.
- Libraries: `lucide-react`, `xlsx-js-style`. No others.
- Font Plus Jakarta Sans (`--font-sans`).
- Run: `npm run dev` + Laragon. Login: email + password (+ authenticator code for accounts that have 2FA).

## 3. Roles
- Super Admin, Admin, Staff. Role Access (Settings) decides features; the server checks the same (`RoleAccessService`, `EnsureFeatureAccess`).
- `staff.manage` (Admin only, off by default): Admin manages Staff accounts only.
- **NEW `reorder.receive` ("Received", code `rc`)**: on for Staff by default. Staff in the Reorder List see only **Received** and **Request**; Admin/Super Admin can order (Order Now, Restock Report) and receive.

## 4. Modules (sidebar)
1. **Dashboard** — KPI cards, charts, Reorder List card, Recent Activity, etc.
2. **Product & Supplier** — Products | Suppliers tabs (switch now animates like Stock | History), search, folder cards on phones.
3. **Stock Control** — Stock | History; `[−][count][+][✓]` per row; entries recorded with "Received" show **"View proof photo"**.
4. **Reorder List** — Low/Out products; filter + expandable search + Restock Report on one row.
   - **Order Now** → Economic Order Quantity tab in Forecasting.
   - **Restock Report** (1+ ticked products): System suggested vs Owner's quantity. **One "Save Report" button**: keeps each product's quantity for Received (`app_settings` key `restock_report.{code}`), saves Economic Order Quantity results to Reports, and **downloads a real PDF** (`src/utils/simplePdf.js`).
   - **Received**: 3 choices (System suggested / Saved report / Custom) + **required proof photo** + **Accomplish** → Stock In right away (`POST /api/reorder/receive`), photo on the private disk `storage/app/private/delivery-proofs/{movement id}/`, note says which choice and what the system suggested.
   - **Request** (was "Notify"): bell notice + **email to every active Admin and Super Admin** (`RestockRequestMail`).
   - Zoomed in (narrow table): action buttons become icons.
5. **Forecasting** — Sales Forecasting · Past Sales · Seasonal Adjustments · Economic Order Quantity. Search + Product on one row on tablets/phones (50/50 when the search opens).
6. **Reports & Analytics** — one page, 12 spots; phones: number cards 2 per row.
7. **Staffs** — photos, Manage Staff rules; **Account requests panel** (Super Admin): Approve & Invite (role Staff/Admin), Send link again, Reject, finished list. Row menu: change role, deactivate/delete, **Turn off authenticator (lost phone)**. (Photo options removed from the row menu on 2026-11-03; people still set their own photo in Profile.)
8. **Trash Bin / Archive** (Super Admin), **Profile**, **Settings**.

## 5. Sign-in & accounts (NEW 2026-11-03)
- **Forgot password**: email → 6-digit code (10 min, hashed) → `POST /auth/password/otp/verify` (check only) → new password (`/auth/password/reset` checks the code again). 5 wrong tries block the code; "Send a new code" after 60 s; same answer for unknown emails. Throttles have separate counters (`throttle:3,1,otp-send` etc.).
- **Account registration**: login page → "Request Account Access" (name, work email, department/role; domain check) → Super Admin approves → email with a **one-time 24-hour link** (only a SHA-256 hash stored; first browser to open it claims it, others refused) → `/account/setup`: password + **authenticator QR code** (`app/Support/Totp.php`, RFC 6238; QR drawn by `src/utils/qrCode.js`) → account made with 2FA on.
- **2FA at sign-in**: password OK → session only remembers "password OK" for 5 min → `POST /auth/two-factor` with the 6-digit code signs in. 5 wrong codes = start over; a code can't be reused.
- **Deactivated / deleted while signed in**: signed out within 3 s; pop-up "You've been signed out" with a 5-second countdown on "Okay". Sessions are deleted immediately; a 30-minute note per removed session (`App\Support\AccountSignout`) tells the browser why.

## 6. Formulas (unchanged)
- Forecast (Weighted Moving Average): (oldest×1 + middle×2 + newest×3) ÷ 6; seasonal events adjust it.
- Annual demand = next month's forecast × 12 (or last 12 months of sales).
- Economic Order Quantity = √(2 × annual demand × ordering cost ÷ holding cost).
- Reorder point = safety stock + daily demand × lead time days.
- Back above reorder point = reorder point + 1 − stock.

## 7. UI system
- 7 themes, nested frame, sidebar icons-only ↔ names, zoom-safe sidebar.
- Expandable search bars (`xs-search`). Phones: search icon sits on the same row as the buttons.
- **Folder cards (≤900px)**: closed cards stay short; open/close animation; **sticking list (masonry)** in 2-column mode so cards stack under each other (`startStickingCards` in `src/utils/mobileFolders.js`, `tbody[data-masonry]` in `index.css`). Stock Control closed card = picture · name · badge on one line.
- **Row hover tint removed from all data tables** (it lit only part of rows). Selected rows keep their tint.
- Tab highlight slides (`slidingTabs.js` remembers the last position per tab group name, so rebuilt tab groups slide too).
- Sign-in pop-ups share `src/components/Login/authModal.css` (`am-` classes) and `OtpInput.jsx`.

## 8. Open items / ideas
1. Run the migrations and fix Gmail (§0) — then test request emails, account invites and Forgot password by hand.
2. 2FA is only for accounts made through the new link; existing accounts can't turn it on themselves yet (possible: "Set up authenticator" in Profile).
3. Proof photos: only the newest photo per entry is shown; old photos are not cleaned up when an entry is deleted.
4. Variants vs reorder: Reorder List, bell and Low stock count per product.
5. Data & System import/reset tested on SQLite only — test once on a MySQL copy.
6. Test data has unrealistic corrections/holding costs.
7. Page-edge fade uses scroll-linked animations (Chrome/Edge only).
8. Reports Line view: last week label slightly cut (pre-existing).

## 9. Files changed on 2026-11-03 (evening rounds)
- **Backend:** `AuthController`, `AccountRequestController` (new), `StaffController`, `StockMovementController`, `RestockRequestController`, `RoleAccessService`, `EnsureActiveUser`, `User`, `AccountRequest` (new), `app/Support/{Totp, AccountSignout}.php` (new), `app/Mail/{AccountInviteMail, RestockRequestMail}.php` (new) + 2 email views, `bootstrap/app.php`, `config/auth.php`, `routes/web.php`, `routes/api.php`, `.env.example`, migration `2026_11_03_000003`.
- **Frontend:** Login (`Login.jsx`, `login.css`, `ResetPass/resetPass.jsx`, new `OtpInput.jsx`, `TwoFactorPrompt.jsx`, `RequestAccess.jsx`, `AccountSetup.jsx`, `authModal.css`), `layouts/App.jsx`, `app-error.css`, `styles/index.css`, `styles/polish.css`, `utils/{slidingTabs, mobileFolders}.js`, new `utils/{qrCode, simplePdf}.js`, LandingPage, Staffs (+ new `AccountRequests.jsx`), ReorderAlerts (`reorderAlerts.jsx/.css`, `bulkOrder.jsx`, `ReceiveDelivery.jsx`), StockControl (`.jsx/.css`), ProductSupplier css, TrashBin (`.jsx/.css`), Forecasting css, Reports css.
- **Tests (new):** `AccountRegistrationTest`, `TwoFactorLoginTest`, `ReorderReceiveTest`, `AccountSignoutTest`; updated `LoginTest`, `OtpVerificationTest`.

<?php

namespace App\Http\Controllers;

use App\Mail\AccountInviteMail;
use App\Models\AccountRequest;
use App\Models\ActivityLog;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * ===== ACCOUNT REGISTRATION WITH EMAIL VALIDATION + 2FA (2026-11-03) =====
 *
 * Step 1  Request   POST /auth/account-request (login page, no sign-in)
 *                   Work email + full name (department/role no longer
 *                   asked, 2026-11-11 — the Super Admin picks the role). The email
 *                   domain is checked (ACCOUNT_REQUEST_DOMAINS in .env).
 * Step 2  Approval  The Super Admin sees it (bell + Staffs → Account
 *                   requests) and clicks "Approve & Invite" (or Reject).
 * Step 3  Link      Approving makes a random secret (64 characters). Only
 *                   its SHA-256 hash is saved. The email link holds the
 *                   secret; it expires after 24 hours and works only once
 *                   and only in the first browser that opens it.
 * Step 4  Setup     The link opens /account/setup: the person sets a
 *                   password and scans a QR code with an authenticator app,
 *                   then types the 6-digit code. Only then is the account
 *                   made (2FA already on) and the link stops working.
 */
class AccountRequestController extends Controller
{
    /* ---------- Step 1: request (guest) ---------- */

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            // 2026-11-11: no longer asked on the form (the Super Admin picks
            // the role when approving). Still accepted if sent.
            'department' => ['nullable', 'string', 'max:120'],
        ], [
            'name.required' => 'Enter your full name.',
            'email.required' => 'Enter your work email.',
            'email.email' => 'Enter a valid email address.',
        ]);
        $email = strtolower(trim($data['email']));

        // Security check: only the company's email domain(s), when set.
        $domains = config('auth.account_request_domains', []);
        $domain = substr(strrchr($email, '@') ?: '', 1);
        if ($domains !== [] && ! in_array($domain, $domains, true)) {
            throw ValidationException::withMessages([
                'email' => 'Use your work email ('.implode(' or ', array_map(fn ($d) => '@'.$d, $domains)).').',
            ]);
        }

        $open = AccountRequest::whereRaw('LOWER(email) = ?', [$email])
            ->whereIn('status', [AccountRequest::PENDING, AccountRequest::APPROVED])
            ->first();
        if ($open) {
            throw ValidationException::withMessages([
                'email' => $open->status === AccountRequest::PENDING
                    ? 'A request for this email is already waiting for the Super Admin.'
                    : 'Your account was already created. Check your email for the verification link.',
            ]);
        }

        if (User::withTrashed()->whereRaw('LOWER(email) = ?', [$email])->exists()) {
            throw ValidationException::withMessages([
                'email' => 'This email already has an account. Sign in, or use "Forgot password?".',
            ]);
        }

        $accountRequest = AccountRequest::create([
            'name' => trim($data['name']),
            'email' => $email,
            'department' => trim((string) ($data['department'] ?? '')) ?: null,
            'status' => AccountRequest::PENDING,
        ]);
        ActivityLog::record('account.request', "{$accountRequest->name} requested an account ({$email})", 'user', [
            'accountRequestId' => $accountRequest->id,
            'email' => $email,
        ]);
        $this->notifyReviewers($accountRequest);

        return response()->json([
            'message' => 'Your request was sent. The Super Admin will review it, and you will get an email with a setup link once it is approved.',
        ], 201);
    }

    /**
     * 2026-11-12: email the people who manage accounts about a new request:
     * every active Super Admin, plus active Admins whose Role Access has
     * "Manage Staff" on. A failed email never stops the request.
     */
    private function notifyReviewers(AccountRequest $accountRequest): void
    {
        $when = now()->timezone(config('app.business_timezone', 'Asia/Manila'))->format('M j, Y g:i A');
        $reviewers = User::query()
            ->where('status', User::STATUS_ACTIVE)
            ->whereIn('role', [User::ROLE_SUPER_ADMIN, User::ROLE_ADMIN])
            ->get()
            ->filter(fn (User $user) => $user->isSuperAdmin()
                || \App\Services\RoleAccessService::allows($user, 'staff.manage'));

        foreach ($reviewers as $reviewer) {
            try {
                Mail::to($reviewer->email)->send(new \App\Mail\AccountRequestMail(
                    $accountRequest->name,
                    $accountRequest->email,
                    $when,
                    // 2026-11-12: Admins with "Approve account requests" may approve too.
                    $reviewer->isSuperAdmin() || \App\Services\RoleAccessService::allows($reviewer, 'staff.requests'),
                ));
            } catch (Throwable $exception) {
                Log::error('Account request email could not be sent. Check the MAIL_* settings in .env, then run php artisan config:clear.', [
                    'to' => $reviewer->email,
                    'exception' => $exception,
                ]);
            }
        }
    }

    /* ---------- Step 2: Super Admin review ---------- */

    /**
     * 2026-11-12: who may review requests. The Super Admin always; an Admin
     * only with Role Access "Approve account requests" (and then as Staff
     * only). Returns true for the Super Admin.
     */
    private function reviewer(Request $request): bool
    {
        $user = $request->user();
        if (\App\Services\RoleAccessService::isSuperAdmin($user)) {
            return true;
        }
        abort_unless(
            $user && $user->role === User::ROLE_ADMIN && \App\Services\RoleAccessService::allows($user, 'staff.requests'),
            403,
            'Only the Super Admin can review account requests.'
        );

        return false;
    }

    /** An Admin may not resend or cancel an invite that makes someone an Admin. */
    private function abortIfAdminInvite(bool $isSuperAdmin, AccountRequest $accountRequest): void
    {
        abort_if(! $isSuperAdmin && $accountRequest->role === User::ROLE_ADMIN, 403, 'Only the Super Admin can change an Admin invite.');
    }

    /** GET /staff/account-requests — pending first, then the latest others. */
    public function index(Request $request): JsonResponse
    {
        $this->reviewer($request);
        if (! \Illuminate\Support\Facades\Schema::hasTable('account_requests')) {
            // The 2026_11_03_000003 migration has not been run yet.
            return response()->json([
                'code' => 'migration_needed',
                'message' => 'Account requests are not set up yet. Run "php artisan migrate" in the Laragon terminal.',
            ], 503);
        }

        $requests = AccountRequest::query()
            ->orderByRaw("CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END")
            ->latest()
            ->limit(60)
            ->get()
            ->map(fn (AccountRequest $r) => $this->format($r));

        return response()->json($requests)->header('Cache-Control', 'no-store');
    }

    /** POST /staff/account-requests/{accountRequest}/approve  { role } */
    public function approve(Request $request, AccountRequest $accountRequest): JsonResponse
    {
        $isSuperAdmin = $this->reviewer($request);
        $data = $request->validate([
            'role' => ['required', Rule::in([User::ROLE_STAFF, User::ROLE_ADMIN])],
        ]);
        abort_if(! $isSuperAdmin && $data['role'] !== User::ROLE_STAFF, 403, 'Only the Super Admin can approve someone as Admin.');
        abort_unless($accountRequest->status === AccountRequest::PENDING, 422, 'This request was already approved, finished or rejected.');
        $existing = User::withTrashed()->whereRaw('LOWER(email) = ?', [strtolower($accountRequest->email)])->first();
        abort_if($existing !== null, 422, 'This email already has an account.');

        // 2026-11-03: approving CREATES the account at once (it shows in
        // Staffs). It cannot be used yet: it has a random password nobody
        // knows, and sign-in is blocked until the email link is clicked
        // (the link verifies the email, then sets the password + 2FA).
        $user = DB::transaction(function () use ($accountRequest, $data) {
            $user = new User([
                'name' => $accountRequest->name,
                'email' => $accountRequest->email,
                'password' => Str::random(48),
                'role' => $data['role'],
                'status' => User::STATUS_ACTIVE,
                'department' => $accountRequest->department,
            ]);
            $user->save();
            $accountRequest->forceFill(['user_id' => $user->id])->save();

            return $user;
        });

        $token = $this->issueToken($accountRequest, $request->user(), $data['role']);
        $sent = $this->sendInvite($accountRequest, $token);
        ActivityLog::record('account.approve', "Approved {$accountRequest->name} and created the account as ".($data['role'] === User::ROLE_ADMIN ? 'Admin' : 'Staff').' (waiting for email verification)', 'user', [
            'accountRequestId' => $accountRequest->id,
            'userId' => $user->id,
            'email' => $accountRequest->email,
            'emailed' => $sent,
        ]);

        return response()->json($this->format($accountRequest->fresh()) + [
            'emailed' => $sent,
            'message' => $sent
                ? "Account created for {$accountRequest->name}. A verification link was emailed to {$accountRequest->email} (valid for ".AccountRequest::LINK_HOURS.' hours). They can sign in after clicking it.'
                : 'Account created, but the verification email could not be sent. Fix the mail settings (.env), then click "Send link again".',
        ]);
    }

    /** POST /staff/account-requests/{accountRequest}/resend — new link, old one stops working. */
    public function resend(Request $request, AccountRequest $accountRequest): JsonResponse
    {
        $this->abortIfAdminInvite($this->reviewer($request), $accountRequest);
        abort_unless($accountRequest->status === AccountRequest::APPROVED, 422, 'Only approved requests can get a new link.');
        $token = $this->issueToken($accountRequest, $request->user(), $accountRequest->role ?: User::ROLE_STAFF);
        $sent = $this->sendInvite($accountRequest, $token);

        return response()->json($this->format($accountRequest->fresh()) + [
            'emailed' => $sent,
            'message' => $sent
                ? "A new verification link was emailed to {$accountRequest->email}. The old link no longer works."
                : 'The email could not be sent. Check the mail settings in .env (Gmail needs a 16-letter App Password) and try again.',
        ]);
    }

    /** POST /staff/account-requests/{accountRequest}/reject */
    public function reject(Request $request, AccountRequest $accountRequest): JsonResponse
    {
        $this->abortIfAdminInvite($this->reviewer($request), $accountRequest);
        abort_if($accountRequest->status === AccountRequest::COMPLETED, 422, 'This account was already set up.');
        // Cancelled after approval: the account that was made but never
        // verified is moved to the Trash Bin (it was never used).
        if ($accountRequest->status === AccountRequest::APPROVED && $accountRequest->user_id) {
            $created = User::find($accountRequest->user_id);
            if ($created) {
                $created->forceFill([
                    'status' => User::STATUS_INACTIVE,
                    'deleted_by' => $request->user()->id,
                    'deleted_by_name' => $request->user()->name ?: $request->user()->email,
                ])->save();
                $created->delete();
            }
        }
        $accountRequest->forceFill([
            'status' => AccountRequest::REJECTED,
            'token_hash' => null,
            'token_expires_at' => null,
            'two_factor_secret' => null,
            'reviewed_by' => $request->user()->id,
            'reviewed_by_name' => $request->user()->name,
            'reviewed_at' => now(),
        ])->save();
        ActivityLog::record('account.reject', "Rejected the account request of {$accountRequest->name}", 'user', [
            'accountRequestId' => $accountRequest->id,
            'email' => $accountRequest->email,
        ]);

        return response()->json($this->format($accountRequest->fresh()));
    }

    /* ---------- Steps 3 + 4: the setup link (guest) ---------- */

    /**
     * POST /auth/account-setup/check  { token }
     * Checks the link and returns the name/email and the QR code data. The
     * first browser to open it "claims" it; any other browser is refused,
     * so a forwarded link is useless.
     */
    public function check(Request $request): JsonResponse
    {
        $request->validate(['token' => ['required', 'string', 'size:64']]);
        $accountRequest = $this->findByToken($request, $request->input('token'), claim: true);

        if (! $accountRequest->two_factor_secret) {
            $accountRequest->forceFill(['two_factor_secret' => Totp::newSecret()])->save();
        }
        $secret = $accountRequest->two_factor_secret;
        // Label in the authenticator app: the system's name (Settings).
        $issuer = \App\Models\AppSetting::systemName();

        return response()->json([
            'name' => $accountRequest->name,
            'email' => $accountRequest->email,
            'role' => $accountRequest->role === User::ROLE_ADMIN ? 'Admin' : 'Staff',
            'expiresAt' => $accountRequest->token_expires_at?->toIso8601String(),
            'twoFactor' => [
                'secret' => trim(chunk_split($secret, 4, ' ')),
                'uri' => Totp::uri($secret, $accountRequest->email, $issuer),
            ],
        ]);
    }

    /** POST /auth/account-setup/complete  { token, password, password_confirmation, code } */
    public function complete(Request $request): JsonResponse
    {
        // 2026-11-12: method "email" = no authenticator app; every sign-in
        // emails a code instead. No code is typed here: opening this one-time
        // link from the inbox already proved the email belongs to the person.
        $viaEmail = $request->input('method') === 'email';
        $data = $request->validate([
            'token' => ['required', 'string', 'size:64'],
            // 2026-11-12: 8+ characters, no spaces. Numbers and special characters
            // are suggested on the screen but not required.
            'password' => ['required', 'confirmed', Password::min(8), 'not_regex:/\s/'],
            'method' => ['nullable', Rule::in(['app', 'email'])],
            'code' => [$viaEmail ? 'nullable' : 'required', 'digits:6'],
        ], [
            'password.confirmed' => 'The two passwords do not match.',
            'password.not_regex' => 'The password cannot contain spaces.',
            'code.required' => 'Enter the 6-digit code from your authenticator app.',
            'code.digits' => 'The code must be exactly 6 numbers.',
        ]);

        $user = DB::transaction(function () use ($request, $data, $viaEmail) {
            $accountRequest = $this->findByToken($request, $data['token'], claim: false, lock: true);
            $secret = $accountRequest->two_factor_secret;
            if (! $viaEmail && (! $secret || Totp::verify($secret, (string) $data['code']) === null)) {
                throw ValidationException::withMessages([
                    'code' => 'That code is incorrect. Make sure you scanned the QR code on this page, then type the newest 6-digit code.',
                ]);
            }
            // The account was made on approval; older approvals (before this
            // change) have none yet, so it is made here instead.
            $user = $accountRequest->user_id ? User::find($accountRequest->user_id) : null;
            if (! $user) {
                if (User::withTrashed()->whereRaw('LOWER(email) = ?', [strtolower($accountRequest->email)])->exists()) {
                    throw ValidationException::withMessages(['token' => 'This account is no longer available. Ask the Super Admin.']);
                }
                $user = new User([
                    'name' => $accountRequest->name,
                    'email' => $accountRequest->email,
                    'role' => $accountRequest->role ?: User::ROLE_STAFF,
                    'status' => User::STATUS_ACTIVE,
                    'department' => $accountRequest->department,
                ]);
            }
            if ($user->status !== User::STATUS_ACTIVE) {
                throw ValidationException::withMessages(['token' => 'This account was deactivated. Ask the Super Admin.']);
            }
            $user->password = $data['password'];
            $user->forceFill([
                'email_verified_at' => now(),           // the link proved the email is theirs
                'two_factor_secret' => $viaEmail ? null : $secret,
                'two_factor_confirmed_at' => $viaEmail ? null : now(),
            ])->save();
            if ($viaEmail) {
                \App\Models\AppSetting::put($user->emailTwoFactorKey(), '1');
            }

            // One-time: the link and the pending secret are wiped.
            $accountRequest->forceFill([
                'status' => AccountRequest::COMPLETED,
                'token_hash' => null,
                'token_expires_at' => null,
                'claimed_session_hash' => null,
                'two_factor_secret' => null,
                'completed_at' => now(),
                'user_id' => $user->id,
            ])->save();

            return $user;
        });

        ActivityLog::record('account.setup', "{$user->name} finished the account setup (password + ".($viaEmail ? 'email codes' : 'authenticator app').')', 'user', [
            'email' => $user->email,
            'role' => $user->role,
        ], $user->id);

        return response()->json([
            'message' => $viaEmail
                ? 'Your account is ready. Sign in with your email and new password, then type the code we email you.'
                : 'Your account is ready. Sign in with your email, your new password and the code from your authenticator app.',
        ]);
    }

    /**
     * POST /auth/account-setup/resend  { email } — "Send the link again" on
     * the login page, for an account that is still waiting for email
     * verification. Same answer whether or not the email exists.
     */
    public function resendFromLogin(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255']]);
        $accountRequest = AccountRequest::whereRaw('LOWER(email) = ?', [strtolower(trim($data['email']))])
            ->where('status', AccountRequest::APPROVED)
            ->latest()
            ->first();
        $answer = ['message' => 'If this account is waiting for verification, a new link has been emailed. Check your inbox and spam folder.'];
        if (! $accountRequest) {
            return response()->json($answer);
        }

        $reviewer = $accountRequest->reviewed_by ? User::find($accountRequest->reviewed_by) : null;
        $token = Str::random(64);
        $accountRequest->forceFill([
            'token_hash' => AccountRequest::hashToken($token),
            'token_expires_at' => now()->addHours(AccountRequest::LINK_HOURS),
            'claimed_session_hash' => null,
            'claimed_at' => null,
            'two_factor_secret' => null,
        ])->save();
        if (! $this->sendInvite($accountRequest, $token)) {
            return response()->json(['message' => 'The email could not be sent right now. Please tell the Super Admin.'], 503);
        }
        ActivityLog::record('account.resend', "Sent a new verification link to {$accountRequest->email} (asked from the login page)", 'user', [
            'accountRequestId' => $accountRequest->id,
        ], $reviewer?->id);

        return response()->json($answer);
    }

    /** True while an account made on approval has not been verified yet. */
    public static function isWaitingForVerification(User $user): bool
    {
        try {
            return AccountRequest::where('user_id', $user->id)
                ->where('status', AccountRequest::APPROVED)
                ->exists();
        } catch (\Throwable) {
            return false;   // table missing (migration not run): never block
        }
    }

    /* ---------- helpers ---------- */

    private function issueToken(AccountRequest $accountRequest, User $reviewer, string $role): string
    {
        $token = Str::random(64);
        $accountRequest->forceFill([
            'status' => AccountRequest::APPROVED,
            'role' => $role,
            'token_hash' => AccountRequest::hashToken($token),
            'token_expires_at' => now()->addHours(AccountRequest::LINK_HOURS),
            'claimed_session_hash' => null,
            'claimed_at' => null,
            'two_factor_secret' => null,
            'reviewed_by' => $reviewer->id,
            'reviewed_by_name' => $reviewer->name,
            'reviewed_at' => now(),
        ])->save();

        return $token;
    }

    private function sendInvite(AccountRequest $accountRequest, string $token): bool
    {
        $link = rtrim((string) config('app.url'), '/').'/account/setup?token='.$token;
        try {
            Mail::to($accountRequest->email)->send(new AccountInviteMail($accountRequest->name, $link, AccountRequest::LINK_HOURS));

            return true;
        } catch (Throwable $exception) {
            Log::error('Account setup link could not be emailed. Check the MAIL_* settings in .env (Gmail needs a 16-letter App Password), then run php artisan config:clear.', [
                'exception' => $exception->getMessage(),
            ]);

            return false;
        }
    }

    /** Find the approved request for a link secret, or stop with a clear message. */
    private function findByToken(Request $request, string $token, bool $claim, bool $lock = false): AccountRequest
    {
        $query = AccountRequest::where('token_hash', AccountRequest::hashToken($token));
        $accountRequest = ($lock ? $query->lockForUpdate() : $query)->first();

        if (! $accountRequest || $accountRequest->status !== AccountRequest::APPROVED) {
            throw ValidationException::withMessages(['token' => 'This setup link is not valid or was already used. Ask the Super Admin to send a new one.']);
        }
        if (! $accountRequest->token_expires_at || now()->greaterThan($accountRequest->token_expires_at)) {
            throw ValidationException::withMessages(['token' => 'This setup link has expired (links last '.AccountRequest::LINK_HOURS.' hours). Ask the Super Admin to send a new one.']);
        }

        $sessionHash = hash('sha256', 'account-setup|'.$request->session()->getId());
        if ($accountRequest->claimed_session_hash === null) {
            if (! $claim) {
                throw ValidationException::withMessages(['token' => 'Open the setup link from your email first.']);
            }
            $accountRequest->forceFill(['claimed_session_hash' => $sessionHash, 'claimed_at' => now()])->save();
        } elseif (! hash_equals($accountRequest->claimed_session_hash, $sessionHash)) {
            throw ValidationException::withMessages(['token' => 'This setup link was already opened in another browser, so it cannot be used here. Ask the Super Admin to send a new one.']);
        }

        return $accountRequest;
    }

    private function format(AccountRequest $r): array
    {
        return [
            'id' => $r->id,
            'name' => $r->name,
            'email' => $r->email,
            'department' => $r->department,
            'status' => $r->status,
            'role' => $r->role,
            'linkExpiresAt' => $r->status === AccountRequest::APPROVED ? $r->token_expires_at?->toIso8601String() : null,
            'linkOpened' => $r->claimed_at !== null,
            'accountCreated' => $r->user_id !== null,
            'reviewedBy' => $r->reviewed_by_name,
            'reviewedAt' => $r->reviewed_at?->toIso8601String(),
            'completedAt' => $r->completed_at?->toIso8601String(),
            'createdAt' => $r->created_at?->toIso8601String(),
        ];
    }
}

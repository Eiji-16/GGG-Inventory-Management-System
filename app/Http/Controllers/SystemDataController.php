<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Services\SystemDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Settings → Data & System (Super Admin only — checked by the route's
 * "role:super_admin" middleware AND again here).
 *
 *   GET  /api/system/overview  how many rows each part of the data has
 *   POST /api/system/export    download a full backup          (password)
 *   POST /api/system/import    replace all data with a backup  (password + phrase)
 *   POST /api/system/reset     erase the chosen parts          (password + phrase)
 *
 * Every attempt (allowed or refused) is written to the activity history,
 * the routes are rate-limited, and a safety copy of the current data is
 * saved on the server before any import or reset.
 */
class SystemDataController extends Controller
{
    public const RESET_PHRASE = 'RESET GGG INVENTORY';
    public const IMPORT_PHRASE = 'IMPORT GGG BACKUP';

    public function __construct(private readonly SystemDataService $system) {}

    public function overview(Request $request): JsonResponse
    {
        $this->ensureOwner($request);

        return response()->json($this->system->overview() + [
            'resetPhrase' => self::RESET_PHRASE,
            'importPhrase' => self::IMPORT_PHRASE,
        ]);
    }

    public function export(Request $request): Response
    {
        $this->ensureOwner($request);
        $this->confirmPassword($request, 'export');

        $file = $this->system->export($request->user());
        $name = 'ggg-backup-'.now()->format('Y-m-d_His').'.gggbackup';
        ActivityLog::record('system.export', 'Exported a full database backup', 'download', ['file' => $name, 'bytes' => strlen($file)]);

        return response($file, 200, [
            'Content-Type' => 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="'.$name.'"',
            'Cache-Control' => 'no-store',
            'X-Backup-File' => $name,
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        $this->ensureOwner($request);
        $file = $request->file('backup');
        if ($file && ! $file->isValid()) {
            // Usually PHP's upload size limit (upload_max_filesize / post_max_size in php.ini).
            throw ValidationException::withMessages(['backup' => 'The file could not be uploaded: '.$file->getErrorMessage()]);
        }
        $request->validate([
            'backup' => ['required', 'file'],
        ], ['backup.required' => 'Choose a backup file (.gggbackup) to import.']);
        $this->confirmPassword($request, 'import');
        $this->confirmPhrase($request, self::IMPORT_PHRASE, 'import');

        try {
            $backup = $this->system->readBackup((string) file_get_contents($file->getRealPath()));
        } catch (RuntimeException $error) {
            ActivityLog::record('system.denied', 'Refused a backup import: '.$error->getMessage(), 'shield');
            throw ValidationException::withMessages(['backup' => $error->getMessage()]);
        }

        $by = $request->user();
        $safetyCopy = $this->system->saveSafetyCopy($by, 'import');
        $this->system->import($backup);

        // The accounts were replaced too, so everyone signs in again.
        ActivityLog::record('system.import', "Imported a database backup (made {$this->madeAt($backup['meta'])}) — {$by->name}", 'upload', [
            'by' => $by->name,
            'email' => $by->email,
            'backupCreatedAt' => $backup['meta']['createdAt'] ?? null,
            'safetyCopy' => $safetyCopy,
        ], userId: null);
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'The backup was imported. Please log in again.',
            'loggedOut' => true,
            'safetyCopy' => $safetyCopy,
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $this->ensureOwner($request);
        $request->validate([
            'groups' => ['required', 'array', 'min:1'],
            'groups.*' => ['string', 'in:'.implode(',', array_keys(SystemDataService::RESET_GROUPS))],
        ], ['groups.required' => 'Choose at least one part of the data to erase.']);
        $this->confirmPassword($request, 'reset');
        $this->confirmPhrase($request, self::RESET_PHRASE, 'reset');

        $by = $request->user();
        $groups = $this->system->resolveGroups($request->input('groups'));
        $safetyCopy = $this->system->saveSafetyCopy($by, 'reset');
        $erased = $this->system->reset($groups, $by);

        // Written after the reset, so it survives even when history was erased.
        ActivityLog::record('system.reset', 'System reset: erased '.implode(', ', array_map(
            fn ($group) => SystemDataService::RESET_GROUPS[$group]['label'], $groups
        )), 'trash', ['groups' => $groups, 'erased' => $erased, 'safetyCopy' => $safetyCopy]);

        return response()->json([
            'message' => 'The selected data was erased.',
            'groups' => $groups,
            'erased' => $erased,
            'safetyCopy' => $safetyCopy,
        ]);
    }

    /* ---------------------------------------------------------------------- */

    /** Second check after the route middleware: only an active Super Admin. */
    private function ensureOwner(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && $user->isSuperAdmin() && $user->status === 'active', 403, 'Only the Super Admin can do this.');
    }

    private function confirmPassword(Request $request, string $action): void
    {
        $request->validate(['password' => ['required', 'string']], ['password.required' => 'Enter your password to continue.']);
        if (! Hash::check((string) $request->input('password'), $request->user()->password)) {
            ActivityLog::record('system.denied', "Wrong password on System {$action}", 'shield', ['action' => $action, 'ip' => $request->ip()]);
            throw ValidationException::withMessages(['password' => 'Your password is incorrect.']);
        }
    }

    private function confirmPhrase(Request $request, string $phrase, string $action): void
    {
        if (trim((string) $request->input('confirmPhrase')) !== $phrase) {
            ActivityLog::record('system.denied', "Wrong confirm phrase on System {$action}", 'shield', ['action' => $action]);
            throw ValidationException::withMessages(['confirmPhrase' => "Type {$phrase} exactly (capital letters) to confirm."]);
        }
    }

    private function madeAt(array $meta): string
    {
        try {
            return \Illuminate\Support\Carbon::parse($meta['createdAt'] ?? '')->format('M j, Y g:i A');
        } catch (\Throwable) {
            return 'unknown date';
        }
    }
}

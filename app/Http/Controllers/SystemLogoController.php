<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * The picture shown at the top of the sidebar (in place of the default icon).
 *
 * One picture for the whole system. Only the Super Admin can choose or remove
 * it. The file is kept on the private "local" disk (storage/app) and its path
 * is saved in app_settings under the key "logo" — no database column needed.
 */
class SystemLogoController extends Controller
{
    private const FOLDER = 'branding';

    /** GET /branding/logo — the picture itself. */
    public function show(): Response
    {
        $path = AppSetting::get('logo');
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, [
            'Cache-Control' => 'private, max-age=31536000',
        ]);
    }

    /** POST /branding/logo — choose a new picture (Super Admin only). */
    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isSuperAdmin(), 403, 'Only the Super Admin can change the system logo.');

        $request->validate([
            'logo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:2048'],
        ], [
            'logo.max' => 'The picture must be 2 MB or smaller.',
            'logo.image' => 'Please choose an image file (JPG, PNG, WEBP or GIF).',
            'logo.mimes' => 'Please choose a JPG, PNG, WEBP or GIF picture.',
        ]);

        $old = AppSetting::get('logo');
        $path = $request->file('logo')->store(self::FOLDER, 'local');
        AppSetting::put('logo', $path);
        if ($old && $old !== $path) {
            Storage::disk('local')->delete($old);
        }

        ActivityLog::record('settings.logo', 'Changed the system logo', 'settings');

        return response()->json(['logoUrl' => AppSetting::logoUrl()]);
    }

    /** DELETE /branding/logo — go back to the default icon (Super Admin only). */
    public function destroy(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isSuperAdmin(), 403, 'Only the Super Admin can change the system logo.');

        $old = AppSetting::get('logo');
        AppSetting::put('logo', null);
        if ($old) {
            Storage::disk('local')->delete($old);
        }

        ActivityLog::record('settings.logo', 'Removed the system logo', 'settings');

        return response()->json(['logoUrl' => null]);
    }
}

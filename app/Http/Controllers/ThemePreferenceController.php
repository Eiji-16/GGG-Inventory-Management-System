<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

/**
 * PUT /profile/theme — the signed-in user's own Appearance theme.
 *
 * Saved on the account (not the browser), so one user's choice never
 * changes the theme for anyone else, even on a shared computer.
 */
class ThemePreferenceController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'theme' => ['required', 'string', Rule::in(User::THEMES)],
        ]);

        // The "theme" column is added by a migration. Without it, say what to do
        // instead of failing with a database error.
        if (! Schema::hasColumn('users', 'theme')) {
            return response()->json([
                'message' => 'Themes cannot be saved yet. Run "php artisan migrate" once, then choose the theme again.',
            ], 409);
        }

        $request->user()->forceFill(['theme' => $data['theme']])->save();

        return response()->json(['theme' => $data['theme']]);
    }
}

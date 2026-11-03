<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalculationController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SystemLogoController;
use Illuminate\Support\Facades\Route;

// Limited to stop password guessing (see AppServiceProvider, "login").
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::get('/auth/user', [AuthController::class, 'currentUser'])->middleware(['auth', 'active']);
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth');
// Each limit has its own counter (the 3rd value), so checking a code does
// not use up the "send a code" limit.
Route::post('/auth/password/otp', [AuthController::class, 'sendPasswordResetOtp'])->middleware('throttle:3,1,otp-send');
Route::post('/auth/password/otp/verify', [AuthController::class, 'verifyPasswordResetOtp'])->middleware('throttle:10,1,otp-verify');
Route::post('/auth/password/reset', [AuthController::class, 'resetPasswordWithOtp'])->middleware('throttle:10,1,otp-reset');

// 2FA: second step of signing in (authenticator-app code).
Route::post('/auth/two-factor', [AuthController::class, 'verifyTwoFactor'])->middleware('throttle:10,1,two-factor');

// Account registration: request (login page) and the emailed setup link.
Route::post('/auth/account-request', [\App\Http\Controllers\AccountRequestController::class, 'store'])->middleware('throttle:5,10,account-request');
Route::post('/auth/account-setup/check', [\App\Http\Controllers\AccountRequestController::class, 'check'])->middleware('throttle:20,1,account-setup');
Route::post('/auth/account-setup/resend', [\App\Http\Controllers\AccountRequestController::class, 'resendFromLogin'])->middleware('throttle:3,10,account-setup-resend');
Route::post('/auth/account-setup/complete', [\App\Http\Controllers\AccountRequestController::class, 'complete'])->middleware('throttle:10,1,account-setup-done');

// Staff management (Staffs tab) — session-authed, Super-Admin enforced in-controller.
Route::middleware(['auth', 'active'])->group(function () {
    Route::get('/staff', [StaffController::class, 'index']);
    // Account requests (Super Admin): approve & invite, send the link again, reject.
    Route::middleware('role:super_admin')->group(function () {
        Route::get('/staff/account-requests', [\App\Http\Controllers\AccountRequestController::class, 'index']);
        Route::post('/staff/account-requests/{accountRequest}/approve', [\App\Http\Controllers\AccountRequestController::class, 'approve']);
        Route::post('/staff/account-requests/{accountRequest}/resend', [\App\Http\Controllers\AccountRequestController::class, 'resend']);
        Route::post('/staff/account-requests/{accountRequest}/reject', [\App\Http\Controllers\AccountRequestController::class, 'reject']);
        Route::delete('/staff/{user}/two-factor', [StaffController::class, 'resetTwoFactor']);
    });
    Route::post('/staff', [StaffController::class, 'store']);
    Route::match(['put', 'patch'], '/staff/{user}', [StaffController::class, 'update']);
    Route::delete('/staff/{user}', [StaffController::class, 'destroy']);
    // A staff account's profile photo (Super Admin, checked in the controller).
    Route::get('/staff/{user}/avatar', [StaffController::class, 'avatar']);
    Route::post('/staff/{user}/avatar', [StaffController::class, 'storeAvatar']);
    Route::delete('/staff/{user}/avatar', [StaffController::class, 'destroyAvatar']);

    // The signed-in user's own profile, password, and activity feed.
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::match(['put', 'patch'], '/profile', [ProfileController::class, 'update']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::get('/profile/activity', [ProfileController::class, 'activity']);
    // Your own Appearance theme (saved per account, see ThemePreferenceController).
    Route::put('/profile/theme', [\App\Http\Controllers\ThemePreferenceController::class, 'update']);
    // Your own profile photo (separate from the system logo).
    Route::get('/profile/avatar', [ProfileController::class, 'avatar']);
    Route::post('/profile/avatar', [ProfileController::class, 'storeAvatar']);
    Route::delete('/profile/avatar', [ProfileController::class, 'destroyAvatar']);

    // A product's photo (product lists send this link instead of the photo).
    Route::get('/products/{code}/image', [\App\Http\Controllers\ProductController::class, 'image']);

    // Sidebar picture: everyone signed in can see it; only the Super Admin
    // can change or remove it (checked in the controller).
    Route::get('/branding/logo', [SystemLogoController::class, 'show']);
    Route::post('/branding/logo', [SystemLogoController::class, 'store']);
    Route::delete('/branding/logo', [SystemLogoController::class, 'destroy']);

});

// Order Quantity Calculator: allowed by Role Access (Settings); identify the authenticated user server-side.
Route::middleware(['auth', 'active', 'feature:calculator.use'])->group(function () {
    Route::post('/calculations', [CalculationController::class, 'store']);
});

// This forces Laravel to look for your main React index view
Route::get('{any}', function () {
    return view('welcome'); // Or change 'welcome' to the specific name of your blade file if different
})->where('any', '.*');

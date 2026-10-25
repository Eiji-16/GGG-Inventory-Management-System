<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalculationController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\StaffController;
use App\Http\Controllers\SystemLogoController;
use Illuminate\Support\Facades\Route;

// Limited to stop password guessing (see AppServiceProvider, "login").
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::get('/auth/user', [AuthController::class, 'currentUser'])->middleware('auth');
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth');
Route::post('/auth/password/otp', [AuthController::class, 'sendPasswordResetOtp'])->middleware('throttle:3,1');
Route::post('/auth/password/reset', [AuthController::class, 'resetPasswordWithOtp'])->middleware('throttle:10,1');

// Staff management (Staffs tab) — session-authed, Super-Admin enforced in-controller.
Route::middleware('auth')->group(function () {
    Route::get('/staff', [StaffController::class, 'index']);
    Route::post('/staff', [StaffController::class, 'store']);
    Route::match(['put', 'patch'], '/staff/{user}', [StaffController::class, 'update']);
    Route::delete('/staff/{user}', [StaffController::class, 'destroy']);

    // The signed-in user's own profile, password, and activity feed.
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::match(['put', 'patch'], '/profile', [ProfileController::class, 'update']);
    Route::post('/profile/password', [ProfileController::class, 'changePassword']);
    Route::get('/profile/activity', [ProfileController::class, 'activity']);
    // Your own profile photo (separate from the system logo).
    Route::get('/profile/avatar', [ProfileController::class, 'avatar']);
    Route::post('/profile/avatar', [ProfileController::class, 'storeAvatar']);
    Route::delete('/profile/avatar', [ProfileController::class, 'destroyAvatar']);

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

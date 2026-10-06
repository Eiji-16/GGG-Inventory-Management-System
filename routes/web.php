<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\StaffController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/auth/user', [AuthController::class, 'currentUser'])->middleware('auth');
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth');
Route::post('/auth/users', [AuthController::class, 'createAccount'])->middleware('auth');
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
});

// This forces Laravel to look for your main React index view
Route::get('{any}', function () {
    return view('welcome'); // Or change 'welcome' to the specific name of your blade file if different
})->where('any', '.*');

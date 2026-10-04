<?php

use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/auth/user', [AuthController::class, 'currentUser'])->middleware('auth');
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth');
Route::post('/auth/users', [AuthController::class, 'createAccount'])->middleware('auth');
Route::post('/auth/password/otp', [AuthController::class, 'sendPasswordResetOtp'])->middleware('throttle:3,1');
Route::post('/auth/password/reset', [AuthController::class, 'resetPasswordWithOtp'])->middleware('throttle:10,1');

// This forces Laravel to look for your main React index view
Route::get('{any}', function () {
    return view('welcome'); // Or change 'welcome' to the specific name of your blade file if different
})->where('any', '.*');

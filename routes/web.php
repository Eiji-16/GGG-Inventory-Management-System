<?php

use Illuminate\Support\Facades\Route;

// This forces Laravel to look for your main React index view
Route::get('{any}', function () {
    return view('welcome'); // Or change 'welcome' to the specific name of your blade file if different
})->where('any', '.*');

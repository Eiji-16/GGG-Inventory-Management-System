<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * CustomFormula — a user-defined Auto Calculator formula.
 *
 * `fields` is a JSON array of { key, label, unit } objects that drives the
 * dynamic input form; `expression` is the math evaluated against those keys.
 */
class CustomFormula extends Model
{
    protected $fillable = [
        'name',
        'full_name',
        'description',
        'expression',
        'result_unit',
        'fields',
    ];

    protected $casts = [
        'fields' => 'array',
    ];
}

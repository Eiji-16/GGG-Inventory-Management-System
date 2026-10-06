<?php

namespace App\Http\Controllers;

use App\Models\CustomFormula;
use App\Services\FormulaEvaluator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CustomFormulaController — /api/formulas
 *
 * CRUD for user-defined Auto Calculator formulas, plus a /compute endpoint that
 * evaluates a formula's expression against submitted inputs. The number and
 * identity of inputs is driven entirely by each formula's stored `fields`, so
 * the calculator adapts to whatever formula is selected.
 */
class CustomFormulaController extends Controller
{
    public function __construct(private readonly FormulaEvaluator $evaluator)
    {
    }

    /** GET /api/formulas */
    public function index(): JsonResponse
    {
        $formulas = CustomFormula::orderBy('name')->get();

        return response()->json($formulas->map(fn (CustomFormula $f) => $this->format($f)));
    }

    /** POST /api/formulas */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);
        $this->evaluator->assertValid($data['expression'], array_column($data['fields'], 'key'));

        $formula = CustomFormula::create([
            'name'        => $data['name'],
            'full_name'   => $data['fullName'],
            'description' => $data['description'] ?? null,
            'expression'  => $data['expression'],
            'result_unit' => $data['resultUnit'] ?? 'units',
            'fields'      => $data['fields'],
        ]);

        \App\Models\ActivityLog::record('formula.create', "Added formula — {$formula->full_name}", 'calculator', ['formula' => $formula->name]);

        return response()->json($this->format($formula), 201);
    }

    /** PUT/PATCH /api/formulas/{customFormula} */
    public function update(Request $request, CustomFormula $customFormula): JsonResponse
    {
        $data = $this->validatePayload($request, $customFormula->id);
        $this->evaluator->assertValid($data['expression'], array_column($data['fields'], 'key'));

        $customFormula->update([
            'name'        => $data['name'],
            'full_name'   => $data['fullName'],
            'description' => $data['description'] ?? null,
            'expression'  => $data['expression'],
            'result_unit' => $data['resultUnit'] ?? 'units',
            'fields'      => $data['fields'],
        ]);

        return response()->json($this->format($customFormula->fresh()));
    }

    /** DELETE /api/formulas/{customFormula} */
    public function destroy(CustomFormula $customFormula): JsonResponse
    {
        $customFormula->delete();

        return response()->json(['deleted' => true]);
    }

    /**
     * POST /api/formulas/{customFormula}/compute
     * Evaluate this formula against the submitted inputs (keyed by field key).
     */
    public function compute(Request $request, CustomFormula $customFormula): JsonResponse
    {
        $keys = array_column($customFormula->fields, 'key');

        $rules = ['inputs' => ['required', 'array']];
        foreach ($keys as $key) {
            $rules["inputs.{$key}"] = ['required', 'numeric'];
        }
        $validated = $request->validate($rules);

        $variables = [];
        foreach ($keys as $key) {
            $variables[$key] = (float) $validated['inputs'][$key];
        }

        $result = $this->evaluator->evaluate($customFormula->expression, $variables);

        \App\Models\ActivityLog::record(
            'formula.compute',
            "Computed {$customFormula->name} — ".round($result, 2)." {$customFormula->result_unit}",
            'calculator',
            ['formula' => $customFormula->name, 'result' => $result]
        );

        return response()->json([
            'formula' => $this->format($customFormula),
            'inputs'  => $variables,
            'result'  => $result,
            'unit'    => $customFormula->result_unit ?? 'units',
        ]);
    }

    /** Shared validation for store/update. */
    private function validatePayload(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'name'          => ['required', 'string', 'max:255', Rule::unique('custom_formulas', 'name')->ignore($ignoreId)],
            'fullName'      => ['required', 'string', 'max:255'],
            'description'   => ['nullable', 'string', 'max:1000'],
            'expression'    => ['required', 'string', 'max:1000'],
            'resultUnit'    => ['nullable', 'string', 'max:50'],
            'fields'        => ['required', 'array', 'min:1'],
            'fields.*.key'  => ['required', 'string', 'max:50', 'regex:/^[A-Za-z_][A-Za-z0-9_]*$/'],
            'fields.*.label'=> ['required', 'string', 'max:255'],
            'fields.*.unit' => ['nullable', 'string', 'max:50'],
        ], [
            'fields.*.key.regex' => 'Each field key must start with a letter or underscore and contain only letters, numbers, and underscores.',
        ]);

        // Field keys must be unique within a formula.
        $keys = array_column($data['fields'], 'key');
        if (count($keys) !== count(array_unique($keys))) {
            throw ValidationException::withMessages([
                'fields' => 'Each input field must have a unique key.',
            ]);
        }

        // Normalise fields to just the stored shape.
        $data['fields'] = array_map(fn ($f) => [
            'key'   => $f['key'],
            'label' => $f['label'],
            'unit'  => $f['unit'] ?? '',
        ], $data['fields']);

        return $data;
    }

    /** Shape a formula for the frontend (camelCase, matching the EOQ default). */
    private function format(CustomFormula $f): array
    {
        return [
            'id'          => $f->id,
            'name'        => $f->name,
            'fullName'    => $f->full_name,
            'description' => $f->description,
            'formula'     => $f->expression,
            'resultUnit'  => $f->result_unit ?? 'units',
            'fields'      => array_map(fn ($field) => [
                'key'         => $field['key'],
                'label'       => $field['label'],
                'unit'        => $field['unit'] ?? '',
                'placeholder' => '',
            ], $f->fields),
            'custom'      => true,
        ];
    }
}

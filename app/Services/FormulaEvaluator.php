<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;

/**
 * FormulaEvaluator — safely evaluates a custom formula expression against a set
 * of named input variables. No eval(); a small shunting-yard parser handles the
 * operators the Add Formula modal allows: + - * / × ÷ ^ and √ / sqrt().
 *
 * Variable names are the field keys (e.g. d, L, SS, demand). Matching is
 * case-sensitive to mirror maths conventions (D vs d).
 */
class FormulaEvaluator
{
    /**
     * @param  array<string, float>  $variables  keyed by field key
     */
    public function evaluate(string $expression, array $variables): float
    {
        $tokens = $this->tokenize($expression, $variables);
        $rpn = $this->toRpn($tokens);

        return $this->evalRpn($rpn);
    }

    /** Validate that an expression only references known keys and parses. */
    public function assertValid(string $expression, array $fieldKeys): void
    {
        // Dummy values (1.0) just to exercise the parser for syntax/unknown refs.
        $vars = array_fill_keys($fieldKeys, 1.0);

        try {
            $tokens = $this->tokenize($expression, $vars);
            $this->toRpn($tokens);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            throw ValidationException::withMessages([
                'expression' => 'The formula expression could not be parsed: '.$e->getMessage(),
            ]);
        }
    }

    /** @return array<int, array{type: string, value: mixed}> */
    private function tokenize(string $expression, array $variables): array
    {
        // Normalise the pretty symbols the UI uses into plain operators.
        $normalized = strtr($expression, [
            '×' => '*',
            '·' => '*',
            '÷' => '/',
            '−' => '-',   // unicode minus
            '√' => ' sqrt ',
        ]);

        // Insert explicit * for implicit multiplication so this evaluator agrees
        // with the frontend (mathjs). The frontend already canonicalises before
        // saving; this keeps direct API calls / legacy data working too.
        //   2D -> 2*D,  2( -> 2*(,  2sqrt(x) -> 2*sqrt(x)
        $normalized = preg_replace('/(\d)\s*([A-Za-z_(])/', '$1*$2', $normalized);
        //   )( -> )*(,  )D -> )*D,  )2 -> )*2
        $normalized = preg_replace('/(\))\s*([A-Za-z0-9_(])/', '$1*$2', $normalized);
        // Space-separated values: "2 D S" / "D S" -> "2*D*S" / "D*S". Lookahead
        // keeps the right-hand token so overlapping runs all get an operator.
        $normalized = preg_replace('/([A-Za-z0-9_])\s+(?=[A-Za-z0-9_])/', '$1*', $normalized);
        // Variable immediately before "(" means multiply — e.g. D(a+b) -> D*(a+b).
        // Real function calls (sqrt(...)) must be left intact, so skip the whitelist.
        $normalized = preg_replace_callback(
            '/([A-Za-z_][A-Za-z0-9_]*)\s*\(/',
            fn ($m) => $m[1] === 'sqrt' ? $m[1].'(' : $m[1].'*(',
            $normalized
        );

        $tokens = [];
        $len = strlen($normalized);
        $i = 0;

        while ($i < $len) {
            $ch = $normalized[$i];

            if (ctype_space($ch)) {
                $i++;
                continue;
            }

            // Number (integer or decimal).
            if (ctype_digit($ch) || ($ch === '.' && $i + 1 < $len && ctype_digit($normalized[$i + 1]))) {
                $num = '';
                while ($i < $len && (ctype_digit($normalized[$i]) || $normalized[$i] === '.')) {
                    $num .= $normalized[$i];
                    $i++;
                }
                $tokens[] = ['type' => 'num', 'value' => (float) $num];
                continue;
            }

            // Identifier: a function (sqrt) or a variable key.
            if (ctype_alpha($ch) || $ch === '_') {
                $name = '';
                while ($i < $len && (ctype_alnum($normalized[$i]) || $normalized[$i] === '_')) {
                    $name .= $normalized[$i];
                    $i++;
                }
                if ($name === 'sqrt') {
                    $tokens[] = ['type' => 'func', 'value' => 'sqrt'];
                } elseif (array_key_exists($name, $variables)) {
                    $tokens[] = ['type' => 'num', 'value' => (float) $variables[$name]];
                } else {
                    throw ValidationException::withMessages([
                        'expression' => "Unknown symbol \"{$name}\" in the formula. Add it as an input field or fix the expression.",
                    ]);
                }
                continue;
            }

            if (in_array($ch, ['+', '-', '*', '/', '^'], true)) {
                $tokens[] = ['type' => 'op', 'value' => $ch];
                $i++;
                continue;
            }

            if ($ch === '(') {
                $tokens[] = ['type' => 'lparen', 'value' => '('];
                $i++;
                continue;
            }

            if ($ch === ')') {
                $tokens[] = ['type' => 'rparen', 'value' => ')'];
                $i++;
                continue;
            }

            throw ValidationException::withMessages([
                'expression' => "Unexpected character \"{$ch}\" in the formula.",
            ]);
        }

        return $tokens;
    }

    /** Shunting-yard: infix tokens → Reverse Polish Notation, with unary minus. */
    private function toRpn(array $tokens): array
    {
        $output = [];
        $stack = [];
        $prec = ['+' => 2, '-' => 2, '*' => 3, '/' => 3, '^' => 4];
        $rightAssoc = ['^' => true];

        $prev = null;
        foreach ($tokens as $tok) {
            switch ($tok['type']) {
                case 'num':
                    $output[] = $tok;
                    break;

                case 'func':
                    $stack[] = $tok;
                    break;

                case 'op':
                    // Detect unary minus/plus (start, or after another op / '(').
                    $isUnary = $tok['value'] === '-' || $tok['value'] === '+';
                    $atUnaryPos = $prev === null
                        || $prev['type'] === 'op'
                        || $prev['type'] === 'lparen'
                        || $prev['type'] === 'func';

                    if ($isUnary && $atUnaryPos) {
                        if ($tok['value'] === '-') {
                            // Represent unary minus as (0 - x) via a marker op 'u-'.
                            $stack[] = ['type' => 'op', 'value' => 'u-'];
                        }
                        // unary plus is a no-op
                        break;
                    }

                    while (
                        ! empty($stack)
                        && end($stack)['type'] === 'op'
                        && end($stack)['value'] !== 'u-'
                        && (
                            $prec[end($stack)['value']] > $prec[$tok['value']]
                            || ($prec[end($stack)['value']] === $prec[$tok['value']] && empty($rightAssoc[$tok['value']]))
                        )
                    ) {
                        $output[] = array_pop($stack);
                    }
                    // u- (unary) has highest precedence — pop it before pushing.
                    while (! empty($stack) && end($stack)['type'] === 'op' && end($stack)['value'] === 'u-') {
                        $output[] = array_pop($stack);
                    }
                    $stack[] = $tok;
                    break;

                case 'lparen':
                    $stack[] = $tok;
                    break;

                case 'rparen':
                    while (! empty($stack) && end($stack)['type'] !== 'lparen') {
                        $output[] = array_pop($stack);
                    }
                    if (empty($stack)) {
                        throw ValidationException::withMessages([
                            'expression' => 'Mismatched parentheses in the formula.',
                        ]);
                    }
                    array_pop($stack); // discard '('
                    if (! empty($stack) && end($stack)['type'] === 'func') {
                        $output[] = array_pop($stack);
                    }
                    break;
            }
            $prev = $tok;
        }

        while (! empty($stack)) {
            $top = array_pop($stack);
            if ($top['type'] === 'lparen' || $top['type'] === 'rparen') {
                throw ValidationException::withMessages([
                    'expression' => 'Mismatched parentheses in the formula.',
                ]);
            }
            $output[] = $top;
        }

        return $output;
    }

    private function evalRpn(array $rpn): float
    {
        $stack = [];

        foreach ($rpn as $tok) {
            if ($tok['type'] === 'num') {
                $stack[] = (float) $tok['value'];
                continue;
            }

            if ($tok['type'] === 'func' && $tok['value'] === 'sqrt') {
                $a = array_pop($stack);
                if ($a === null) {
                    $this->syntaxError();
                }
                if ($a < 0) {
                    throw ValidationException::withMessages([
                        'inputs' => 'The formula took the square root of a negative number — check the inputs.',
                    ]);
                }
                $stack[] = sqrt($a);
                continue;
            }

            if ($tok['type'] === 'op') {
                if ($tok['value'] === 'u-') {
                    $a = array_pop($stack);
                    if ($a === null) {
                        $this->syntaxError();
                    }
                    $stack[] = -$a;
                    continue;
                }

                $b = array_pop($stack);
                $a = array_pop($stack);
                if ($a === null || $b === null) {
                    $this->syntaxError();
                }
                $stack[] = match ($tok['value']) {
                    '+' => $a + $b,
                    '-' => $a - $b,
                    '*' => $a * $b,
                    '/' => $this->divide($a, $b),
                    '^' => $a ** $b,
                    default => $this->syntaxError(),
                };
            }
        }

        if (count($stack) !== 1) {
            $this->syntaxError();
        }

        $result = $stack[0];
        if (! is_finite($result)) {
            throw ValidationException::withMessages([
                'inputs' => 'The formula produced an invalid result (division by zero or overflow). Check the inputs.',
            ]);
        }

        return (float) $result;
    }

    private function divide(float $a, float $b): float
    {
        if ($b == 0.0) {
            throw ValidationException::withMessages([
                'inputs' => 'The formula divided by zero — check the inputs.',
            ]);
        }

        return $a / $b;
    }

    private function syntaxError(): never
    {
        throw ValidationException::withMessages([
            'expression' => 'The formula expression is malformed.',
        ]);
    }
}

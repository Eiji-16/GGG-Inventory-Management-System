import { useEffect, useRef } from 'react';

/* ===== 6-BOX CODE INPUT =====
   Used for the emailed "Forgot password?" code and the authenticator-app
   code. One box per number: typing moves to the next box, Backspace moves
   back, and pasting "123456" (or "123 456") fills all six boxes at once.
   value / onChange work with a plain string of numbers ("" to "123456").
   When the 6th number is typed, onComplete(code) runs (e.g. to submit). */
export default function OtpInput({
    value = '',
    onChange,
    onComplete,
    disabled = false,
    invalid = false,
    autoFocus = true,
    idPrefix = 'otp',
    label = 'Enter the 6-digit code',
}) {
    const refs = useRef([]);
    const digits = Array.from({ length: 6 }, (_, index) => value[index] || '');

    useEffect(() => {
        if (autoFocus && !disabled) refs.current[0]?.focus();
    }, [autoFocus, disabled]);

    // After a wrong code the boxes are cleared: put the cursor back in box 1.
    useEffect(() => {
        if (value === '' && invalid) refs.current[0]?.focus();
    }, [value, invalid]);

    const setCode = (next) => {
        const clean = next.replace(/\D/g, '').slice(0, 6);
        onChange?.(clean);
        if (clean.length === 6) onComplete?.(clean);
        return clean;
    };

    const handleInput = (index, event) => {
        const typed = event.target.value.replace(/\D/g, '');
        if (!typed) return;
        if (typed.length > 1) {
            // Phone keyboards may drop the whole code into one box.
            const clean = setCode(value.slice(0, index) + typed);
            refs.current[Math.min(clean.length, 5)]?.focus();
            return;
        }
        const chars = digits.slice();
        chars[index] = typed;
        const clean = setCode(chars.join(''));
        if (index < 5) refs.current[Math.min(index + 1, clean.length)]?.focus();
    };

    const handleKeyDown = (index, event) => {
        if (event.key === 'Backspace') {
            event.preventDefault();
            const chars = digits.slice();
            if (chars[index]) {
                chars[index] = '';
                setCode(chars.join(''));
            } else if (index > 0) {
                chars[index - 1] = '';
                setCode(chars.join(''));
                refs.current[index - 1]?.focus();
            }
        } else if (event.key === 'ArrowLeft' && index > 0) {
            refs.current[index - 1]?.focus();
        } else if (event.key === 'ArrowRight' && index < 5) {
            refs.current[index + 1]?.focus();
        }
    };

    const handlePaste = (event) => {
        const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
        if (!pasted) return;
        event.preventDefault();
        const clean = setCode(pasted);
        refs.current[Math.min(clean.length, 5)]?.focus();
    };

    return (
        <div className={`am-otp${invalid ? ' is-invalid' : ''}`} role="group" aria-label={label}>
            {digits.map((digit, index) => (
                <input
                    key={index}
                    id={`${idPrefix}-${index}`}
                    ref={(element) => { refs.current[index] = element; }}
                    className={`am-otp-box${digit ? ' is-filled' : ''}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    pattern="[0-9]*"
                    maxLength={6}
                    value={digit}
                    disabled={disabled}
                    aria-label={`Number ${index + 1} of 6`}
                    onChange={(event) => handleInput(index, event)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={handlePaste}
                    onFocus={(event) => event.target.select()}
                />
            ))}
        </div>
    );
}

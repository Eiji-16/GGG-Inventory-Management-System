import { useEffect, useState } from 'react';
import { PageToast } from '../../../utils/toast';
import { createPortal } from 'react-dom';
import {
    ArrowLeft, Check, CircleAlert, Eye, EyeOff, KeyRound, LockKeyhole, Mail, MailCheck, RotateCw, ShieldCheck, X,
} from 'lucide-react';
import OtpInput from '../OtpInput';
import '../authModal.css';

/* ===== FORGOT PASSWORD (redesign 2026-11-03) =====
   Step 1  Email     → POST /auth/password/otp (a 6-digit code is emailed)
   Step 2  Code      → POST /auth/password/otp/verify (checks the code only)
   Step 3  Password  → POST /auth/password/reset (the server checks the code
                       AGAIN, so step 2 cannot be skipped)
   Step 4  Done
   The code lasts 10 minutes; "Send a new code" unlocks after 60 seconds.
   Messages from the server say exactly what is wrong: incorrect (with the
   tries left), expired, blocked after 5 wrong tries, or email not working. */
const STEPS = [
    { key: 'email', label: 'Email' },
    { key: 'otp', label: 'Code' },
    { key: 'password', label: 'Password' },
];
const RESEND_SECONDS = 60;

async function postJson(url, payload) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken || '',
            },
            body: JSON.stringify(payload),
        });
    } catch {
        throw new Error('Can’t reach the server. Check that Laragon is running, then try again.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Too many requests. Please wait a minute, then try again.');
        }
        if (response.status === 419) {
            throw new Error('The page has expired. Refresh the page, then try again.');
        }
        const validationMessage = data.errors ? Object.values(data.errors).flat()[0] : null;
        const error = new Error(validationMessage || data.message || 'Something went wrong. Please try again.');
        error.field = data.errors ? Object.keys(data.errors)[0] : null;
        throw error;
    }
    return data;
}

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

function passwordChecks(password) {
    return [
        { label: 'At least 8 characters', ok: password.length >= 8 },
        { label: 'A letter and a number', ok: /[a-z]/i.test(password) && /\d/.test(password) },
    ];
}

function ResetPass({ onBack }) {
    const [step, setStep] = useState('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [codeInvalid, setCodeInvalid] = useState(false);
    const [busy, setBusy] = useState(false);
    const [expiresAt, setExpiresAt] = useState(null);   // ms timestamp
    const [resendAt, setResendAt] = useState(0);        // ms timestamp
    const [now, setNow] = useState(Date.now());

    // One clock for the code timer and the resend timer.
    useEffect(() => {
        if (step !== 'otp' && step !== 'password') return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [step]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !busy) onBack();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [busy, onBack]);

    const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
    const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
    const codeExpired = (step === 'otp' || step === 'password') && expiresAt !== null && secondsLeft === 0;

    async function sendCode(targetEmail) {
        setError('');
        setMessage('');
        setBusy(true);
        try {
            const data = await postJson('/auth/password/otp', { email: targetEmail });
            setEmail(targetEmail);
            setCode('');
            setCodeInvalid(false);
            setExpiresAt(Date.now() + (Number(data.expiresInMinutes) || 10) * 60 * 1000);
            setResendAt(Date.now() + RESEND_SECONDS * 1000);
            setNow(Date.now());
            setMessage(data.message);
            setStep('otp');
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setBusy(false);
        }
    }

    function submitEmail(event) {
        event.preventDefault();
        const typed = new FormData(event.currentTarget).get('email');
        sendCode(String(typed || '').trim());
    }

    async function verifyCode(typedCode = code) {
        if (busy) return;
        if (typedCode.length !== 6) {
            setError('Enter all 6 numbers of the code.');
            setCodeInvalid(true);
            return;
        }
        if (codeExpired) {
            setError('This code has expired (codes last 10 minutes). Click "Send a new code".');
            setCodeInvalid(true);
            return;
        }
        setError('');
        setMessage('');
        setBusy(true);
        try {
            await postJson('/auth/password/otp/verify', { email, otp: typedCode });
            setCodeInvalid(false);
            setStep('password');
        } catch (requestError) {
            setError(requestError.message);
            setCodeInvalid(true);
            setCode('');
        } finally {
            setBusy(false);
        }
    }

    async function resetPassword(event) {
        event.preventDefault();
        if (busy) return;
        if (password !== confirmation) {
            setError('The two passwords do not match.');
            return;
        }
        if (password.length < 8) {
            setError('The new password must have at least 8 characters.');
            return;
        }
        setError('');
        setBusy(true);
        try {
            const data = await postJson('/auth/password/reset', {
                email,
                otp: code,
                password,
                password_confirmation: confirmation,
            });
            setMessage(data.message);
            setStep('complete');
        } catch (requestError) {
            setError(requestError.message);
            // The code itself failed on the server (expired or blocked in
            // the meantime): go back to the code step.
            if (requestError.field === 'otp') {
                setCode('');
                setCodeInvalid(true);
                setStep('otp');
            }
        } finally {
            setBusy(false);
        }
    }

    const stepIndex = STEPS.findIndex((item) => item.key === step);
    const checks = passwordChecks(password);
    const matches = confirmation.length > 0 && password === confirmation;

    const heading = {
        email: { Icon: KeyRound, title: 'Forgot your password?', text: 'Enter the email of your account. We’ll send you a 6-digit code to reset it.' },
        otp: { Icon: MailCheck, title: 'Check your email', text: null },
        password: { Icon: LockKeyhole, title: 'Choose a new password', text: 'Code accepted. Pick a password you haven’t used here before.' },
        complete: { Icon: ShieldCheck, title: 'Password updated', text: 'You can now sign in with your new password.' },
    }[step];
    const HeadingIcon = heading.Icon;

    return createPortal(
        <div
            className="am-overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onBack();
            }}
        >
            <section className="am-modal" role="dialog" aria-modal="true" aria-labelledby="am-reset-title">
                <button type="button" className="am-close" aria-label="Close" onClick={onBack} disabled={busy}>
                    <X size={18} />
                </button>

                {step !== 'complete' && (
                    <ol className="am-steps" aria-label="Steps">
                        {STEPS.map((item, index) => (
                            <li
                                key={item.key}
                                className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-current' : ''}
                                aria-current={index === stepIndex ? 'step' : undefined}
                            >
                                <span className="am-step-dot">{index < stepIndex ? <Check size={11} strokeWidth={3} /> : index + 1}</span>
                                <span className="am-step-label">{item.label}</span>
                            </li>
                        ))}
                    </ol>
                )}

                <div key={step} className="am-body">
                    <div className={`am-icon${step === 'complete' ? ' is-success' : ''}`} aria-hidden="true">
                        <HeadingIcon size={24} />
                    </div>
                    <h2 id="am-reset-title" className="am-title">{heading.title}</h2>
                    <p className="am-text">
                        {step === 'otp'
                            ? <>We sent a 6-digit code to <strong>{email}</strong>. Type it below.</>
                            : heading.text}
                    </p>

                    {message && step !== 'complete' && !error && (
                        <p className="am-alert is-info" role="status"><Mail size={14} aria-hidden="true" /> {message}</p>
                    )}
                    {/* Error shows as a bottom-right pop-up (2026-11-06). */}
                    <PageToast message={error} type="error" />

                    {step === 'email' && (
                        <form className="am-form" onSubmit={submitEmail}>
                            <label className="am-label" htmlFor="am-reset-email">Email address</label>
                            <div className="am-input">
                                <Mail size={16} aria-hidden="true" />
                                <input
                                    id="am-reset-email"
                                    type="email"
                                    name="email"
                                    defaultValue={email}
                                    placeholder="name@company.com"
                                    autoComplete="email"
                                    autoFocus
                                    required
                                />
                            </div>
                            <button type="submit" className="am-primary" disabled={busy}>
                                {busy ? <><span className="am-spinner" aria-hidden="true" /> Sending code…</> : 'Send code'}
                            </button>
                            <button type="button" className="am-link" onClick={onBack}>
                                <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
                            </button>
                        </form>
                    )}

                    {step === 'otp' && (
                        <form className="am-form" onSubmit={(event) => { event.preventDefault(); verifyCode(); }}>
                            <OtpInput
                                idPrefix="am-reset-otp"
                                value={code}
                                onChange={(next) => { setCode(next); if (codeInvalid) setCodeInvalid(false); }}
                                onComplete={(full) => verifyCode(full)}
                                disabled={busy}
                                invalid={codeInvalid}
                            />
                            <p className={`am-timer${codeExpired ? ' is-expired' : secondsLeft <= 60 ? ' is-warning' : ''}`} role="timer">
                                {codeExpired ? 'This code has expired. Send a new code.' : <>Code expires in <strong>{formatClock(secondsLeft)}</strong></>}
                            </p>
                            <button type="submit" className="am-primary" disabled={busy || code.length !== 6 || codeExpired}>
                                {busy ? <><span className="am-spinner" aria-hidden="true" /> Checking…</> : 'Verify code'}
                            </button>
                            <div className="am-row">
                                <button
                                    type="button"
                                    className="am-link"
                                    onClick={() => sendCode(email)}
                                    disabled={busy || resendIn > 0}
                                >
                                    <RotateCw size={13} aria-hidden="true" />
                                    {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
                                </button>
                                <button
                                    type="button"
                                    className="am-link"
                                    onClick={() => { setError(''); setMessage(''); setStep('email'); }}
                                    disabled={busy}
                                >
                                    Use a different email
                                </button>
                            </div>
                            <p className="am-help hint-text">No email? Check the spam folder. The code only reaches emails that have an account.</p>
                        </form>
                    )}

                    {step === 'password' && (
                        <form className="am-form" onSubmit={resetPassword}>
                            <label className="am-label" htmlFor="am-reset-password">New password</label>
                            <div className="am-input">
                                <LockKeyhole size={16} aria-hidden="true" />
                                <input
                                    id="am-reset-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    autoFocus
                                    required
                                />
                                <button
                                    type="button"
                                    className="am-eye"
                                    onClick={() => setShowPassword((visible) => !visible)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    aria-pressed={showPassword}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <ul className="am-checks">
                                {checks.map((check) => (
                                    <li key={check.label} className={check.ok ? 'is-ok' : ''}>
                                        <Check size={12} strokeWidth={3} aria-hidden="true" /> {check.label}
                                    </li>
                                ))}
                            </ul>
                            <label className="am-label" htmlFor="am-reset-confirm">Confirm new password</label>
                            <div className={`am-input${confirmation && !matches ? ' is-invalid' : ''}`}>
                                <LockKeyhole size={16} aria-hidden="true" />
                                <input
                                    id="am-reset-confirm"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmation}
                                    onChange={(event) => setConfirmation(event.target.value)}
                                    placeholder="Type the password again"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                            {confirmation && (
                                <p className={`am-match ${matches ? 'is-ok' : 'is-bad'}`}>
                                    {matches ? 'Passwords match.' : 'Passwords do not match yet.'}
                                </p>
                            )}
                            {!codeExpired && expiresAt && (
                                <p className="am-timer">Finish within <strong>{formatClock(secondsLeft)}</strong> (the code’s time limit).</p>
                            )}
                            <button type="submit" className="am-primary" disabled={busy || !matches || password.length < 8}>
                                {busy ? <><span className="am-spinner" aria-hidden="true" /> Saving…</> : 'Reset password'}
                            </button>
                        </form>
                    )}

                    {step === 'complete' && (
                        <div className="am-form">
                            {message && <p className="am-alert is-success" role="status"><Check size={14} aria-hidden="true" /> {message}</p>}
                            <button type="button" className="am-primary" onClick={onBack}>Back to sign in</button>
                        </div>
                    )}
                </div>
            </section>
        </div>,
        document.body,
    );
}

export default ResetPass;

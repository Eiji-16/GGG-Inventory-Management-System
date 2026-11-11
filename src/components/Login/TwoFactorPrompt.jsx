import { useEffect, useRef, useState } from 'react';
import { PageToast } from '../../utils/toast';
import { createPortal } from 'react-dom';
import { Mail, Smartphone, X } from 'lucide-react';
import OtpInput from './OtpInput';
import './authModal.css';

/* ===== 2FA AT SIGN-IN (2026-11-03) =====
   Shown after a correct email + password when the account has an
   authenticator app. POST /auth/two-factor { code } signs in; until then the
   person is NOT signed in. 5 wrong codes (or 5 minutes) = start again.

   2026-11-11: "Can't use your phone? Send a code to my email" — the system
   emails a 6-digit code (10 minutes, works once) and the person types it
   here instead (POST /auth/two-factor/email, then /auth/two-factor/email/verify).
   It only works right after the correct password.

   2026-11-12: method 'email' = the account chose email codes instead of the
   app: the code is emailed as soon as this window opens and there is no
   "Use the authenticator app" link. setup = it was chosen just now on the
   "Connect your authenticator app" window (the code is already sent).
   rememberDays > 0 shows "Remember this device for N days" (Staff 30,
   Admin 7; the Super Admin never sees it). */
const RESEND_SECONDS = 60;

function csrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
        body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
}

export default function TwoFactorPrompt({ email, method = 'app', rememberDays = 0, setup = false, initialResendIn = 0, onSuccess, onCancel }) {
    const appAvailable = method !== 'email';
    const [mode, setMode] = useState(appAvailable ? 'app' : 'email');   // 'app' | 'email'
    const [remember, setRemember] = useState(false);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [invalid, setInvalid] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sending, setSending] = useState(false);
    const [resendIn, setResendIn] = useState(setup ? initialResendIn : 0);   // seconds before "Send a new code" works
    const autoSent = useRef(false);

    // Count down the wait before another email can be sent.
    useEffect(() => {
        if (resendIn <= 0) return undefined;
        const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [resendIn]);

    const isEmail = mode === 'email';

    function showError(message) {
        setError(message === 'Failed to fetch'
            ? 'Can’t reach the server. Check that Laragon is running, then try again.'
            : message);
        setInvalid(true);
        setCode('');
    }

    async function sendEmailCode() {
        if (sending || resendIn > 0) return;
        setSending(true);
        setError('');
        try {
            const { response, data } = await postJson('/auth/two-factor/email');
            if (!response.ok) {
                if (data.code === 'two_factor_expired') {
                    onCancel(data.message);
                    return;
                }
                throw new Error(data.message || 'The code could not be sent. Please try again.');
            }
            setMode('email');
            setCode('');
            setInvalid(false);
            setResendIn(data.resendInSeconds || RESEND_SECONDS);
        } catch (requestError) {
            showError(requestError.message);
        } finally {
            setSending(false);
        }
    }

    // Email-code accounts: send the code as soon as the window opens (once).
    useEffect(() => {
        if (appAvailable || setup || autoSent.current) return;
        autoSent.current = true;
        sendEmailCode();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function submit(typed = code) {
        if (busy) return;
        if (typed.length !== 6) {
            setError(isEmail ? 'Enter all 6 numbers from the email.' : 'Enter all 6 numbers from your authenticator app.');
            setInvalid(true);
            return;
        }
        setBusy(true);
        setError('');
        try {
            const { response, data } = await postJson(isEmail ? '/auth/two-factor/email/verify' : '/auth/two-factor', { code: typed, remember: rememberDays > 0 && remember });
            if (!response.ok) {
                if (data.code === 'two_factor_expired') {
                    onCancel(data.message);
                    return;
                }
                const message = response.status === 429
                    ? 'Too many tries. Please wait a minute, then try again.'
                    : (data.errors ? Object.values(data.errors).flat()[0] : data.message);
                throw new Error(message || 'The code could not be checked. Please try again.');
            }
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta && data.csrfToken) csrfMeta.content = data.csrfToken;
            onSuccess(data.user);
        } catch (requestError) {
            showError(requestError.message);
        } finally {
            setBusy(false);
        }
    }

    const locked = busy || sending;

    return createPortal(
        <div className="am-overlay">
            <section className="am-modal" role="dialog" aria-modal="true" aria-labelledby="am-2fa-title">
                <button type="button" className="am-close" aria-label="Cancel sign-in" onClick={() => onCancel('')} disabled={locked}>
                    <X size={18} />
                </button>
                <div className="am-body">
                    <div className="am-icon" aria-hidden="true">{isEmail ? <Mail size={24} /> : <Smartphone size={24} />}</div>
                    <h2 id="am-2fa-title" className="am-title">Two-step verification</h2>
                    {isEmail && sending && resendIn === 0 && !code ? (
                        <p className="am-text">
                            Sending a 6-digit code to <strong>{email}</strong>…
                        </p>
                    ) : isEmail ? (
                        <p className="am-text">
                            We sent a 6-digit code to <strong>{email}</strong>. Type it below. It works for 10 minutes. Check the spam folder too.
                        </p>
                    ) : (
                        <p className="am-text">
                            Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone and type the 6-digit code for <strong>{email}</strong>.
                        </p>
                    )}
                    <PageToast message={error} type="error" onShown={() => setError('')} />
                    <form className="am-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                        <OtpInput
                            key={mode}
                            idPrefix={isEmail ? 'am-2fa-email' : 'am-2fa'}
                            label={isEmail ? 'Code from the email' : 'Authenticator code'}
                            value={code}
                            onChange={(next) => { setCode(next); if (invalid) setInvalid(false); }}
                            onComplete={(full) => submit(full)}
                            disabled={locked}
                            invalid={invalid}
                        />
                        {rememberDays > 0 && (
                            <label className="am-remember">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(event) => setRemember(event.target.checked)}
                                    disabled={locked}
                                />
                                <span>Remember this device for {rememberDays} days</span>
                            </label>
                        )}
                        <button type="submit" className="am-primary" disabled={locked || code.length !== 6}>
                            {busy ? <><span className="am-spinner" aria-hidden="true" /> Checking…</> : 'Verify and sign in'}
                        </button>

                        {isEmail ? (
                            <div className={`am-row${appAvailable ? '' : ' is-center'}`}>
                                {appAvailable && (
                                    <button type="button" className="am-link" onClick={() => { setMode('app'); setCode(''); setInvalid(false); }} disabled={locked}>
                                        <Smartphone size={13} aria-hidden="true" /> Use the authenticator app
                                    </button>
                                )}
                                <button type="button" className="am-link" onClick={sendEmailCode} disabled={locked || resendIn > 0}>
                                    {sending ? 'Sending…' : resendIn > 0 ? `Send a new code (${resendIn}s)` : 'Send a new code'}
                                </button>
                            </div>
                        ) : (
                            <button type="button" className="am-link" onClick={sendEmailCode} disabled={locked}>
                                <Mail size={13} aria-hidden="true" /> {sending ? 'Sending the code…' : 'Can’t use your phone? Send a code to my email'}
                            </button>
                        )}

                        <p className="am-help hint-text">
                            {!appAvailable
                                ? (setup
                                    ? 'After this, every sign-in sends a new code to your email.'
                                    : 'Each sign-in sends a new code to your email.')
                                : isEmail
                                    ? 'Lost your phone for good? After signing in, ask the Super Admin to turn off the authenticator app for your account so you can set it up again.'
                                    : 'The code changes every 30 seconds.'}
                        </p>
                    </form>
                </div>
            </section>
        </div>,
        document.body,
    );
}

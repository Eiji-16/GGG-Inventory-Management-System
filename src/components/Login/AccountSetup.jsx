import { useEffect, useMemo, useState } from 'react';
import { PageToast } from '../../utils/toast';
import {
    ArrowRight, Boxes, Check, CircleAlert, Copy, Eye, EyeOff, LinkIcon, LockKeyhole, ShieldCheck, Smartphone, UserCheck,
} from 'lucide-react';
import OtpInput from './OtpInput';
import { useSystemName } from '../../systemName';
import { qrDataUrl } from '../../utils/qrCode';
import './authModal.css';

/* ===== ACCOUNT SETUP PAGE (/account/setup?token=…, 2026-11-03) =====
   Opened from the "approved" email. Steps:
     1. The link is checked (POST /auth/account-setup/check): valid, not
        expired (24 hours), not used, and not already opened in another
        browser. The secret is then removed from the address bar.
     2. Choose a password.
     3. Scan the QR code with Google / Microsoft Authenticator and type the
        6-digit code (POST /auth/account-setup/complete). Only now is the
        account made — with 2FA already on — and the link stops working. */
const STEPS = [
    { key: 'password', label: 'Password' },
    { key: 'authenticator', label: 'Authenticator' },
    { key: 'done', label: 'Done' },
];

async function postJson(url, payload) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken || '' },
            body: JSON.stringify(payload),
        });
    } catch {
        throw new Error('Can’t reach the server. Check your connection, then try again.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(response.status === 429
            ? 'Too many tries. Please wait a minute, then try again.'
            : (data.errors ? Object.values(data.errors).flat()[0] : data.message) || 'Something went wrong. Please try again.');
        error.field = data.errors ? Object.keys(data.errors)[0] : null;
        throw error;
    }
    return data;
}

export default function AccountSetup({ token }) {
    const systemName = useSystemName();   // Settings → System name
    const [status, setStatus] = useState('checking');   // checking | invalid | ready
    const [linkError, setLinkError] = useState('');
    const [info, setInfo] = useState(null);
    const [step, setStep] = useState('password');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [code, setCode] = useState('');
    const [codeInvalid, setCodeInvalid] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [doneMessage, setDoneMessage] = useState('');

    useEffect(() => {
        let active = true;
        // Keep the secret out of the address bar (and browser history).
        window.history.replaceState(null, '', '/account/setup');
        if (!token || token.length !== 64) {
            setLinkError('This setup link is incomplete. Open it again from your email, or ask the Super Admin to send a new one.');
            setStatus('invalid');
            return undefined;
        }
        postJson('/auth/account-setup/check', { token })
            .then((data) => { if (active) { setInfo(data); setStatus('ready'); } })
            .catch((checkError) => { if (active) { setLinkError(checkError.message); setStatus('invalid'); } });
        return () => { active = false; };
    }, [token]);

    const qr = useMemo(() => (info?.twoFactor?.uri ? qrDataUrl(info.twoFactor.uri) : ''), [info]);
    const checks = [
        { label: 'At least 8 characters', ok: password.length >= 8 },
        { label: 'Letters and numbers', ok: /[a-z]/i.test(password) && /\d/.test(password) },
    ];
    const passwordOk = checks.every((check) => check.ok);
    const matches = confirmation.length > 0 && confirmation === password;

    const toAuthenticator = (event) => {
        event.preventDefault();
        if (!passwordOk) { setError('The password needs at least 8 characters, with letters and numbers.'); return; }
        if (!matches) { setError('The two passwords do not match.'); return; }
        setError('');
        setStep('authenticator');
    };

    async function finish(typed = code) {
        if (busy) return;
        if (typed.length !== 6) { setError('Enter all 6 numbers from your authenticator app.'); setCodeInvalid(true); return; }
        setBusy(true);
        setError('');
        try {
            const data = await postJson('/auth/account-setup/complete', {
                token, password, password_confirmation: confirmation, code: typed,
            });
            setDoneMessage(data.message);
            setStep('done');
        } catch (finishError) {
            setError(finishError.message);
            if (finishError.field === 'password') setStep('password');
            if (finishError.field === 'token') { setLinkError(finishError.message); setStatus('invalid'); }
            setCodeInvalid(finishError.field === 'code');
            setCode('');
        } finally {
            setBusy(false);
        }
    }

    const copyKey = async () => {
        try {
            await navigator.clipboard.writeText(info.twoFactor.secret.replace(/\s/g, ''));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            /* the key is still visible to type by hand */
        }
    };

    const stepIndex = STEPS.findIndex((item) => item.key === step);
    const goToSignIn = () => { window.location.href = '/'; };

    return (
        <div className="am-page">
            <section className={`am-modal${step === 'authenticator' ? ' is-wide' : ''}`} aria-labelledby="am-setup-title">
                <div className="am-brand">
                    <span className="am-brand-mark" aria-hidden="true"><Boxes size={17} /></span>
                    <span><strong>Global Growth Guide</strong>{systemName}</span>
                </div>

                {status === 'checking' && (
                    <div className="am-body" role="status">
                        <div className="am-icon" aria-hidden="true"><LinkIcon size={24} /></div>
                        <h1 id="am-setup-title" className="am-title">Checking your link…</h1>
                        <p className="am-text"><span className="am-spinner" aria-hidden="true" /> Making sure the link is valid and not expired.</p>
                    </div>
                )}

                {status === 'invalid' && (
                    <div className="am-body">
                        <div className="am-icon is-danger" aria-hidden="true"><CircleAlert size={24} /></div>
                        <h1 id="am-setup-title" className="am-title">This link can’t be used</h1>
                        <p className="am-alert is-error" role="alert"><CircleAlert size={14} aria-hidden="true" /> {linkError}</p>
                        <p className="am-text">For your security, setup links expire after 24 hours, work only once, and only in the browser that opened them first.</p>
                        <button type="button" className="am-primary" onClick={goToSignIn}>Go to sign in</button>
                    </div>
                )}

                {status === 'ready' && info && (
                    <>
                        {step !== 'done' && (
                            <ol className="am-steps" aria-label="Setup steps">
                                {STEPS.map((item, index) => (
                                    <li key={item.key} className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-current' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
                                        <span className="am-step-dot">{index < stepIndex ? <Check size={11} strokeWidth={3} /> : index + 1}</span>
                                        <span className="am-step-label">{item.label}</span>
                                    </li>
                                ))}
                            </ol>
                        )}

                        {step === 'password' && (
                            <div key="password" className="am-body">
                                <div className="am-icon is-success" aria-hidden="true"><UserCheck size={24} /></div>
                                <h1 id="am-setup-title" className="am-title">Welcome, {info.name}</h1>
                                <p className="am-text">Your identity is confirmed for <strong>{info.email}</strong> ({info.role}). Choose the password you’ll use to sign in.</p>
                                <PageToast message={error} type="error" onShown={() => setError('')} />
                                <form className="am-form" onSubmit={toAuthenticator}>
                                    <label className="am-label" htmlFor="am-setup-pass">New password</label>
                                    <div className="am-input">
                                        <LockKeyhole size={16} aria-hidden="true" />
                                        <input id="am-setup-pass" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" autoFocus required />
                                        <button type="button" className="am-eye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <ul className="am-checks">
                                        {checks.map((check) => (
                                            <li key={check.label} className={check.ok ? 'is-ok' : ''}><Check size={12} strokeWidth={3} aria-hidden="true" /> {check.label}</li>
                                        ))}
                                    </ul>
                                    <label className="am-label" htmlFor="am-setup-confirm">Confirm password</label>
                                    <div className={`am-input${confirmation && !matches ? ' is-invalid' : ''}`}>
                                        <LockKeyhole size={16} aria-hidden="true" />
                                        <input id="am-setup-confirm" type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" placeholder="Type the password again" required />
                                    </div>
                                    {confirmation && <p className={`am-match ${matches ? 'is-ok' : 'is-bad'}`}>{matches ? 'Passwords match.' : 'Passwords do not match yet.'}</p>}
                                    <button type="submit" className="am-primary" disabled={!passwordOk || !matches}>
                                        Next: connect your authenticator <ArrowRight size={16} aria-hidden="true" />
                                    </button>
                                </form>
                            </div>
                        )}

                        {step === 'authenticator' && (
                            <div key="authenticator" className="am-body">
                                <div className="am-icon" aria-hidden="true"><Smartphone size={24} /></div>
                                <h1 id="am-setup-title" className="am-title">Connect your authenticator app</h1>
                                <p className="am-text">From now on, signing in needs your password <strong>and</strong> a 6-digit code from your phone.</p>
                                <div className="am-qr">
                                    <div className="am-qr-image">{qr && <img src={qr} alt="QR code for your authenticator app" />}</div>
                                    <div>
                                        <ol>
                                            <li>Install <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong>.</li>
                                            <li>Tap <strong>+</strong> → <strong>Scan a QR code</strong> and scan this code.</li>
                                            <li>Type the 6-digit code it shows below.</li>
                                        </ol>
                                        <div className="am-key" title="Can’t scan? Choose “Enter a setup key” in the app and type this key.">
                                            <span>{info.twoFactor.secret}</span>
                                            <button type="button" className="am-eye" onClick={copyKey} aria-label="Copy the setup key">
                                                {copied ? <Check size={15} /> : <Copy size={15} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <PageToast message={error} type="error" onShown={() => setError('')} />
                                <form className="am-form" style={{ marginTop: 14 }} onSubmit={(event) => { event.preventDefault(); finish(); }}>
                                    <label className="am-label" htmlFor="am-setup-code-0">Code from the app</label>
                                    <OtpInput
                                        idPrefix="am-setup-code"
                                        label="Code from the authenticator app"
                                        value={code}
                                        onChange={(next) => { setCode(next); if (codeInvalid) setCodeInvalid(false); }}
                                        onComplete={(full) => finish(full)}
                                        disabled={busy}
                                        invalid={codeInvalid}
                                        autoFocus={false}
                                    />
                                    <button type="submit" className="am-primary" disabled={busy || code.length !== 6}>
                                        {busy ? <><span className="am-spinner" aria-hidden="true" /> Finishing…</> : <><ShieldCheck size={16} aria-hidden="true" /> Finish setup</>}
                                    </button>
                                    <button type="button" className="am-link" onClick={() => { setError(''); setStep('password'); }} disabled={busy}>Back to password</button>
                                </form>
                            </div>
                        )}

                        {step === 'done' && (
                            <div key="done" className="am-body">
                                <div className="am-icon is-success" aria-hidden="true"><ShieldCheck size={24} /></div>
                                <h1 id="am-setup-title" className="am-title">You’re all set</h1>
                                <p className="am-alert is-success" role="status"><Check size={14} aria-hidden="true" /> {doneMessage}</p>
                                <p className="am-text">This setup link no longer works. Keep your phone safe: you’ll need the authenticator app every time you sign in.</p>
                                <button type="button" className="am-primary" onClick={goToSignIn}>Go to sign in <ArrowRight size={16} aria-hidden="true" /></button>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

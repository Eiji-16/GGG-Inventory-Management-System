import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Mail, ShieldCheck, Smartphone, X } from 'lucide-react';
import { PageToast } from '../../utils/toast';
import { qrDataUrl } from '../../utils/qrCode';
import OtpInput from './OtpInput';
import './authModal.css';

/* ===== CONNECT THE AUTHENTICATOR AT SIGN-IN (2026-11-11) =====
   Shown after a correct email + password when the Super Admin turned on
   "Require the authenticator app for every account" and this account has
   none yet. Scan the QR code, type the 6-digit code, then you are signed in
   (POST /auth/two-factor/setup). Until then nobody is signed in. Same look
   as the account setup page.

   2026-11-12: "Use email codes instead" — no phone app needed. The system
   emails a code (POST /auth/two-factor/setup/email) and the two-step window
   opens in email mode (onChooseEmail). rememberDays > 0 shows
   "Remember this device for N days". */
export default function TwoFactorSetupPrompt({ email, twoFactor, rememberDays = 0, onSuccess, onCancel, onChooseEmail }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [invalid, setInvalid] = useState(false);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [remember, setRemember] = useState(false);
    const [emailBusy, setEmailBusy] = useState(false);
    const qr = useMemo(() => (twoFactor?.uri ? qrDataUrl(twoFactor.uri) : ''), [twoFactor]);

    const copyKey = async () => {
        try {
            await navigator.clipboard.writeText(String(twoFactor?.secret || '').replace(/\s/g, ''));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            /* the key is still visible to type by hand */
        }
    };

    async function submit(typed = code) {
        if (busy) return;
        if (typed.length !== 6) {
            setError('Enter all 6 numbers from your authenticator app.');
            setInvalid(true);
            return;
        }
        setBusy(true);
        setError('');
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const response = await fetch('/auth/two-factor/setup', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken || '' },
                body: JSON.stringify({ code: typed, remember: rememberDays > 0 && remember }),
            });
            const data = await response.json().catch(() => ({}));
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
            setError(requestError.message === 'Failed to fetch'
                ? 'Can’t reach the server. Check that Laragon is running, then try again.'
                : requestError.message);
            setInvalid(true);
            setCode('');
        } finally {
            setBusy(false);
        }
    }

    async function chooseEmail() {
        if (busy || emailBusy) return;
        setEmailBusy(true);
        setError('');
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const response = await fetch('/auth/two-factor/setup/email', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken || '' },
                body: '{}',
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (data.code === 'two_factor_expired' || data.code === 'mail_failed') {
                    onCancel(data.message);
                    return;
                }
                throw new Error(response.status === 429
                    ? 'Too many tries. Please wait a minute, then try again.'
                    : (data.message || 'The code could not be sent. Please try again.'));
            }
            onChooseEmail?.(data);
        } catch (requestError) {
            setError(requestError.message === 'Failed to fetch'
                ? 'Can’t reach the server. Check your internet connection, then try again.'
                : requestError.message);
        } finally {
            setEmailBusy(false);
        }
    }

    const locked = busy || emailBusy;

    return createPortal(
        <div className="am-overlay">
            <section className="am-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="am-2fa-setup-title">
                <button type="button" className="am-close" aria-label="Cancel sign-in" onClick={() => onCancel('')} disabled={locked}>
                    <X size={18} />
                </button>
                <div className="am-body">
                    <div className="am-icon" aria-hidden="true"><Smartphone size={24} /></div>
                    <h2 id="am-2fa-setup-title" className="am-title">Connect your authenticator app</h2>
                    <p className="am-text">
                        Your Super Admin now requires an authenticator app for every account. After this, signing in to <strong>{email}</strong> needs your password <strong>and</strong> a 6-digit code from your phone.
                    </p>
                    <div className="am-qr">
                        <div className="am-qr-image">{qr && <img src={qr} alt="QR code for your authenticator app" />}</div>
                        <div>
                            <ol>
                                <li>Install <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong>.</li>
                                <li>Tap <strong>+</strong> → <strong>Scan a QR code</strong> and scan this code.</li>
                                <li>Type the 6-digit code it shows below.</li>
                            </ol>
                            {twoFactor?.secret && (
                                <div className="am-key" title="Can’t scan? Choose “Enter a setup key” in the app and type this key.">
                                    <span>{twoFactor.secret}</span>
                                    <button type="button" className="am-eye" onClick={copyKey} aria-label="Copy the setup key">
                                        {copied ? <Check size={15} /> : <Copy size={15} />}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <PageToast message={error} type="error" onShown={() => setError('')} />
                    <form className="am-form" style={{ marginTop: 14 }} onSubmit={(event) => { event.preventDefault(); submit(); }}>
                        <OtpInput
                            idPrefix="am-2fa-setup"
                            label="Code from the authenticator app"
                            value={code}
                            onChange={(next) => { setCode(next); if (invalid) setInvalid(false); }}
                            onComplete={(full) => submit(full)}
                            disabled={locked}
                            invalid={invalid}
                            autoFocus={false}
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
                            {busy ? <><span className="am-spinner" aria-hidden="true" /> Connecting…</> : <><ShieldCheck size={16} aria-hidden="true" /> Connect and sign in</>}
                        </button>
                        <p className="am-help hint-text">The code changes every 30 seconds. You have 10 minutes to finish.</p>
                        {onChooseEmail && (<>
                            <p className="am-divider">or</p>
                            <button type="button" className="am-secondary" onClick={chooseEmail} disabled={locked}>
                                {emailBusy
                                    ? <><span className="am-spinner" aria-hidden="true" /> Sending the code…</>
                                    : <><Mail size={16} aria-hidden="true" /> Use email codes instead</>}
                            </button>
                            <p className="am-help hint-text">No phone app needed: each sign-in sends a 6-digit code to <strong>{email}</strong>.</p>
                        </>)}
                    </form>
                </div>
            </section>
        </div>,
        document.body,
    );
}

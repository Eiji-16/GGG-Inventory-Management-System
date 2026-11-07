import { useState } from 'react';
import { PageToast } from '../../utils/toast';
import { createPortal } from 'react-dom';
import { CircleAlert, Smartphone, X } from 'lucide-react';
import OtpInput from './OtpInput';
import './authModal.css';

/* ===== 2FA AT SIGN-IN (2026-11-03) =====
   Shown after a correct email + password when the account has an
   authenticator app. POST /auth/two-factor { code } signs in; until then the
   person is NOT signed in. 5 wrong codes (or 5 minutes) = start again. */
export default function TwoFactorPrompt({ email, onSuccess, onCancel }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [invalid, setInvalid] = useState(false);
    const [busy, setBusy] = useState(false);

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
            const response = await fetch('/auth/two-factor', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken || '' },
                body: JSON.stringify({ code: typed }),
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

    return createPortal(
        <div className="am-overlay">
            <section className="am-modal" role="dialog" aria-modal="true" aria-labelledby="am-2fa-title">
                <button type="button" className="am-close" aria-label="Cancel sign-in" onClick={() => onCancel('')} disabled={busy}>
                    <X size={18} />
                </button>
                <div className="am-body">
                    <div className="am-icon" aria-hidden="true"><Smartphone size={24} /></div>
                    <h2 id="am-2fa-title" className="am-title">Two-step verification</h2>
                    <p className="am-text">
                        Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone and type the 6-digit code for <strong>{email}</strong>.
                    </p>
                    <PageToast message={error} type="error" onShown={() => setError('')} />
                    <form className="am-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
                        <OtpInput
                            idPrefix="am-2fa"
                            label="Authenticator code"
                            value={code}
                            onChange={(next) => { setCode(next); if (invalid) setInvalid(false); }}
                            onComplete={(full) => submit(full)}
                            disabled={busy}
                            invalid={invalid}
                        />
                        <button type="submit" className="am-primary" disabled={busy || code.length !== 6}>
                            {busy ? <><span className="am-spinner" aria-hidden="true" /> Checking…</> : 'Verify and sign in'}
                        </button>
                        <p className="am-help hint-text">The code changes every 30 seconds. Lost your phone? Ask the Super Admin to turn off the authenticator app for your account.</p>
                    </form>
                </div>
            </section>
        </div>,
        document.body,
    );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Briefcase, CircleAlert, Mail, MailCheck, UserPlus, UserRound, X } from 'lucide-react';
import './authModal.css';

/* ===== REQUEST ACCOUNT ACCESS (2026-11-03) =====
   Step 1 of account registration. The person sends their work email, full
   name and department/role (POST /auth/account-request). The Super Admin
   approves it and the system emails a one-time setup link (24 hours). */
export default function RequestAccess({ onClose }) {
    const [form, setForm] = useState({ name: '', email: '', department: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState('');

    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onClose]);

    const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

    async function submit(event) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const response = await fetch('/auth/account-request', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken || '' },
                body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), department: form.department.trim() }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = response.status === 429
                    ? 'Too many requests from this computer. Please try again in a few minutes.'
                    : (data.errors ? Object.values(data.errors).flat()[0] : data.message);
                throw new Error(message || 'The request could not be sent. Please try again.');
            }
            setSent(data.message);
        } catch (requestError) {
            setError(requestError.message === 'Failed to fetch'
                ? 'Can’t reach the server. Check that Laragon is running, then try again.'
                : requestError.message);
        } finally {
            setBusy(false);
        }
    }

    return createPortal(
        <div className="am-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
            <section className="am-modal" role="dialog" aria-modal="true" aria-labelledby="am-request-title">
                <button type="button" className="am-close" aria-label="Close" onClick={onClose} disabled={busy}>
                    <X size={18} />
                </button>
                {sent ? (
                    <div className="am-body">
                        <div className="am-icon is-success" aria-hidden="true"><MailCheck size={24} /></div>
                        <h2 id="am-request-title" className="am-title">Request sent</h2>
                        <p className="am-text">{sent}</p>
                        <ol className="am-next">
                            <li><strong>The Super Admin reviews</strong> your request.</li>
                            <li><strong>You get an email</strong> with a setup link (valid for 24 hours, one use only).</li>
                            <li><strong>You set your password</strong> and connect an authenticator app.</li>
                        </ol>
                        <button type="button" className="am-primary" onClick={onClose}>Back to sign in</button>
                    </div>
                ) : (
                    <div className="am-body">
                        <div className="am-icon" aria-hidden="true"><UserPlus size={24} /></div>
                        <h2 id="am-request-title" className="am-title">Request account access</h2>
                        <p className="am-text">No account yet? Send a request. Once the Super Admin approves it, you’ll get an email to finish your setup.</p>
                        {error && <p className="am-alert is-error" role="alert"><CircleAlert size={14} aria-hidden="true" /> {error}</p>}
                        <form className="am-form" onSubmit={submit}>
                            <label className="am-label" htmlFor="am-req-name">Full name</label>
                            <div className="am-input">
                                <UserRound size={16} aria-hidden="true" />
                                <input id="am-req-name" value={form.name} onChange={update('name')} placeholder="Juan Dela Cruz" autoComplete="name" maxLength={120} autoFocus required />
                            </div>
                            <label className="am-label" htmlFor="am-req-email">Work email</label>
                            <div className="am-input">
                                <Mail size={16} aria-hidden="true" />
                                <input id="am-req-email" type="email" value={form.email} onChange={update('email')} placeholder="name@company.com" autoComplete="email" maxLength={255} required />
                            </div>
                            <label className="am-label" htmlFor="am-req-dept">Department / role</label>
                            <div className="am-input">
                                <Briefcase size={16} aria-hidden="true" />
                                <input id="am-req-dept" value={form.department} onChange={update('department')} placeholder="e.g. Sales staff, Warehouse" maxLength={120} required />
                            </div>
                            <button type="submit" className="am-primary" disabled={busy}>
                                {busy ? <><span className="am-spinner" aria-hidden="true" /> Sending…</> : 'Send request'}
                            </button>
                            <button type="button" className="am-link" onClick={onClose} disabled={busy}>
                                <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
                            </button>
                        </form>
                    </div>
                )}
            </section>
        </div>,
        document.body,
    );
}

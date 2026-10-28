import './index.css';
import './login.css';
import { useState } from 'react';
import {
    ArrowRight, Boxes, Eye, EyeOff, LineChart, Lock, Mail, PackageCheck, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import ResetPass from './ResetPass/resetPass';

/* ===== LOGIN =====
   Same sign-in as before (POST /auth/login, then onLogin(user)); only the
   page design changed. Left: the system's name and what it does. Right: the
   sign-in form. On phones the left panel shrinks to a short banner. */
const FEATURES = [
    { Icon: Boxes, title: 'Stock Control', text: 'Every Stock In, Stock Out and correction, by user and date.' },
    { Icon: LineChart, title: 'Sales Forecasting', text: 'Weighted Moving Average forecast with seasonal adjustments.' },
    { Icon: PackageCheck, title: 'Reorder Planning', text: 'Reorder points and Economic Order Quantity for every product.' },
];

function Login({ onLogin }) {
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);
        const email = formData.get('email');
        const password = formData.get('password');
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken || '',
                },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json();

            if (!response.ok) {
                const validationMessage = data.errors
                    ? Object.values(data.errors).flat()[0]
                    : null;
                setError(validationMessage || data.message || 'Login failed.');
                return;
            }

            // Use the new security token from sign-in for the next saves
            // (same as logout does); the old one stops working after sign-in.
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta && data.csrfToken) {
                csrfMeta.content = data.csrfToken;
            }

            onLogin(data.user);
        } catch (requestError) {
            console.error('Login request failed:', requestError);
            setError('Can’t reach the server. Check that Laragon is running, then try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    const watchCapsLock = (event) => {
        if (typeof event.getModifierState === 'function') setCapsLockOn(event.getModifierState('CapsLock'));
    };

    return (
        <div className="lg-page">
            <div className="lg-shell">
                {/* ===== BRAND PANEL ===== */}
                <aside className="lg-brand" aria-label="About the system">
                    <div className="lg-brand-grid" aria-hidden="true" />
                    <div className="lg-brand-glow" aria-hidden="true" />

                    <div className="lg-brand-top">
                        <span className="lg-mark" aria-hidden="true"><Boxes size={20} strokeWidth={2} /></span>
                        <span className="lg-brand-name">
                            <strong>Global Growth Guide</strong>
                            <small>Inventory Management System</small>
                        </span>
                    </div>

                    <div className="lg-brand-copy">
                        <h1>Know your stock.<br /><span>Order before you run out.</span></h1>
                        <p>One place for products, stock, sales forecasts and reorder suggestions.</p>
                    </div>

                    <ul className="lg-features">
                        {FEATURES.map(({ Icon, title, text }) => (
                            <li key={title}>
                                <span className="lg-feature-icon" aria-hidden="true"><Icon size={15} /></span>
                                <span>
                                    <strong>{title}</strong>
                                    <small>{text}</small>
                                </span>
                            </li>
                        ))}
                    </ul>

                    <p className="lg-brand-foot">© {new Date().getFullYear()} Global Growth Guide</p>
                </aside>

                {/* ===== SIGN-IN FORM ===== */}
                <main className="lg-form-side">
                    <div className="lg-form-wrap">
                        <header className="lg-heading">
                            <span className="lg-eyebrow"><ShieldCheck size={12} aria-hidden="true" /> Secure sign-in</span>
                            <h2>Welcome back</h2>
                            <p>Sign in with your work email to continue.</p>
                        </header>

                        <form className="lg-form" onSubmit={handleSubmit} noValidate={false}>
                            <div className="lg-field">
                                <label htmlFor="email">Email</label>
                                <div className="lg-input">
                                    <Mail size={16} aria-hidden="true" className="lg-input-icon" />
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        placeholder="name@company.com"
                                        autoComplete="username"
                                        autoFocus
                                        required
                                    />
                                </div>
                            </div>

                            <div className="lg-field">
                                <div className="lg-label-row">
                                    <label htmlFor="password">Password</label>
                                    <button type="button" className="lg-link" onClick={() => setShowPasswordReset(true)}>
                                        Forgot password?
                                    </button>
                                </div>
                                <div className="lg-input">
                                    <Lock size={16} aria-hidden="true" className="lg-input-icon" />
                                    <input
                                        id="password"
                                        type={isPasswordVisible ? 'text' : 'password'}
                                        name="password"
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                        onKeyUp={watchCapsLock}
                                        onKeyDown={watchCapsLock}
                                        onBlur={() => setCapsLockOn(false)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="lg-eye"
                                        onClick={() => setIsPasswordVisible((visible) => !visible)}
                                        aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                                        aria-pressed={isPasswordVisible}
                                    >
                                        {isPasswordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                </div>
                                {capsLockOn && (
                                    <small className="lg-caps" role="status"><TriangleAlert size={12} aria-hidden="true" /> Caps Lock is on</small>
                                )}
                            </div>

                            {error && (
                                <p className="lg-error" role="alert"><TriangleAlert size={14} aria-hidden="true" /> {error}</p>
                            )}

                            <button type="submit" className="lg-submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <><span className="lg-spinner" aria-hidden="true" /> Signing in…</>
                                ) : (
                                    <>Sign in <ArrowRight size={16} aria-hidden="true" className="lg-submit-arrow" /></>
                                )}
                            </button>
                        </form>

                        <p className="lg-help">
                            No account yet? Ask your Super Admin to create one in <b>Staffs</b>.
                        </p>
                    </div>
                </main>
            </div>
            {showPasswordReset && (
                <ResetPass onBack={() => setShowPasswordReset(false)} />
            )}
        </div>
    );
}

export default Login;

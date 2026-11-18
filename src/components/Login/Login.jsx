import './index.css';
import { PageToast } from '../../utils/toast';
import './login.css';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
    ArrowRight, Boxes, Eye, EyeOff, LineChart, Lock, Mail, Moon, PackageCheck, ShieldCheck, Sun, TriangleAlert, UserPlus,
} from 'lucide-react';
import ResetPass from './ResetPass/resetPass';
import TwoFactorPrompt from './TwoFactorPrompt';
import TwoFactorSetupPrompt from './TwoFactorSetupPrompt';
import RequestAccess from './RequestAccess';
import { useSystemName } from '../../systemName';

/* ===== LOGIN =====
   Same sign-in as before (POST /auth/login, then onLogin(user)); only the
   page design changed. Left: the system's name and what it does. Right: the
   sign-in form. On phones the left panel shrinks to a short banner. */
const FEATURES = [
    { Icon: Boxes, title: 'Stock Control', text: 'Every Stock In, Stock Out and correction, by user and date.' },
    { Icon: LineChart, title: 'Sales Forecasting', text: 'Weighted Moving Average forecast with seasonal adjustments.' },
    { Icon: PackageCheck, title: 'Reorder Planning', text: 'Reorder points and Economic Order Quantity for every product.' },
];

/* Night look (2026-11-16): from 6:00 PM to 5:59 AM on this computer's clock
   the sign-in page shows the stock room at night (one small lamp). */
const isNightHour = () => {
    const hour = new Date().getHours();
    return hour >= 18 || hour < 6;
};

function Login({ onLogin }) {
    // The system's name chosen by the Super Admin (Settings → System name).
    const systemName = useSystemName();
    // Day or night look, following the clock (checked every minute). The
    // sun / moon button switches it for this visit only.
    const [isNight, setIsNight] = useState(isNightHour);
    const [lookPicked, setLookPicked] = useState(false);
    const [lampLeaving, setLampLeaving] = useState(false);   // night → day: the lamp goes up first
    const lookBtnRef = useRef(null);
    const lookBtnCardRef = useRef(null);   // phones: the same button inside the blue card (2026-11-18)
    const isNightRef = useRef(isNight);
    isNightRef.current = isNight;
    const switchingRef = useRef(false);

    /* Switch day ↔ night with a circle that grows from the sun / moon button
       (2026-11-16, sign-in page only). Night → day: the lamp's light goes
       off and the lamp is pulled up first. Browsers without this effect (or
       "reduce motion") just switch. */
    const switchLook = (nextNight) => {
        if (switchingRef.current || nextNight === isNightRef.current) return;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const reveal = () => {
            const apply = () => { setLampLeaving(false); setIsNight(nextNight); };
            if (reduceMotion || typeof document.startViewTransition !== 'function') {
                apply();
                switchingRef.current = false;
                return;
            }
            // The circle starts from whichever sun / moon button is on screen.
            const shown = [lookBtnRef.current, lookBtnCardRef.current].find((el) => el && el.offsetParent !== null);
            const button = shown?.getBoundingClientRect();
            const x = button ? ((button.left + button.width / 2) / window.innerWidth) * 100 : 100;
            const y = button ? ((button.top + button.height / 2) / window.innerHeight) * 100 : 0;
            const root = document.documentElement;
            root.classList.add('lg-revealing');
            const transition = document.startViewTransition(() => flushSync(apply));
            transition.ready.then(() => {
                root.animate(
                    { clipPath: [`circle(0% at ${x}% ${y}%)`, `circle(150% at ${x}% ${y}%)`] },
                    { duration: 750, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
                );
            }).catch(() => {});
            transition.finished.finally(() => {
                root.classList.remove('lg-revealing');
                switchingRef.current = false;
            });
        };
        switchingRef.current = true;
        if (isNightRef.current && !nextNight && !reduceMotion) {
            setLampLeaving(true);
            window.setTimeout(reveal, 750);
        } else {
            reveal();
        }
    };

    useEffect(() => {
        if (lookPicked) return undefined;
        const timer = window.setInterval(() => switchLook(isNightHour()), 60000);
        return () => window.clearInterval(timer);
    }, [lookPicked]); // switchLook reads the latest look from refs
    const [error, setError] = useState('');
    // Account made by "Approve & Invite" but the email link not clicked yet.
    const [unverifiedEmail, setUnverifiedEmail] = useState('');
    const [resendState, setResendState] = useState({ busy: false, message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);
    // 2FA: { email, method: 'app' | 'email', rememberDays } waiting for its code (null = not needed).
    const [twoFactorEmail, setTwoFactorEmail] = useState(null);
    // 2026-11-11: the account must connect an authenticator app now (Settings).
    const [twoFactorSetup, setTwoFactorSetup] = useState(null);
    const [showRequestAccess, setShowRequestAccess] = useState(false);

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
                setUnverifiedEmail(data.code === 'verify_email_first' ? String(email) : '');
                setResendState({ busy: false, message: '' });
                setError(validationMessage || data.message || 'Login failed.');
                return;
            }

            // Use the new security token from sign-in for the next saves
            // (same as logout does); the old one stops working after sign-in.
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta && data.csrfToken) {
                csrfMeta.content = data.csrfToken;
            }

            // Password OK, but the account must connect an authenticator app first.
            if (data.twoFactorSetupRequired) {
                setTwoFactorSetup({ email: String(email), twoFactor: data.twoFactor, rememberDays: data.rememberDays || 0 });
                return;
            }

            // Password OK, but this account also needs its authenticator code.
            if (data.twoFactorRequired) {
                setTwoFactorEmail({ email: String(email), method: data.method === 'email' ? 'email' : 'app', rememberDays: data.rememberDays || 0 });
                return;
            }

            onLogin(data.user);
        } catch (requestError) {
            console.error('Login request failed:', requestError);                                                                                               
            setError('Can’t reach the server. Check that Laragon is running, then try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function resendVerification() {
        setResendState({ busy: true, message: '' });
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const response = await fetch('/auth/account-setup/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': csrfToken || '' },
                body: JSON.stringify({ email: unverifiedEmail }),
            });
            const data = await response.json().catch(() => ({}));
            const message = response.status === 429
                ? 'Too many tries. Please wait a few minutes.'
                : (data.message || (response.ok ? 'A new link was sent.' : 'The link could not be sent.'));
            setResendState({ busy: false, message });
        } catch {
            setResendState({ busy: false, message: 'Can’t reach the server. Check that Laragon is running.' });
        }
    }

    const watchCapsLock = (event) => {
        if (typeof event.getModifierState === 'function') setCapsLockOn(event.getModifierState('CapsLock'));
    };

    return (
        <div className={`lg-page${isNight ? ' is-night' : ''}${lampLeaving ? ' is-lamp-leaving' : ''}`}>
            <button
                ref={lookBtnRef}
                type="button"
                className="lg-look-btn"
                onClick={() => { setLookPicked(true); switchLook(!isNight); }}
                aria-label={isNight ? 'Show the day look' : 'Show the night look'}
                title={isNight ? 'Day look' : 'Night look'}
            >
                {isNight ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
            {/* Warehouse background (2026-11-16): decoration only. At night a
                small lamp hangs over the shelf. */}
            <div className="lg-scene lg-scene-lines" aria-hidden="true" />
            <div className="lg-scene lg-scene-left" aria-hidden="true">
                <span className="lg-lamp-light" />
                <span className="lg-lamp" />
            </div>
            <div className="lg-scene lg-scene-right" aria-hidden="true" />
            <div className="lg-shell">
                {/* ===== BRAND PANEL ===== */}
                <aside className="lg-brand" aria-label="About the system">
                    <div className="lg-brand-grid" aria-hidden="true" />
                    <div className="lg-brand-glow" aria-hidden="true" />
                    {/* ===== SUN / MOON BUTTON ON PHONES (2026-11-18) =====
                        Top-right corner of the blue card; the corner button
                        of the page is hidden on phones. */}
                    <button
                        ref={lookBtnCardRef}
                        type="button"
                        className="lg-look-btn lg-look-btn-card"
                        onClick={() => { setLookPicked(true); switchLook(!isNight); }}
                        aria-label={isNight ? 'Show the day look' : 'Show the night look'}
                        title={isNight ? 'Day look' : 'Night look'}
                    >
                        {isNight ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
                    </button>

                    <div className="lg-brand-top">
                        <span className="lg-mark" aria-hidden="true"><Boxes size={20} strokeWidth={2} /></span>
                        <span className="lg-brand-name">
                            <strong>Global Growth Guide</strong>
                            <small>{systemName}</small>
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

                            {/* Error shows as a bottom-right pop-up (2026-11-06). */}
                            <PageToast message={error} type="error" />
                            {error && unverifiedEmail && (
                                <div className="lg-verify">
                                    <button type="button" className="lg-link" onClick={resendVerification} disabled={resendState.busy}>
                                        {resendState.busy ? 'Sending…' : 'Send the verification link again'}
                                    </button>
                                    {resendState.message && <small role="status">{resendState.message}</small>}
                                </div>
                            )}

                            <button type="submit" className="lg-submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <><span className="lg-spinner" aria-hidden="true" /> Signing in…</>
                                ) : (
                                    <>Sign in <ArrowRight size={16} aria-hidden="true" className="lg-submit-arrow" /></>
                                )}
                            </button>
                        </form>

                        <div className="lg-request">
                            <span>No account yet?</span>
                            <button type="button" className="lg-request-btn" onClick={() => setShowRequestAccess(true)}>
                                <UserPlus size={15} aria-hidden="true" /> Request Account Access
                            </button>
                        </div>
                    </div>
                </main>
            </div>
            {showPasswordReset && (
                <ResetPass onBack={() => setShowPasswordReset(false)} />
            )}
            {showRequestAccess && (
                <RequestAccess onClose={() => setShowRequestAccess(false)} />
            )}
            {twoFactorSetup && (
                <TwoFactorSetupPrompt
                    email={twoFactorSetup.email}
                    twoFactor={twoFactorSetup.twoFactor}
                    rememberDays={twoFactorSetup.rememberDays}
                    onSuccess={(user) => { setTwoFactorSetup(null); onLogin(user); }}
                    onCancel={(message) => { setTwoFactorSetup(null); setError(message || ''); }}
                    onChooseEmail={(sent) => {
                        // 2026-11-12: "Use email codes instead" — the code is already emailed.
                        const { email: setupEmail, rememberDays } = twoFactorSetup;
                        setTwoFactorSetup(null);
                        setTwoFactorEmail({ email: setupEmail, method: 'email', rememberDays, setup: true, resendIn: sent?.resendInSeconds || 60 });
                    }}
                />
            )}
            {twoFactorEmail && (
                <TwoFactorPrompt
                    email={twoFactorEmail.email}
                    method={twoFactorEmail.method}
                    rememberDays={twoFactorEmail.rememberDays}
                    setup={Boolean(twoFactorEmail.setup)}
                    initialResendIn={twoFactorEmail.resendIn || 0}
                    onSuccess={(user) => { setTwoFactorEmail(null); onLogin(user); }}
                    onCancel={(message) => { setTwoFactorEmail(null); setError(message || ''); }}
                />
            )}
        </div>
    );
}

export default Login;

import React, { useEffect, useLayoutEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CircleAlert, RefreshCw } from 'lucide-react';
import Login from '../components/Login/Login';
import AccountSetup from '../components/Login/AccountSetup';
import LandingPage from '../components/LandingPage/landingPage';
import './app-error.css';
import '../styles/motion.css'; /* subtle shared animations (hover, fades, pop-ups) */
import '../styles/polish.css'; /* finishing layer: focus, inputs, main buttons, cards, tables */
import { startSlidingTabs } from '../utils/slidingTabs';
import { startMobileFolders, startStickingCards } from '../utils/mobileFolders';
import { startLoadingBar } from '../utils/loadingBar';
import { DEFAULT_THEME, normalizeTheme, readSavedTheme, readUserTheme, saveTheme, saveUserTheme } from '../theme';
import apiFetch from '../apiFetch';
import { CurrencyProvider } from '../CurrencyContext';
import { applyShowFieldHints, readShowFieldHints } from '../fieldHints';
import { applyFontSize, readFontSize } from '../fontSize';
import { startChartTooltip } from '../utils/chartTooltip';
import { startScrollEdgeGlow } from '../utils/scrollEdgeGlow';
import { startExitAnimations } from '../utils/exitAnimations';
import { startSidebarSlider } from '../utils/sidebarSlider';

// Apply the saved "Show field descriptions" choice before the first render.
applyShowFieldHints(readShowFieldHints());
// Apply the saved font size (Settings → Font size) before the first render.
applyFontSize(readFontSize());
// Data box on hover for every chart (elements with data-tip="…").
startChartTooltip();
startScrollEdgeGlow();   // soft accent light when a panel is scrolled to its end
startExitAnimations();   // pop-ups, menus and notifications fade out when they close
startSidebarSlider();    // one sidebar highlight that slides to the opened page
// Active tab highlights slide to the newly selected tab (all tab groups).
startSlidingTabs();
// Phones: list cards open/close on tap (see utils/mobileFolders.js).
startMobileFolders();
startStickingCards();   // 2-column cards stick under each other (no gaps)
startLoadingBar();   // thin top bar whenever the system waits for the server

// Each account has its own theme: the one saved on the account first, then
// this browser's copy for that same account, else the default theme.
const themeOf = (account) => normalizeTheme(account?.theme) || readUserTheme(account?.id) || DEFAULT_THEME;

/* The emailed account setup link (/account/setup?token=…) opens its own
   page, without signing in (see components/Login/AccountSetup.jsx). */
function App() {
    if (window.location.pathname.replace(/\/+$/, '') === '/account/setup') {
        const token = new URLSearchParams(window.location.search).get('token') || '';
        return <AccountSetup token={token} />;
    }
    return <MainApp />;
}

function MainApp() {
    const [authStatus, setAuthStatus] = useState('checking');
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    const [theme, setTheme] = useState(readSavedTheme);
    // Pop-up after a Super Admin deactivates or deletes this account:
    // null, 'account_deactivated' or 'account_deleted'.
    const [deactivationNotice, setDeactivationNotice] = useState(null);
    const [deactivationCountdown, setDeactivationCountdown] = useState(5);

    useLayoutEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        saveTheme(theme);
    }, [theme]);

    useEffect(() => {
        async function checkSession() {
            try {
                const response = await fetch('/auth/user', {
                    headers: { Accept: 'application/json' },
                });

                if (response.status === 401) {
                    const data = await response.json().catch(() => ({}));
                    showSignedOutNotice(data.code);
                    setAuthStatus('guest');
                    return;
                }
                if (!response.ok) {
                    throw new Error(`Session check failed (${response.status}).`);
                }

                const data = await response.json();
                setUser(data.user);
                setTheme(themeOf(data.user));
                setAuthStatus('authenticated');
            } catch (requestError) {
                console.error('Could not verify login session:', requestError);
                setError('We couldn’t verify your session. Please try again.');
                setAuthStatus('error');
            }
        }

        checkSession();
    }, [retryKey]);

    useEffect(() => {
        if (!deactivationNotice) return undefined;
        const countdown = window.setInterval(() => {
            setDeactivationCountdown((remaining) => Math.max(remaining - 1, 0));
        }, 1000);
        return () => window.clearInterval(countdown);
    }, [deactivationNotice]);

    useEffect(() => {
        if (authStatus !== 'authenticated' || !user) return undefined;

        let checking = false;
        let disposed = false;
        const verifySession = async () => {
            if (checking || document.visibilityState === 'hidden') return;
            checking = true;
            try {
                const response = await fetch('/auth/user', {
                    headers: { Accept: 'application/json' },
                    cache: 'no-store',
                });
                if (disposed) return;
                if (response.status === 401 || response.status === 403) {
                    const data = await response.json().catch(() => ({}));
                    showSignedOutNotice(data.code);
                    setUser(null);
                    setError('');
                    setAuthStatus('guest');
                    return;
                }
                if (!response.ok) {
                    throw new Error(`Session check failed (${response.status}).`);
                }
            } catch (requestError) {
                if (!disposed) console.error('Could not verify the active session:', requestError);
            } finally {
                checking = false;
            }
        };
        const interval = window.setInterval(verifySession, 3000);
        window.addEventListener('focus', verifySession);
        document.addEventListener('visibilitychange', verifySession);

        return () => {
            disposed = true;
            window.clearInterval(interval);
            window.removeEventListener('focus', verifySession);
            document.removeEventListener('visibilitychange', verifySession);
        };
    }, [authStatus, user?.id]);

    // The account was deactivated or deleted while signed in: show the pop-up
    // (its "Okay" button unlocks after 5 seconds).
    function showSignedOutNotice(code) {
        if (code !== 'account_deactivated' && code !== 'account_deleted') return;
        setDeactivationCountdown(5);
        setDeactivationNotice(code);
    }

    function handleSessionRevoked() {
        setUser(null);
        setError('');
        setAuthStatus('guest');
    }

    // Settings → Appearance: show the new theme now, then save it on THIS
    // account only, so other users keep their own theme.
    function handleThemeChange(nextTheme) {
        setTheme(nextTheme);
        saveUserTheme(user?.id, nextTheme);   // this account's copy in this browser
        setUser((current) => (current ? { ...current, theme: nextTheme } : current));
        apiFetch('/profile/theme', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: nextTheme }),
        })
            .then(async (response) => {
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error(body.message || `Save failed (${response.status}).`);
                }
            })
            .catch((saveError) => console.error('Could not save your theme:', saveError));
    }

    function handleRetry() {
        setError('');
        setAuthStatus('checking');
        setRetryKey((currentKey) => currentKey + 1);
    }

    async function handleLogout() {
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const response = await fetch('/auth/logout', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken || '',
                },
            });
            if (!response.ok) {
                throw new Error(`Logout failed (${response.status}).`);
            }

            const data = await response.json();
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta && data.csrfToken) {
                csrfMeta.content = data.csrfToken;
            }

            setUser(null);
            setError('');
            setAuthStatus('guest');
        } catch (requestError) {
            console.error('Logout request failed:', requestError);
            setError('We couldn’t log you out. Please try again.');
        }
    }

    return (
        <div>
            {authStatus === 'checking' && (
                <main className="app-status-screen" role="status" aria-live="polite">
                    <span className="app-status-spinner" aria-hidden="true" />
                    <p>Verifying your session...</p>
                </main>
            )}
            {authStatus === 'error' && (
                <main className="app-error-screen">
                    <section className="app-error-card" role="alert" aria-labelledby="app-error-title">
                        <div className="app-error-icon" aria-hidden="true">
                            <CircleAlert size={30} strokeWidth={1.8} />
                        </div>
                        <p className="app-error-eyebrow">CONNECTION ISSUE</p>
                        <h1 id="app-error-title">We couldn’t load your session</h1>
                        <p className="app-error-message">
                            {error || 'A temporary problem occurred while verifying your session.'}
                            {' '}Check your internet connection and try again.
                        </p>
                        <button className="app-error-retry" type="button" onClick={handleRetry}>
                            <RefreshCw size={17} aria-hidden="true" />
                            Try again
                        </button>
                        <p className="app-error-footnote">
                            Your account and saved information are safe.
                        </p>
                    </section>
                </main>
            )}
            {authStatus === 'guest' && (
                <Login
                    onLogin={(authenticatedUser) => {
                        setUser(authenticatedUser);
                        setTheme(themeOf(authenticatedUser));
                        setError('');
                        setAuthStatus('authenticated');
                    }}
                />
            )}
            {deactivationNotice && (
                <div className="app-deactivation-overlay">
                    <section
                        className="app-deactivation-dialog"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="app-deactivation-title"
                        aria-describedby="app-deactivation-message"
                    >
                        <div className="app-error-icon" aria-hidden="true">
                            <CircleAlert size={30} strokeWidth={1.8} />
                        </div>
                        <p className="app-error-eyebrow">
                            {deactivationNotice === 'account_deleted' ? 'ACCOUNT DELETED' : 'ACCOUNT DEACTIVATED'}
                        </p>
                        <h1 id="app-deactivation-title">You’ve been signed out</h1>
                        <p id="app-deactivation-message" className="app-error-message">
                            {deactivationNotice === 'account_deleted'
                                ? 'Your account has been deleted by a Super Admin, so this session has ended and the account can no longer be used.'
                                : 'Your account has been deactivated by a Super Admin, so this session has ended.'}
                            {' '}Please contact the Super Admin if you think this is a mistake.
                        </p>
                        <button
                            className="app-error-retry app-deactivation-ok"
                            type="button"
                            disabled={deactivationCountdown > 0}
                            onClick={() => setDeactivationNotice(null)}
                            style={{ '--countdown-progress': `${((5 - deactivationCountdown) / 5) * 100}%` }}
                        >
                            {deactivationCountdown > 0 ? `Okay (${deactivationCountdown})` : 'Okay'}
                        </button>
                        <p className="app-error-footnote">
                            {deactivationCountdown > 0
                                ? `Please read this message. The button unlocks in ${deactivationCountdown} second${deactivationCountdown === 1 ? '' : 's'}.`
                                : 'You can close this message now.'}
                        </p>
                    </section>
                </div>
            )}
            {authStatus === 'authenticated' && (
                <>
                    {error && <p role="alert">{error}</p>}
                    <CurrencyProvider user={user}>
                        <LandingPage
                            user={user}
                            onLogout={handleLogout}
                            onSessionRevoked={handleSessionRevoked}
                            theme={theme}
                            onThemeChange={handleThemeChange}
                        />
                    </CurrencyProvider>
                </>
            )}
        </div>
    );
}

// Initialize React root
const rootElement = document.getElementById('root');
if (!window.__reactRoot__) {
    window.__reactRoot__ = ReactDOM.createRoot(rootElement);
}
window.__reactRoot__.render(<App />);
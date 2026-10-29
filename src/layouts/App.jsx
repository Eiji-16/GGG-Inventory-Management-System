import React, { useEffect, useLayoutEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CircleAlert, RefreshCw } from 'lucide-react';
import Login from '../components/Login/Login';
import LandingPage from '../components/LandingPage/landingPage';
import './app-error.css';
import '../styles/motion.css'; /* subtle shared animations (hover, fades, pop-ups) */
import '../styles/polish.css'; /* finishing layer: focus, inputs, main buttons, cards, tables */
import { startSlidingTabs } from '../utils/slidingTabs';
import { startMobileFolders } from '../utils/mobileFolders';
import { startLoadingBar } from '../utils/loadingBar';
import { DEFAULT_THEME, normalizeTheme, readSavedTheme, readUserTheme, saveTheme, saveUserTheme } from '../theme';
import apiFetch from '../apiFetch';
import { CurrencyProvider } from '../CurrencyContext';
import { applyShowFieldHints, readShowFieldHints } from '../fieldHints';
import { applyFontSize, readFontSize } from '../fontSize';
import { startChartTooltip } from '../utils/chartTooltip';

// Apply the saved "Show field descriptions" choice before the first render.
applyShowFieldHints(readShowFieldHints());
// Apply the saved font size (Settings → Font size) before the first render.
applyFontSize(readFontSize());
// Data box on hover for every chart (elements with data-tip="…").
startChartTooltip();
// Active tab highlights slide to the newly selected tab (all tab groups).
startSlidingTabs();
// Phones: list cards open/close on tap (see utils/mobileFolders.js).
startMobileFolders();
startLoadingBar();   // thin top bar whenever the system waits for the server

// Each account has its own theme: the one saved on the account first, then
// this browser's copy for that same account, else the default theme.
const themeOf = (account) => normalizeTheme(account?.theme) || readUserTheme(account?.id) || DEFAULT_THEME;

function App() {
    const [authStatus, setAuthStatus] = useState('checking');
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    const [theme, setTheme] = useState(readSavedTheme);

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
            {authStatus === 'authenticated' && (
                <>
                    {error && <p role="alert">{error}</p>}
                    <CurrencyProvider user={user}>
                        <LandingPage
                            user={user}
                            onLogout={handleLogout}
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
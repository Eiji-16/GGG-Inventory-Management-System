import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { CircleAlert, RefreshCw } from 'lucide-react';
import Login from '../components/Login/Login';
import LandingPage from '../components/LandingPage/landingPage';
import './app-error.css';

function App() {
    const [authStatus, setAuthStatus] = useState('checking');
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);

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
                setAuthStatus('authenticated');
            } catch (requestError) {
                console.error('Could not verify login session:', requestError);
                setError('We couldn’t verify your session. Please try again.');
                setAuthStatus('error');
            }
        }

        checkSession();
    }, [retryKey]);

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
                        setError('');
                        setAuthStatus('authenticated');
                    }}
                />
            )}
            {authStatus === 'authenticated' && (
                <>
                    {error && <p role="alert">{error}</p>}
                    <LandingPage user={user} onLogout={handleLogout} />
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
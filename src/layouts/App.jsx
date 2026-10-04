import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import Login from '../components/Login/Login';
import LandingPage from '../components/LandingPage/landingPage';

function App() {
    const [authStatus, setAuthStatus] = useState('checking');
    const [user, setUser] = useState(null);
    const [error, setError] = useState('');

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
                setError('Hindi ma-verify ang session. I-refresh ang page para subukan ulit.');
                setAuthStatus('error');
            }
        }

        checkSession();
    }, []);

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
            setError('Hindi nagtagumpay ang pag-logout. Pakisubukan ulit.');
        }
    }

    return (
        <div>
            {authStatus === 'checking' && <p role="status">Checking login...</p>}
            {authStatus === 'error' && <p role="alert">{error}</p>}
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
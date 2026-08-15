import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import Login from '../components/Login/Login';
import LandingPage from '../components/LandingPage/landingPage';

function App() {
    const [page, setPage] = useState('dashboard');

    return (
        <div>
            {page === 'login' && <Login onLogin={() => setPage('dashboard')} />}
            {page === 'dashboard' && <LandingPage onLogout={() => setPage('login')} />}
        </div>
    );
}

// Initialize root once and reuse for HMR
const rootElement = document.getElementById('root');
if (!window.__reactRoot__) {
    window.__reactRoot__ = ReactDOM.createRoot(rootElement);
}
window.__reactRoot__.render(<App />);
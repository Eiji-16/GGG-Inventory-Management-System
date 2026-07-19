import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import Login from './Login';
import LandingPage from './landingPage';

function App() {
    const [page, setPage] = useState('dashboard');

    return (
        <div>
            {page === 'login' && <Login onLogin={() => setPage('dashboard')} />}
            {page === 'dashboard' && <LandingPage />}
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
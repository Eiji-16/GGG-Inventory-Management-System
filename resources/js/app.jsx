import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import Login from './Login';
import Dashboard from './Dashboard';

function App() {
    const [page, setPage] = useState('login');

    return (
        <div>
            {page === 'login' && <Login onLogin={() => setPage('dashboard')} />}
            {page === 'dashboard' && <Dashboard />}
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
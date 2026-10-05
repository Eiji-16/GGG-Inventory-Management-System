import './index.css';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import ResetPass from './ResetPass/resetPass';

function Login({ onLogin }) {
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

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

            onLogin(data.user);
        } catch (requestError) {
            console.error('Login request failed:', requestError);
            setError('Hindi makakonekta sa server. Pakisubukan ulit.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className = "Login-page-wrapper">
            <div className="Login-box">
                <div className="Design-side">
            
                    <div className="Design-overlay">
                        
                    </div>
                </div>

                <div className="Login-side">
                    <div className="WelcomeText">
                        <h2><b>Welcome back</b></h2>
                        <p>Sign in to your account to continue.</p>
                    </div>

                    <form className="Login-form" onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label htmlFor="email">Email</label>
                            <div className="input-icon">
                                <i className="fa-solid fa-user"></i>
                                <input
                                    id="email"
                                    type="email"
                                    className="input-field"
                                    name="email"
                                    placeholder="Enter your email"
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label htmlFor="password">Password</label>
                            <div className="input-icon">
                                <i className="fa-solid fa-lock"></i>
                                <input
                                    id="password"
                                    type={isPasswordVisible ? 'text' : 'password'}
                                    className="input-field"
                                    name="password"
                                    placeholder="Enter your password"
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="Password-visibility-toggle"
                                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                                    aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                                    aria-pressed={isPasswordVisible}
                                >
                                    {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && <p className="Login-error" role="alert">{error}</p>}

                        <button
                            type="button"
                            className="ForgetPassword"
                            onClick={() => setShowPasswordReset(true)}
                        >
                            Forgot your password?
                        </button>

                        <button type="submit" className="Login-button" disabled={isSubmitting}>
                            <b><span>{isSubmitting ? 'Signing in...' : 'Login'}</span></b>
                        </button>
                    </form>
                </div>
            </div>
            {showPasswordReset && (
                <ResetPass onBack={() => setShowPasswordReset(false)} />
            )}
        </div>
    );
}



export default Login;

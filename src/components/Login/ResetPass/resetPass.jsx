import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, ShieldCheck, LockKeyhole, Eye, EyeOff } from 'lucide-react';

function ResetPass({ onBack }) {
    const [step, setStep] = useState('email');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [visiblePasswords, setVisiblePasswords] = useState({
        password: false,
        confirmation: false,
    });

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !isSubmitting) onBack();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isSubmitting, onBack]);

    async function postJson(url, payload) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken || '',
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            const validationMessage = data.errors
                ? Object.values(data.errors).flat()[0]
                : null;
            throw new Error(validationMessage || data.message || 'The request failed. Please try again.');
        }

        return data;
    }

    async function requestOtp(event) {
        event.preventDefault();
        setError('');
        setMessage('');
        setIsSubmitting(true);

        const formData = new FormData(event.currentTarget);
        const requestedEmail = formData.get('email');

        try {
            const data = await postJson('/auth/password/otp', { email: requestedEmail });
            setEmail(requestedEmail);
            setMessage(data.message);
            setStep('otp');
        } catch (requestError) {
            console.error('Password reset OTP request failed:', requestError);
            setError(requestError.message || 'Unable to connect to the server. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    async function resetPassword(event) {
        event.preventDefault();
        setError('');
        setMessage('');
        setIsSubmitting(true);

        const formData = new FormData(event.currentTarget);

        try {
            const data = await postJson('/auth/password/reset', {
                email,
                otp: formData.get('otp'),
                password: formData.get('password'),
                password_confirmation: formData.get('password_confirmation'),
            });
            setMessage(data.message);
            setStep('complete');
        } catch (requestError) {
            console.error('Password reset failed:', requestError);
            setError(requestError.message || 'Unable to connect to the server. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }

    function togglePasswordVisibility(field) {
        setVisiblePasswords((current) => ({
            ...current,
            [field]: !current[field],
        }));
    }

    return createPortal(
        <div
            className="ResetPass-overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isSubmitting) onBack();
            }}
        >
            <section
                className="ResetPass-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reset-modal-title"
            >
                <button
                    type="button"
                    className="ResetPass-close"
                    aria-label="Close password reset"
                    onClick={onBack}
                    disabled={isSubmitting}
                >
                    <X size={19} />
                </button>

                <div className="ResetPass-icon" aria-hidden="true">
                    {step === 'email' && <Mail size={23} />}
                    {step === 'otp' && <ShieldCheck size={23} />}
                    {step === 'complete' && <LockKeyhole size={23} />}
                </div>

                <div className="ResetPass-heading">
                    <h2 id="reset-modal-title">
                        {step === 'email' && 'Forgot password?'}
                        {step === 'otp' && 'Check your email'}
                        {step === 'complete' && 'Password updated'}
                    </h2>
                    <p>
                        {step === 'email' && 'Enter your account email and we will send you a one-time code.'}
                        {step === 'otp' && `Enter the 6-digit code sent to ${email}, then choose a new password.`}
                        {step === 'complete' && 'You can now sign in with your new password.'}
                    </p>
                </div>

                {message && <p className="ResetPass-message" role="status">{message}</p>}
                {error && <p className="Login-error" role="alert">{error}</p>}

                {step === 'email' && (
                    <form className="Login-form" onSubmit={requestOtp}>
                        <div className="input-group">
                            <label htmlFor="reset-email">Email address</label>
                            <div className="input-icon">
                                <i className="fa-solid fa-envelope"></i>
                                <input
                                    id="reset-email"
                                    type="email"
                                    name="email"
                                    className="input-field"
                                    placeholder="Enter your account email"
                                    autoComplete="email"
                                    required
                                />
                            </div>
                        </div>
                        <button type="submit" className="ResetPass-submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Sending code...' : 'Send OTP'}
                        </button>
                        <button type="button" className="ResetPass-back" onClick={onBack}>
                            Back to login
                        </button>
                    </form>
                )}

                {step === 'otp' && (
                    <form className="Login-form" onSubmit={resetPassword}>
                        <div className="input-group">
                            <label htmlFor="reset-otp">6-digit OTP</label>
                            <div className="input-icon">
                                <i className="fa-solid fa-shield-halved"></i>
                                <input
                                    id="reset-otp"
                                    type="text"
                                    name="otp"
                                    className="input-field ResetPass-otp"
                                    placeholder="000000"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]{6}"
                                    maxLength="6"
                                    required
                                />
                            </div>
                        </div>
                        <div className="input-group">
                            <label htmlFor="reset-password">New password</label>
                            <div className="input-icon">
                                <i className="fa-solid fa-lock"></i>
                                <input
                                    id="reset-password"
                                    type={visiblePasswords.password ? 'text' : 'password'}
                                    name="password"
                                    className="input-field"
                                    placeholder="At least 8 characters"
                                    autoComplete="new-password"
                                    minLength="8"
                                    required
                                />
                                <button
                                    type="button"
                                    className="Password-visibility-toggle"
                                    onClick={() => togglePasswordVisibility('password')}
                                    aria-label={visiblePasswords.password ? 'Hide new password' : 'Show new password'}
                                    aria-pressed={visiblePasswords.password}
                                >
                                    {visiblePasswords.password ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div className="input-group">
                            <label htmlFor="reset-password-confirm">Confirm new password</label>
                            <div className="input-icon">
                                <i className="fa-solid fa-lock"></i>
                                <input
                                    id="reset-password-confirm"
                                    type={visiblePasswords.confirmation ? 'text' : 'password'}
                                    name="password_confirmation"
                                    className="input-field"
                                    placeholder="Enter the password again"
                                    autoComplete="new-password"
                                    minLength="8"
                                    required
                                />
                                <button
                                    type="button"
                                    className="Password-visibility-toggle"
                                    onClick={() => togglePasswordVisibility('confirmation')}
                                    aria-label={visiblePasswords.confirmation ? 'Hide password confirmation' : 'Show password confirmation'}
                                    aria-pressed={visiblePasswords.confirmation}
                                >
                                    {visiblePasswords.confirmation ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="ResetPass-submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Updating...' : 'Reset password'}
                        </button>
                        <button
                            type="button"
                            className="ResetPass-back"
                            onClick={() => {
                                setError('');
                                setMessage('');
                                setStep('email');
                            }}
                        >
                            Use a different email
                        </button>
                    </form>
                )}

                {step === 'complete' && (
                    <button type="button" className="ResetPass-submit" onClick={onBack}>
                        Back to login
                    </button>
                )}
            </section>
        </div>,
        document.body,
    );
}

export default ResetPass;
import { useState } from 'react';

function ResetPass({ onBack }) {
    const [step, setStep] = useState('email');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    return (
        <div className="Login-page-wrapper">
            <div className="Login-box">
                <div className="Design-side">
                    <div className="Design-overlay">
                        <h1>Account recovery</h1>
                        <p>Securely regain access to your inventory account.</p>
                    </div>
                </div>

                <div className="Login-side">
                    <div className="WelcomeText">
                        <h2>
                            <b>
                                {step === 'email' && 'Forgot password?'}
                                {step === 'otp' && 'Check your email'}
                                {step === 'complete' && 'Password updated'}
                            </b>
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
                                <label htmlFor="reset-email">Email</label>
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
                            <button type="submit" className="Login-button" disabled={isSubmitting}>
                                <b><span>{isSubmitting ? 'Sending code...' : 'Send OTP'}</span></b>
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
                                        type="password"
                                        name="password"
                                        className="input-field"
                                        placeholder="At least 8 characters"
                                        autoComplete="new-password"
                                        minLength="8"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label htmlFor="reset-password-confirm">Confirm new password</label>
                                <div className="input-icon">
                                    <i className="fa-solid fa-lock"></i>
                                    <input
                                        id="reset-password-confirm"
                                        type="password"
                                        name="password_confirmation"
                                        className="input-field"
                                        placeholder="Enter the password again"
                                        autoComplete="new-password"
                                        minLength="8"
                                        required
                                    />
                                </div>
                            </div>
                            <button type="submit" className="Login-button" disabled={isSubmitting}>
                                <b><span>{isSubmitting ? 'Updating...' : 'Reset password'}</span></b>
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
                        <button type="button" className="Login-button" onClick={onBack}>
                            <b><span>Back to login</span></b>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ResetPass;
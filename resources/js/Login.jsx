import "../css/index.css";

const samplepic = "/image/sample.jpg";

function Login({ onLogin }) {
    return (
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

                <form className="Login-form" onSubmit={onLogin}>
                    <div className="input-group">
                        <label htmlFor="uname">Username</label>
                        <div className="input-icon">
                            <i className="fa-solid fa-user"></i>
                            <input
                                id="uname"
                                type="text"
                                className="input-field"
                                name="uname"
                                placeholder="Enter your username"
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="psw">Password</label>
                        <div className="input-icon">
                            <i className="fa-solid fa-lock"></i>
                            <input
                                id="psw"
                                type="password"
                                className="input-field"
                                name="psw"
                                placeholder="Enter your password"
                                required
                            />
                        </div>
                    </div>

                    <div className="ForgetPassword">Forgot your password?</div>

                    <button type="submit" className="Login-button">
                        <b>Login</b>
                    </button>
                </form>
            </div>
        </div>
    );
}



export default Login;
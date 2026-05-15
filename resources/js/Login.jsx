import "../css/index.css";

const samplepic = "/image/sample.jpg";

function Login({ onLogin }) {
    return (
        <div className="Login-box">

                                {/* Design side panel */}
            <div className="Design-side">
                <img src={samplepic} alt="Design Picture"/>
            </div>

                                {/* Login side panel */}
            <div className="Login-side">

            <div className="WelcomeText"> <h1><b>Welcome</b></h1> </div>

                <div className="input-group">
                    <div className="input-icon">
                        <i className="fa-solid fa-user"></i>
                        <label htmlFor="uname"><b>User Account</b></label>
                        <input type="text" className="input-field"  name="uname" required />
                    </div>
                </div>
                <div className="input-group">
                    <div className="input-icon">
                        <i className="fa-solid fa-lock"></i>
                        <label htmlFor="psw"><b>Password</b></label>
                        <input type="password" className="input-field"  name="psw" required />
                    </div>
                </div>
                                {/* Forgot password */}
                    <div className = "ForgetPassword">Forgot your password?</div>
                                {/* Log in Button */}
                    <button type="submit" className="Login-button" onClick={onLogin}>
                        <b>Login</b>
                    </button>


            </div>
        </div>
    );
}



export default Login;
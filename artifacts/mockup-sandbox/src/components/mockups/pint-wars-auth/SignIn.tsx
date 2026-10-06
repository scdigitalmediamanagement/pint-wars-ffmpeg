import { AuthFrame } from "./_shared/AuthFrame";
import "./SignIn.css";

export function SignIn() {
  return (
    <AuthFrame className="pwsi-content">
      <div className="pwsi-screen">
        <section className="pwsi-intro" aria-labelledby="pwsi-title">
          <div className="pwsi-kicker" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1 id="pwsi-title">Bring your mates.<br />Chase the leaderboard.</h1>
          <p>Create a private Pint War, invite your friends, and make every pint count.</p>
        </section>

        <form className="pwsi-form" aria-label="Sign in">
          <div className="pwsi-field">
            <label htmlFor="pwsi-email">Email</label>
            <input
              id="pwsi-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div className="pwsi-field">
            <label htmlFor="pwsi-password">Password</label>
            <input
              id="pwsi-password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </div>

          <div className="pwsi-forgot">Forgot password?</div>

          <button className="pwsi-submit" type="button">
            <span>Sign in</span>
            <span className="pwsi-submit-mark" aria-hidden="true">→</span>
          </button>
        </form>

        <footer className="pwsi-footer">
          <span>New to Pint Wars?</span>
          <span className="pwsi-create-account">Create an account</span>
        </footer>
      </div>
    </AuthFrame>
  );
}

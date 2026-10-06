import { ArrowLeft, Mail } from "lucide-react";
import { AuthFrame } from "./_shared/AuthFrame";
import "./ForgotPassword.css";

export function ForgotPassword() {
  return (
    <AuthFrame className="pw-recovery-frame">
      <div className="pw-recovery">
        <div className="pw-recovery-mark" aria-hidden="true">
          <span className="pw-recovery-mark__orbit" />
          <span className="pw-recovery-mark__coin">
            <Mail size={24} strokeWidth={1.6} />
          </span>
          <span className="pw-recovery-mark__spark pw-recovery-mark__spark--one" />
          <span className="pw-recovery-mark__spark pw-recovery-mark__spark--two" />
        </div>

        <header className="pw-recovery-heading">
          <p className="pw-recovery-eyebrow">Account access</p>
          <h1>Reset your<br />password</h1>
          <p className="pw-recovery-description">
            Enter your email and we&apos;ll send instructions to create a new password.
          </p>
        </header>

        <form className="pw-recovery-form" aria-label="Reset your password">
          <label className="pw-recovery-label" htmlFor="pw-recovery-email">Email</label>
          <input
            className="pw-recovery-input"
            id="pw-recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@example.com"
            aria-label="Email"
          />
          <button className="pw-recovery-submit" type="button">
            <span>Send reset link</span>
            <span className="pw-recovery-submit__arrow" aria-hidden="true">↗</span>
          </button>
        </form>

        <button className="pw-recovery-return" type="button">
          <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>Return to sign in</span>
        </button>
      </div>
    </AuthFrame>
  );
}

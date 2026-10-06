import React from "react";
import { ArrowRight, Crown } from "lucide-react";
import { AuthFrame } from "./_shared/AuthFrame";
import "./CreateAccount.css";

export function CreateAccount() {
  return (
    <AuthFrame className="pw-create">
      <div className="pw-create__inner">
        <div className="pw-create__ornament" aria-hidden="true">
          <span className="pw-create__ornament-line" />
          <span className="pw-create__ornament-mark"><Crown size={14} strokeWidth={1.8} /></span>
          <span className="pw-create__ornament-line" />
        </div>

        <header className="pw-create__heading">
          <p className="pw-create__eyebrow">Start your record</p>
          <h1>Make your first<br /><span>war count.</span></h1>
        </header>

        <form className="pw-create__form" aria-label="Create account">
          <label className="pw-create__field">
            <span>Display name</span>
            <input
              type="text"
              name="displayName"
              autoComplete="name"
              placeholder="How your mates will see you"
              aria-label="Display name"
            />
          </label>

          <label className="pw-create__field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Email"
            />
          </label>

          <label className="pw-create__field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              aria-label="Password, at least 6 characters"
            />
            <span className="pw-create__field-rule" aria-hidden="true" />
          </label>

          <button className="pw-create__submit" type="button">
            <span>Create account</span>
            <span className="pw-create__submit-icon" aria-hidden="true"><ArrowRight size={17} strokeWidth={2.2} /></span>
          </button>
        </form>

        <div className="pw-create__signin">
          <span>Already have an account?</span>
          <span className="pw-create__signin-link" role="link" aria-label="Sign in">Sign in</span>
        </div>
      </div>
    </AuthFrame>
  );
}

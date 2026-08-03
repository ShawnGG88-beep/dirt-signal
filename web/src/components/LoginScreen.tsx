import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Email/password sign-in for the single dashboard user. There is no
 * self-service sign-up: the account is created once in the Supabase
 * dashboard. The session persists in localStorage (supabase-js default),
 * so a phone stays signed in between visits.
 */
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
    }
    // On success the auth listener in App swaps in the dashboard.
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={onSubmit}>
        <h1>Dirt Signal</h1>
        <p className="login-subtitle">
          Sign in to the monitoring dashboard. Accounts are created by the
          administrator; there is no sign-up.
        </p>
        <label className="form-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <button type="submit" className="btn-primary login-submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

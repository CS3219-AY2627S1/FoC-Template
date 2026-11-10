import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { useAuth } from "../app/use-auth";
import { FormField } from "../components/form-field";
import { APP_NAME } from "../app/branding";
import { AppBrandMark } from "../components/app-brand";

type SignInLocationState = {
  email?: string;
  message?: string;
};

export function SignInPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as SignInLocationState;
  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate("/profile", { replace: true });
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "We could not sign you in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-hidden="true">
        <div className="auth-story-inner">
          <p className="auth-kicker">{APP_NAME}</p>
          <h1>Campus errands work better together.</h1>
          <p>Sign in to request an errand or lend a hand nearby.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <AppBrandMark />
            <div>
              <h1>Welcome back</h1>
              <p>Sign in to request errands or help someone nearby.</p>
            </div>
          </div>
          {state.message ? <p className="form-success" role="status">{state.message}</p> : null}
          <form onSubmit={handleSubmit}>
            <FormField
              autoComplete="email"
              label="NUS email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@u.nus.edu"
              required
              type="email"
              value={email}
            />
            <FormField
              autoComplete="current-password"
              label="Password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary button-block" disabled={busy} type="submit">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div className="auth-divider"><span>New here?</span></div>
          <Link className="button button-outline button-block" to="/register">Create an account</Link>
        </div>
      </section>
    </main>
  );
}

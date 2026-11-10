import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { userService } from "../api/user-service";
import { FormField } from "../components/form-field";
import { AppBrandMark } from "../components/app-brand";

type VerificationLocationState = { email?: string; message?: string };

export function VerifyEmailPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as VerificationLocationState;
  const [email, setEmail] = useState(state.email ?? "");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState(state.message);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const navigate = useNavigate();

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      await userService.verifyEmail(email.trim(), otp);
      navigate("/sign-in", {
        replace: true,
        state: { email: email.trim(), message: "Email verified. You can sign in now." },
      });
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "We could not verify that code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(undefined);
    setResending(true);
    try {
      const pending = await userService.resendVerification(email.trim());
      setEmail(pending.email);
      setMessage("A new six-digit code is on its way to your email.");
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "We could not resend the code. Try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-panel">
        <div className="auth-form-wrap verification-wrap">
          <div className="auth-heading">
            <AppBrandMark />
            <div>
              <h1>Check your email</h1>
              <p>Enter the verification code sent to your NUS email.</p>
            </div>
          </div>
          {message ? <p className="form-success" role="status">{message}</p> : null}
          <form onSubmit={verify}>
            <FormField autoComplete="email" label="NUS email" onChange={(event) => setEmail(event.target.value)} placeholder="you@u.nus.edu" required type="email" value={email} />
            <FormField autoComplete="one-time-code" inputMode="numeric" label="Six-digit verification code" maxLength={6} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} pattern="[0-9]{6}" placeholder="123456" required value={otp} />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary button-block" disabled={busy} type="submit">
              {busy ? "Verifying…" : "Verify email"}
            </button>
          </form>
          <div className="verification-actions">
            <button className="text-button" disabled={resending || !email} onClick={resend} type="button">
              {resending ? "Sending a new code…" : "Resend code"}
            </button>
            <Link to="/register">Use a different email</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isApiRequestError, type FieldError } from "../api/client";
import { userService } from "../api/user-service";
import { passwordFormatError, validateRegistration } from "../api/validation";
import { FormField } from "../components/form-field";
import { PasswordRequirements, passwordHintText } from "../components/password-requirements";
import { APP_NAME } from "../app/branding";
import { AppBrandMark } from "../components/app-brand";

type RegistrationForm = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

const emptyForm: RegistrationForm = {
  username: "",
  displayName: "",
  email: "",
  password: "",
  passwordConfirmation: "",
};

function mapFieldErrors(errors: FieldError[]): Record<string, string> {
  return Object.fromEntries(errors.map((error) => [error.field, error.message]));
}

export function RegistrationPage() {
  const [form, setForm] = useState<RegistrationForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  function updateField<Key extends keyof RegistrationForm>(field: Key, value: RegistrationForm[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientErrors = validateRegistration(form);
    setFieldErrors(clientErrors);
    setError(undefined);
    if (Object.keys(clientErrors).length) return;

    setBusy(true);
    try {
      const pending = await userService.startRegistration({
        username: form.username,
        displayName: form.displayName || undefined,
        email: form.email.trim(),
        password: form.password,
      });
      navigate("/verify-email", {
        replace: true,
        state: { email: pending.email, message: "We sent a six-digit code to your NUS email." },
      });
    } catch (requestError) {
      if (isApiRequestError(requestError)) {
        setFieldErrors(mapFieldErrors(requestError.fieldErrors));
        setError(requestError.message);
      } else {
        setError("We could not create your account. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story auth-story-register" aria-hidden="true">
        <div className="auth-story-inner">
          <p className="auth-kicker">{APP_NAME}</p>
          <h1>A familiar face for every small errand.</h1>
          <p>Start with your verified NUS student account.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap auth-form-register">
          <div className="auth-heading">
            <AppBrandMark />
            <div>
              <h1>Create your account</h1>
              <p>We’ll verify your NUS email before your account becomes active.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <FormField error={fieldErrors.displayName} label="Display name (Optional)" onChange={(event) => updateField("displayName", event.target.value)} value={form.displayName} />
            <FormField error={fieldErrors.username} label="Username" onChange={(event) => updateField("username", event.target.value)} required value={form.username} />
            <FormField autoComplete="email" error={fieldErrors.email} label="NUS email" onChange={(event) => updateField("email", event.target.value)} placeholder="you@u.nus.edu" required type="email" value={form.email} />
            <FormField
              autoComplete="new-password"
              error={fieldErrors.password ? <PasswordRequirements>{passwordFormatError}</PasswordRequirements> : undefined}
              hint={<PasswordRequirements>{passwordHintText}</PasswordRequirements>}
              label="Password"
              onChange={(event) => updateField("password", event.target.value)}
              required
              type="password"
              value={form.password}
            />
            <FormField autoComplete="new-password" error={fieldErrors.passwordConfirmation} label="Confirm password" onChange={(event) => updateField("passwordConfirmation", event.target.value)} required type="password" value={form.passwordConfirmation} />
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button button-primary button-block" disabled={busy} type="submit">
              {busy ? "Sending code…" : "Send verification code"}
            </button>
          </form>
          <p className="auth-footer">Already have an account? <Link to="/sign-in">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}

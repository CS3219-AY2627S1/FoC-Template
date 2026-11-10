/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the login page from the desktop and mobile mockups.
 * Reviewed by Ngooi Jun Sen.
 *
 * Covers UI FR3.1 to FR3.3. The error message is deliberately generic
 * (UI FR3.2.1, User F2.2) so it cannot be used to discover which addresses
 * have accounts.
 *
 * A suspended account gets 403 ACCOUNT_SUSPENDED after a correct password and
 * no session. The page then offers an appeal, which the User Service checks
 * against the same email and password; nothing else proves who they are.
 */

import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { TextAreaField } from '../components/ui/Inputs';
import { TextField } from '../components/ui/TextField';
import { ApiError, errorMessage } from '../lib/api';
import { SUPPORT_TEXT_MAX_LENGTH, submitAppeal } from '../lib/moderation';
import styles from './LoginPage.module.css';

/**
 * The only message shown for any failed sign-in, whatever the cause: unknown
 * address, wrong password, or a locked account (User F2.3).
 */
const GENERIC_ERROR = 'Wrong password or user not found';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();

  // Where the guard sent them from, so they land back there after signing in.
  const from = (location.state as { from?: string } | null)?.from ?? '/browse';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [suspensionNotice, setSuspensionNotice] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (failure) {
      // Only sent after a correct password, so it reveals nothing to someone
      // guessing at addresses. The user can appeal from here.
      if (failure instanceof ApiError && failure.code === 'ACCOUNT_SUSPENDED') {
        setSuspensionNotice(failure.message);
        setSuspended(true);
        return;
      }
      // Every other cause looks the same here on purpose: unknown address,
      // wrong password, locked account (User F2.3), or the service being down.
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  function leaveAppeal() {
    // The password was only kept for the appeal; drop it on the way out.
    setPassword('');
    setSuspended(false);
  }

  if (suspended) {
    return (
      <AppealForm
        email={email.trim()}
        password={password}
        notice={suspensionNotice}
        onDone={leaveAppeal}
      />
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.titleMobile}>Welcome back</span>
          <span className={styles.titleDesktop}>Log in to FoC</span>
        </h1>
        <p className={styles.subtitle}>Log in to post errands or run them.</p>
      </header>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <TextField
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@u.nus.edu"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        labelAction={
          <Link to="/forgot-password" className={styles.forgot}>
            <span className={styles.forgotShort}>Forgot?</span>
            <span className={styles.forgotLong}>Forgot password?</span>
          </Link>
        }
      />

      <p className={styles.signupPrompt}>
        Don&apos;t have an account? <Link to="/signup">Sign up</Link>
      </p>

      {/* UI FR3.3.2: pinned to the bottom of the viewport on mobile. */}
      <div className={styles.actions}>
        <Button type="submit" fullWidth disabled={!canSubmit} loading={submitting}>
          Log in
        </Button>
      </div>
    </form>
  );
}

interface AppealFormProps {
  email: string;
  /** Held in memory only, for this one request; the page clears it on onDone. */
  password: string;
  /** The 403 text. Once User Service includes a rejection reason, it appears here. */
  notice: string | null;
  onDone: () => void;
}

/** A suspended user asks an admin to reinstate them. */
function AppealForm({ email, password, notice, onDone }: AppealFormProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const trimmed = message.trim();
  const valid = trimmed.length > 0 && trimmed.length <= SUPPORT_TEXT_MAX_LENGTH;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || sending) return;

    setSending(true);
    setFailure(null);
    try {
      // A repeat while an earlier appeal is still open returns that appeal.
      await submitAppeal({ email, password, message: trimmed });
      setSent(true);
    } catch (error) {
      setFailure(appealFailure(error));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.form}>
        <header className={styles.header}>
          <h1 className={styles.title}>Appeal sent</h1>
        </header>
        <Alert variant="success">
          An admin will review it. If they reinstate your account, you can log in again as usual.
        </Alert>
        <Button variant="secondary" fullWidth onClick={onDone}>
          Back to log in
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <header className={styles.header}>
        <h1 className={styles.title}>Your account is suspended</h1>
      </header>

      {notice ? <Alert variant="warning">{notice}</Alert> : null}

      <p className={styles.note}>
        You cannot log in while this account is suspended. If you think that was a mistake, explain
        why below. One appeal is reviewed at a time.
      </p>

      {failure ? <Alert variant="danger">{failure}</Alert> : null}

      <TextAreaField
        label="Your appeal"
        rows={6}
        maxLength={SUPPORT_TEXT_MAX_LENGTH}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        hint={`${trimmed.length} / ${SUPPORT_TEXT_MAX_LENGTH} characters`}
      />

      <Button
        type="button"
        variant="ghost"
        className={styles.back}
        disabled={sending}
        onClick={onDone}
      >
        Back to log in
      </Button>

      <div className={styles.actions}>
        <Button type="submit" fullWidth disabled={!valid} loading={sending}>
          Send appeal
        </Button>
      </div>
    </form>
  );
}

function appealFailure(error: unknown): string {
  if (error instanceof ApiError) {
    // The password is checked again; it fails if it changed since login.
    if (error.code === 'INVALID_CREDENTIALS') return GENERIC_ERROR;
    if (error.code === 'ACCOUNT_NOT_SUSPENDED') {
      return 'Your account is no longer suspended. Go back and log in.';
    }
    if (error.code === 'TOO_MANY_APPEAL_ATTEMPTS') {
      return 'Too many attempts. Wait a few minutes and try again.';
    }
  }
  return errorMessage(error, 'Could not reach the server, so the appeal was not sent.');
}

import { PasswordRequirements, passwordHintText } from "./password-requirements";
import { FormField } from "./form-field";

type PasswordChangeErrors = Partial<{
  currentPassword: string;
  newPassword: string;
  passwordConfirmation: string;
}>;

type ChangePasswordDialogProps = {
  open: boolean;
  busy: boolean;
  error?: string;
  errors: PasswordChangeErrors;
  currentPassword: string;
  newPassword: string;
  passwordConfirmation: string;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onPasswordConfirmationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ChangePasswordDialog({
  open,
  busy,
  error,
  errors,
  currentPassword,
  newPassword,
  passwordConfirmation,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onPasswordConfirmationChange,
  onCancel,
  onConfirm,
}: ChangePasswordDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-describedby="change-password-description" aria-labelledby="change-password-title" aria-modal="true" className="dialog" role="dialog">
        <div className="dialog-header">
          <p className="section-label">Account security</p>
          <h2 id="change-password-title">Change password</h2>
        </div>
        <p id="change-password-description">You will be signed out on every device after changing your password.</p>
        <form onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
          <FormField
            autoComplete="current-password"
            autoFocus
            error={errors.currentPassword}
            label="Current password"
            onChange={(event) => onCurrentPasswordChange(event.target.value)}
            required
            type="password"
            value={currentPassword}
          />
          <FormField
            autoComplete="new-password"
            error={errors.newPassword}
            hint={<PasswordRequirements>{passwordHintText}</PasswordRequirements>}
            label="New password"
            onChange={(event) => onNewPasswordChange(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
          <FormField
            autoComplete="new-password"
            error={errors.passwordConfirmation}
            label="Confirm new password"
            onChange={(event) => onPasswordConfirmationChange(event.target.value)}
            required
            type="password"
            value={passwordConfirmation}
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button className="button button-secondary" disabled={busy} onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? "Changing password…" : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

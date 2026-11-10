import { FormField } from "./form-field";

type DeleteAccountDialogProps = {
  open: boolean;
  busy: boolean;
  error?: string;
  password: string;
  acknowledged: boolean;
  onPasswordChange: (value: string) => void;
  onAcknowledgedChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountDialog({
  open,
  busy,
  error,
  password,
  acknowledged,
  onPasswordChange,
  onAcknowledgedChange,
  onCancel,
  onConfirm,
}: DeleteAccountDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-describedby="delete-account-description" aria-labelledby="delete-account-title" aria-modal="true" className="dialog" role="dialog">
        <div className="dialog-header">
          <p className="section-label">Account deletion</p>
          <h2 id="delete-account-title">Delete your account?</h2>
        </div>
        <p id="delete-account-description">
          This removes your sign-in access and anonymises your User Service profile. This cannot be undone.
        </p>
        <FormField
          autoComplete="current-password"
          autoFocus
          label="Current password"
          onChange={(event) => onPasswordChange(event.target.value)}
          type="password"
          value={password}
        />
        <label className="acknowledgement">
          <input
            checked={acknowledged}
            onChange={(event) => onAcknowledgedChange(event.target.checked)}
            type="checkbox"
          />
          <span>I understand that this permanently deletes my account access.</span>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <button className="button button-secondary" disabled={busy} onClick={onCancel} type="button">
            Keep account
          </button>
          <button
            className="button button-danger"
            disabled={busy || !password || !acknowledged}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Deleting account…" : "Delete account"}
          </button>
        </div>
      </section>
    </div>
  );
}

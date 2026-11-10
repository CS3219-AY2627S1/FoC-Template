import { useEffect, useId, useState } from "react";
import { isApiRequestError } from "../api/client";
import type { SystemRole } from "../api/user-service";

const roleOptions: SystemRole[] = ["USER", "ADMIN", "SUPER_ADMIN"];

function humanizeRole(role: SystemRole): string {
  return role.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}

type RoleManagementControlsProps = {
  accountName: string;
  canManage: boolean;
  currentRole: SystemRole;
  onChangeRole: (requestedRole: SystemRole) => Promise<void>;
};

export function RoleManagementControls({
  accountName,
  canManage,
  currentRole,
  onChangeRole,
}: RoleManagementControlsProps) {
  const selectId = useId();
  const [requestedRole, setRequestedRole] = useState<SystemRole>(currentRole);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  useEffect(() => {
    setRequestedRole(currentRole);
    setConfirmationOpen(false);
  }, [currentRole]);

  if (!canManage) return null;

  async function confirmRoleChange() {
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await onChangeRole(requestedRole);
      setSuccess(`${accountName}'s access level is now ${humanizeRole(requestedRole)}.`);
      setConfirmationOpen(false);
    } catch (requestError) {
      setError(
        isApiRequestError(requestError)
          ? requestError.message
          : "We could not change this account's access level. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="role-management-zone">
      <form
        className="role-management-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(undefined);
          setSuccess(undefined);
          setConfirmationOpen(true);
        }}
      >
        <label htmlFor={selectId}>Change access level</label>
        <select
          id={selectId}
          onChange={(event) => setRequestedRole(event.target.value as SystemRole)}
          value={requestedRole}
        >
          {roleOptions.map((role) => <option key={role} value={role}>{humanizeRole(role)}</option>)}
        </select>
        <button className="button button-primary" disabled={requestedRole === currentRole} type="submit">
          Review role change
        </button>
      </form>
      {success ? <p className="form-success role-management-feedback" role="status">{success}</p> : null}
      {error && !confirmationOpen ? <p className="form-error role-management-feedback" role="alert">{error}</p> : null}
      {confirmationOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-describedby={`${selectId}-confirmation-description`} aria-labelledby={`${selectId}-confirmation-title`} aria-modal="true" className="dialog role-change-dialog" role="dialog">
            <div className="dialog-header">
              <p className="section-label">Confirm access change</p>
              <h2 id={`${selectId}-confirmation-title`}>Change {accountName}&rsquo;s role?</h2>
            </div>
            <p id={`${selectId}-confirmation-description`}>
              Change this account from <strong>{humanizeRole(currentRole)}</strong> to <strong>{humanizeRole(requestedRole)}</strong>.
            </p>
            <p className="role-change-session-note">Their active sessions will be revoked, and the change is recorded in the administration audit history.</p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="dialog-actions">
              <button className="button button-secondary" disabled={busy} onClick={() => { setConfirmationOpen(false); setError(undefined); }} type="button">
                Cancel
              </button>
              <button className="button button-primary" disabled={busy} onClick={() => void confirmRoleChange()} type="button">
                {busy ? "Changing access…" : "Change access level"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

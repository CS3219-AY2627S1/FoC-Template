import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { validateDisplayName, validatePasswordChange } from "../api/validation";
import { useAuth } from "../app/use-auth";
import { ChangePasswordDialog } from "../components/change-password-dialog";
import { DeleteAccountDialog } from "../components/delete-account-dialog";
import { DesktopAppShell } from "../components/desktop-app-shell";
import { FormField } from "../components/form-field";
import { MobileAppShell } from "../components/mobile-app-shell";

function ProfileContent() {
  const { user, updateProfile, changePassword, signOut, deleteAccount } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({});
  const [passwordChangeError, setPasswordChangeError] = useState<string>();
  const [changingPassword, setChangingPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
  }, [user]);

  if (!user) return null;

  function setProfileEditing(nextEditing: boolean) {
    setDisplayName(user?.displayName ?? "");
    setFieldError(undefined);
    setFormError(undefined);
    setSuccess(undefined);
    setEditing(nextEditing);
  }

  async function saveProfile() {
    const nameError = validateDisplayName(displayName);
    setFieldError(nameError);
    setFormError(undefined);
    setSuccess(undefined);
    if (nameError) return;
    setBusy(true);
    try {
      await updateProfile({ displayName });
      setEditing(false);
      setSuccess("Profile updated.");
    } catch (requestError) {
      if (isApiRequestError(requestError)) {
        const displayNameError = requestError.fieldErrors.find((item) => item.field === "displayName");
        setFieldError(displayNameError?.message);
        setFormError(displayNameError ? undefined : requestError.message);
      } else {
        setFormError("We could not save your changes. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setFormError(undefined);
    try {
      await signOut();
    } catch (requestError) {
      setFormError(isApiRequestError(requestError) ? requestError.message : "You have been signed out on this device.");
    } finally {
      navigate("/sign-in", { replace: true, state: { message: "You have signed out." } });
    }
  }

  async function confirmDelete() {
    setDeleteError(undefined);
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      navigate("/sign-in", { replace: true, state: { message: "Your account has been deleted." } });
    } catch (requestError) {
      setDeleteError(isApiRequestError(requestError) ? requestError.message : "We could not delete your account. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  function closePasswordChange() {
    setPasswordChangeOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
    setPasswordFieldErrors({});
    setPasswordChangeError(undefined);
  }

  async function confirmPasswordChange() {
    const errors = validatePasswordChange({ currentPassword, newPassword, passwordConfirmation });
    setPasswordFieldErrors(errors);
    setPasswordChangeError(undefined);
    if (Object.keys(errors).length > 0) return;

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      closePasswordChange();
      navigate("/sign-in", { replace: true, state: { message: "Password changed. Sign in with your new password." } });
    } catch (requestError) {
      if (isApiRequestError(requestError)) {
        const errorsByField = Object.fromEntries(
          requestError.fieldErrors.map((item) => [item.field, item.message]),
        );
        setPasswordFieldErrors(errorsByField);
        setPasswordChangeError(requestError.fieldErrors.length > 0 ? undefined : requestError.message);
      } else {
        setPasswordChangeError("We could not change your password. Try again.");
      }
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <>
      <header className="profile-heading">
        <p className="section-label">Account</p>
        <h1>Profile and security</h1>
        <p>Your username and NUS email are fixed. Update your display name here.</p>
      </header>
      {success ? <p className="form-success" role="status">{success}</p> : null}
      <div className="profile-workspace">
        <div className="profile-primary-column">
          <section className="profile-card">
            <div className="profile-identity">
              <span className="avatar avatar-large">{user.displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2>{user.displayName}</h2>
              </div>
            </div>
            <dl className="identity-list">
              <div><dt>NUS email</dt><dd>{user.email}</dd></div>
              <div><dt>Username</dt><dd>{user.username}</dd></div>
              <div><dt>Display name</dt><dd>{user.displayName}</dd></div>
              <div><dt>Account status</dt><dd>{user.accountStatus === "ACTIVE" ? "Active" : user.accountStatus}</dd></div>
            </dl>
            {editing ? (
              <div className="profile-edit-form">
                <FormField error={fieldError} label="Display name" onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
                {formError ? <p className="form-error" role="alert">{formError}</p> : null}
                <div className="inline-actions">
                  <button className="button button-primary" disabled={busy} onClick={saveProfile} type="button">
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                  <button className="button button-secondary" disabled={busy} onClick={() => setProfileEditing(false)} type="button">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="profile-actions">
                <button className="button button-primary" onClick={() => setProfileEditing(true)} type="button">Edit profile</button>
                <button className="text-button" onClick={handleSignOut} type="button">Sign out</button>
              </div>
            )}
          </section>
          <section className="security-zone">
            <div>
              <p className="section-label">Security</p>
              <h2>Keep your account secure</h2>
              <p>Change your password whenever you need to. This signs you out on every device.</p>
            </div>
            <button className="button button-secondary" onClick={() => setPasswordChangeOpen(true)} type="button">
              Change password
            </button>
          </section>
        </div>
        <aside className="danger-zone">
          <p className="section-label">Danger zone</p>
          <h2>Delete your account</h2>
          <p>Remove your sign-in access and anonymise the personal details stored by User Service.</p>
          <button className="button button-danger-outline" onClick={() => setDeleteOpen(true)} type="button">Delete account</button>
        </aside>
      </div>
      <p className="profile-note">Username and NUS email are set at registration and cannot be changed.</p>
      <DeleteAccountDialog
        acknowledged={deleteAcknowledged}
        busy={deleting}
        error={deleteError}
        onAcknowledgedChange={setDeleteAcknowledged}
        onCancel={() => { setDeleteOpen(false); setDeleteError(undefined); setDeletePassword(""); setDeleteAcknowledged(false); }}
        onConfirm={confirmDelete}
        onPasswordChange={setDeletePassword}
        open={deleteOpen}
        password={deletePassword}
      />
      <ChangePasswordDialog
        busy={changingPassword}
        currentPassword={currentPassword}
        error={passwordChangeError}
        errors={passwordFieldErrors}
        newPassword={newPassword}
        onCancel={closePasswordChange}
        onConfirm={confirmPasswordChange}
        onCurrentPasswordChange={setCurrentPassword}
        onNewPasswordChange={setNewPassword}
        onPasswordConfirmationChange={setPasswordConfirmation}
        open={passwordChangeOpen}
        passwordConfirmation={passwordConfirmation}
      />
    </>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const isDesktop = useDesktopLayout();
  if (!user) return null;

  return isDesktop ? (
    <DesktopAppShell user={user}><ProfileContent /></DesktopAppShell>
  ) : (
    <MobileAppShell user={user}><ProfileContent /></MobileAppShell>
  );
}

function useDesktopLayout() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { isApiRequestError } from "../api/client";
import type { AdminAccountSummary, AdminLookupField, AdminUserAccount, SystemRole } from "../api/user-service";
import { useAuth } from "../app/use-auth";
import { canManageSystemRole } from "../app/role-access";
import { DesktopAppShell } from "../components/desktop-app-shell";
import { FormField } from "../components/form-field";
import { MobileAppShell } from "../components/mobile-app-shell";
import { RoleManagementControls } from "../components/role-management-controls";

const fieldLabels: Record<AdminLookupField, string> = {
  username: "Username",
  email: "NUS email",
};

function humanize(value: string): string {
  return value.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}

function formattedTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function compareAdmins(left: AdminAccountSummary, right: AdminAccountSummary): number {
  if (left.systemRole !== right.systemRole) return left.systemRole === "SUPER_ADMIN" ? -1 : 1;
  const leftUsername = left.username.toLowerCase();
  const rightUsername = right.username.toLowerCase();
  return leftUsername < rightUsername ? -1 : leftUsername > rightUsername ? 1 : 0;
}

function UserManagementContent() {
  const { user, findUserAccount, listAdmins, updateUserSystemRole } = useAuth();
  const [field, setField] = useState<AdminLookupField>("username");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<AdminUserAccount>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState<AdminAccountSummary[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminListError, setAdminListError] = useState<string>();
  const adminListRequest = useRef(0);

  const loadAdmins = useCallback(async () => {
    const request = ++adminListRequest.current;
    setAdminsLoading(true);
    setAdminListError(undefined);
    try {
      const currentAdmins = await listAdmins();
      if (request === adminListRequest.current) setAdmins(currentAdmins);
    } catch (requestError) {
      if (request === adminListRequest.current) {
        setAdminListError(isApiRequestError(requestError)
          ? requestError.message
          : "We could not load the current admins. Try again.");
      }
    } finally {
      if (request === adminListRequest.current) setAdminsLoading(false);
    }
  }, [listAdmins]);

  useEffect(() => {
    void loadAdmins();
    return () => { adminListRequest.current += 1; };
  }, [loadAdmins]);

  useEffect(() => {
    setValue("");
    setResult(undefined);
    setError(undefined);
  }, [field]);

  if (!user) return null;

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = value.trim();
    setError(undefined);
    setResult(undefined);
    if (!query) {
      setError(`Enter the ${fieldLabels[field].toLowerCase()} to search.`);
      return;
    }

    setBusy(true);
    try {
      setResult(await findUserAccount(field, query));
    } catch (requestError) {
      setError(isApiRequestError(requestError) ? requestError.message : "We could not load that account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(targetUserId: string, requestedRole: SystemRole) {
    const updated = await updateUserSystemRole(targetUserId, requestedRole);
    setResult((currentResult) => (
      currentResult?.userId === targetUserId
        ? { ...currentResult, systemRole: updated.systemRole }
        : currentResult
    ));
    setAdmins((currentAdmins) => {
      const remaining = currentAdmins.filter((admin) => admin.userId !== targetUserId);
      const systemRole = updated.systemRole;
      if (systemRole === "USER") return remaining;
      const account = currentAdmins.find((admin) => admin.userId === targetUserId)
        ?? (result?.userId === targetUserId ? result : undefined);
      if (!account) return remaining;
      return [...remaining, {
        userId: targetUserId,
        username: account.username,
        email: account.email,
        systemRole,
      }].sort(compareAdmins);
    });
    // A refresh failure must not turn an already committed role change into a save error.
    await loadAdmins();
  }

  return (
    <>
      <header className="profile-heading management-heading">
        <p className="section-label">Administration</p>
        <h1>Manage admins</h1>
        <p>Find any FoC account by its unique username or NUS email address and change their role in FoC</p>
      </header>
      <section className="management-search-card">
        <form className="management-search-form" onSubmit={search}>
          <div className="search-field-select">
            <label htmlFor="lookup-field">Search by</label>
            <select id="lookup-field" onChange={(event) => setField(event.target.value as AdminLookupField)} value={field}>
              <option value="username">Username</option>
              <option value="email">NUS email</option>
            </select>
          </div>
          <FormField
            autoComplete="off"
            label={fieldLabels[field]}
            onChange={(event) => setValue(event.target.value)}
            placeholder={field === "username" ? "e.g. CampusHelper" : "e.g. student@u.nus.edu"}
            required
            type={field === "email" ? "email" : "text"}
            value={value}
          />
          <button className="button button-primary management-search-button" disabled={busy} type="submit">
            {busy ? "Searching…" : "Search account"}
          </button>
        </form>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </section>
      {result ? (
        <section aria-live="polite" className="admin-account-result">
          <div className="admin-account-result-heading">
            <div>
              <p className="section-label">Account found</p>
              <h2>{result.displayName}</h2>
              <p>{result.username}</p>
            </div>
            <span className={`account-status account-status-${result.accountStatus.toLowerCase()}`}>
              {result.accountStatus === "ACTIVE" ? "Active" : humanize(result.accountStatus)}
            </span>
          </div>
          <dl className="admin-identity-list">
            <div><dt>User ID</dt><dd>{result.userId}</dd></div>
            <div><dt>NUS email</dt><dd>{result.email}</dd></div>
            <div><dt>Email verification</dt><dd>{result.emailVerified ? "Verified" : "Not verified"}</dd></div>
            <div><dt>System role</dt><dd>{humanize(result.systemRole)}</dd></div>
            <div><dt>Registered</dt><dd>{formattedTimestamp(result.createdAt)}</dd></div>
          </dl>
          <RoleManagementControls
            accountName={result.displayName}
            canManage={canManageSystemRole(user.systemRole, user.userId, result.userId)}
            currentRole={result.systemRole}
            onChangeRole={(requestedRole) => changeRole(result.userId, requestedRole)}
          />
        </section>
      ) : null}
      <section aria-busy={adminsLoading} aria-labelledby="current-admins-heading" className="current-admins-section">
        <h2 id="current-admins-heading">Current super admins / admins</h2>
        {adminsLoading ? <p className="current-admins-feedback" role="status">Loading current admins…</p> : null}
        {adminListError ? (
          <div className="current-admins-feedback">
            <p className="form-error" role="alert">{adminListError}</p>
            <button className="button button-secondary" onClick={() => void loadAdmins()} type="button">Retry loading admins</button>
          </div>
        ) : null}
        {!adminsLoading && !adminListError && admins.length === 0 ? (
          <p className="current-admins-feedback">No current super admins or admins found.</p>
        ) : null}
        <ul className="current-admin-list">
          {admins.map((admin) => (
            <li aria-label={admin.username} className="current-admin-card" key={admin.userId}>
              <h3>{admin.username}</h3>
              <dl className="admin-identity-list">
                <div><dt>NUS email</dt><dd>{admin.email}</dd></div>
                <div><dt>System role</dt><dd>{humanize(admin.systemRole)}</dd></div>
              </dl>
              <RoleManagementControls
                accountName={admin.username}
                canManage={canManageSystemRole(user.systemRole, user.userId, admin.userId)}
                currentRole={admin.systemRole}
                onChangeRole={(requestedRole) => changeRole(admin.userId, requestedRole)}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function AdminUserManagementPage() {
  const { user } = useAuth();
  const isDesktop = useDesktopLayout();
  if (!user) return null;

  return isDesktop ? (
    <DesktopAppShell user={user}><UserManagementContent /></DesktopAppShell>
  ) : (
    <MobileAppShell user={user}><UserManagementContent /></MobileAppShell>
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

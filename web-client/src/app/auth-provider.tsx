/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiRequestError, isApiRequestError } from "../api/client";
import {
  type AccessSession,
  type AdminLookupField,
  type CurrentUser,
  type ProfileChanges,
  type SystemRole,
  userService,
} from "../api/user-service";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./auth-context";

function isUnauthorized(error: unknown): boolean {
  return isApiRequestError(error) && error.status === 401;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const accessToken = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string> | null>(null);
  const restoration = useRef<Promise<{ session: AccessSession; currentUser: CurrentUser }> | null>(null);
  const sessionGeneration = useRef(0);

  const clearSession = useCallback(() => {
    accessToken.current = null;
    refreshInFlight.current = null;
    ++sessionGeneration.current;
    setUser(null);
    setStatus("anonymous");
  }, []);

  const acceptSession = useCallback(async (session: AccessSession): Promise<CurrentUser> => {
    ++sessionGeneration.current;
    refreshInFlight.current = null;
    const currentUser = await userService.getCurrentUser(session.accessToken);
    accessToken.current = session.accessToken;
    setUser(currentUser);
    setStatus("authenticated");
    return currentUser;
  }, []);

  useEffect(() => {
    let active = true;
    const generation = sessionGeneration.current;
    // React StrictMode remounts effects in development; a refresh cookie may only rotate once.
    restoration.current ??= userService.refreshSession().then(async (session) => ({ session, currentUser: await userService.getCurrentUser(session.accessToken) }));
    void restoration.current
      .then(({ session, currentUser }) => {
        if (!active || generation !== sessionGeneration.current) return;
        accessToken.current = session.accessToken;
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch(() => {
        if (active && generation === sessionGeneration.current) clearSession();
      });
    return () => {
      active = false;
    };
  }, [clearSession]);

  const withCurrentAccess = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
      const originalToken = accessToken.current;
      const generation = sessionGeneration.current;
      if (!originalToken) throw new ApiRequestError(401, "Sign in to continue.", { code: "AUTH_REQUIRED" });
      try {
        return await operation(originalToken);
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
      }

      let token = accessToken.current;
      if (!token || generation !== sessionGeneration.current) throw new ApiRequestError(401, "Sign in to continue.", { code: "AUTH_REQUIRED" });
      if (token === originalToken) {
        if (!refreshInFlight.current) {
          // Chat HTTP recovery and socket reconnect may detect expiry together.
          // Rotate the cookie once and share that refresh across concurrent callers.
          const pending = userService.refreshSession().then(async (refreshed) => {
            const refreshedUser = await userService.getCurrentUser(refreshed.accessToken);
            if (generation !== sessionGeneration.current) throw new ApiRequestError(401, "Sign in to continue.", { code: "AUTH_REQUIRED" });
            accessToken.current = refreshed.accessToken;
            setUser(refreshedUser);
            return refreshed.accessToken;
          }).catch((error) => {
            if (generation === sessionGeneration.current) clearSession();
            throw error;
          }).finally(() => { if (refreshInFlight.current === pending) refreshInFlight.current = null; });
          refreshInFlight.current = pending;
        }
        token = await refreshInFlight.current;
      }
      try { return await operation(token); }
      catch (error) { if (isUnauthorized(error) && generation === sessionGeneration.current) clearSession(); throw error; }
    },
    [clearSession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await userService.createSession(email, password);
      await acceptSession(session);
    },
    [acceptSession],
  );

  const updateProfile = useCallback(
    async (changes: ProfileChanges) => {
      const updated = await withCurrentAccess((token) => userService.updateCurrentUser(changes, token));
      setUser(updated);
      return updated;
    },
    [withCurrentAccess],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await withCurrentAccess((token) => userService.changeCurrentPassword(currentPassword, newPassword, token));
      clearSession();
    },
    [clearSession, withCurrentAccess],
  );

  const listAdmins = useCallback(
    () => withCurrentAccess((token) => userService.listAdmins(token)),
    [withCurrentAccess],
  );

  const findUserAccount = useCallback(
    (field: AdminLookupField, value: string) =>
      withCurrentAccess((token) => userService.findUserAccount(field, value, token)),
    [withCurrentAccess],
  );

  const updateUserSystemRole = useCallback(
    (userId: string, systemRole: SystemRole) =>
      withCurrentAccess((token) => userService.updateUserSystemRole(userId, systemRole, token)),
    [withCurrentAccess],
  );

  const signOut = useCallback(async () => {
    try {
      await withCurrentAccess((token) => userService.revokeCurrentSession(token));
    } finally {
      clearSession();
    }
  }, [clearSession, withCurrentAccess]);

  const deleteAccount = useCallback(
    async (currentPassword: string) => {
      await withCurrentAccess((token) => userService.deleteCurrentUser(currentPassword, token));
      clearSession();
    },
    [clearSession, withCurrentAccess],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      withCurrentAccess,
      signIn,
      updateProfile,
      changePassword,
      listAdmins,
      findUserAccount,
      updateUserSystemRole,
      signOut,
      deleteAccount,
    }),
    [
      changePassword,
      deleteAccount,
      findUserAccount,
      listAdmins,
      signIn,
      signOut,
      status,
      updateProfile,
      updateUserSystemRole,
      user,
      withCurrentAccess,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

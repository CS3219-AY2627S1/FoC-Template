/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Created AuthContext, per instructions.md Stage 16b. Holds the real session (user,
 *        status, login, logout, setActiveView, updateUser) that used to live in DemoContext,
 *        plus the credit balance and the order-socket connection that depend on being logged
 *        in. requireAuth replaces the deleted LoginModal's gating: already logged in runs the
 *        callback immediately, otherwise it sends the visitor to /login, remembering where
 *        they were.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Added forceReauth, per instructions.md Stage 16e's decision for a successful
 *        password change: the backend has already revoked every refresh token for this user
 *        (including this browser's), so there is nothing to call POST /auth/logout against —
 *        this clears client state the same way logout() does, minus that network call, and
 *        redirects to /login with a message immediately rather than waiting for the next
 *        proactive refresh to discover the session is dead.
 *
 *        forceReauth is normally called from a RequireAuth-protected page (/account). Carrying
 *        its message through react-router's navigate(..., { state }) turned out to race
 *        RequireAuth's own redirect: flipping auth state to anonymous makes RequireAuth
 *        re-render before this navigate's location update has landed (confirmed with an actual
 *        Playwright run plus console tracing, not just reasoning about it — neither reordering
 *        the calls nor wrapping the call in flushSync, React's or react-router v7's own
 *        navigate(..., { flushSync: true }) option, changed the outcome), so RequireAuth's own
 *        `{ from: location }` wins and the banner silently never renders. Routed the message
 *        through pendingAuthMessage/consumePendingAuthMessage below instead — a plain
 *        module-level variable outside React state entirely sidesteps the race, since it
 *        doesn't matter any more which navigate call's router state wins.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Stage 23c of instructions.md - tracks the 30-day session deadline for the expiry
 *        warning banner. Subscribes to http.js's onSessionTimeLeft (fed by every login and
 *        refresh) and stores the deadline as a performance.now()-based monotonic timestamp, so
 *        a changed device clock has no effect. sessionExpiringSoon flips true once the deadline
 *        is LEAD_TIME_MS or less away, via a scheduled timer chain recomputed whenever the
 *        deadline or login status changes, not by polling. Chained rather than one setTimeout
 *        because a fresh 30-day deadline's delay (~2.59e9 ms) overflows setTimeout's 32-bit
 *        signed delay ceiling (~2.147e9 ms, MAX_TIMEOUT_MS below) and would otherwise fire
 *        almost immediately instead of ~30 days later, showing the banner right after login;
 *        caught by the "no carryover" test in tests/context/AuthContext.test.jsx, not by
 *        inspection. The deadline is cleared on logout, forceReauth and session-expiry, so the
 *        banner never carries over to the next login.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified chat room subscriptions and realtime frontend updates.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 27c of instructions.md - logout() and forceReauth() now also clear the stored
 *        elevation token (utils/elevation.js), per the stage's "logout and forced logout
 *        remove the stored token" rule.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as authApi from "../api/auth";
import * as profileApi from "../api/profile";
import { getBalance } from "../api/credits";
import {
  setAccessToken,
  setOnSessionExpired,
  setOnSessionTimeLeft,
} from "../api/http";
import { clearElevationToken } from "../utils/elevation";
import {
  connectChatSocket,
  disconnectChatSocket,
} from "../realtime/chatSocket";
import {
  connectOrderSocket,
  disconnectOrderSocket,
} from "../realtime/orderSocket";

const AuthContext = createContext(null);

// NFR4.2.1: warn 10 minutes before the 30-day session expires.
const LEAD_TIME_MS = 10 * 60 * 1000;
// setTimeout's delay is a 32-bit signed int (~24.8 days); a fresh 30-day deadline overflows
// that in one call, firing almost immediately instead of ~30 days later. Chunk any longer wait
// into steps of at most this size and reschedule.
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Logged out, or the balance could not be read. Module-scoped so its identity is stable. */
const NO_CREDITS = { available: 0, reserved: 0, total: 0 };

// See forceReauth below for why this lives outside React state. Read with a pure lazy useState
// initializer (safe under StrictMode's double-invoked renders, since reading doesn't mutate)
// and cleared separately by the reader's own effect (idempotent, so a StrictMode double-invoked
// effect is also safe).
let pendingAuthMessage = null;
export function consumePendingAuthMessage() {
  return pendingAuthMessage;
}
export function clearPendingAuthMessage() {
  pendingAuthMessage = null;
}

export function AuthProvider({ children }) {
  // null while logged out or still restoring; { id, role, username, email, activeView } once known.
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // 'loading' | 'authenticated' | 'anonymous'
  const isLoggedIn = status === "authenticated";
  // Alias kept for the pre-split naming (`sessionReady`): true once restore has resolved either way.
  const sessionReady = status !== "loading";
  const isAdmin = user?.role === "admin" || user?.role === "super admin";

  // See LEAD_TIME_MS above. Set from every login and refresh (setOnSessionTimeLeft, fed by
  // http.js); null while logged out.
  const [sessionDeadline, setSessionDeadline] = useState(null);
  const [sessionExpiringSoon, setSessionExpiringSoon] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    authApi.restoreSession().then(
      (restored) => {
        if (restored) {
          setUser(restored);
          setStatus("authenticated");
        } else {
          setStatus("anonymous");
        }
      },
      () => setStatus("anonymous"),
    );
  }, []);

  // Sends an anonymous visitor to /login, remembering the page they were on. `reason` travels
  // in router state; Login.jsx may show it, but nothing requires it to.
  const goToLogin = useCallback(
    (reason) => {
      navigate("/login", { state: { from: location, reason } });
    },
    [navigate, location],
  );

  useEffect(() => {
    setOnSessionExpired(() => {
      setUser(null);
      setStatus("anonymous");
      setSessionDeadline(null);
      goToLogin("Your session has expired. Please log in again.");
    });
  }, [goToLogin]);

  useEffect(() => {
    setOnSessionTimeLeft((secondsLeft) => {
      setSessionDeadline(performance.now() + secondsLeft * 1000);
    });
  }, []);

  // Recomputed (not polled) whenever the deadline or login status changes: a timer chain
  // scheduled for the moment the lead time is crossed, cleared on the next change.
  useEffect(() => {
    if (!isLoggedIn || sessionDeadline == null) {
      setSessionExpiringSoon(false);
      return undefined;
    }
    let timer;
    const tick = () => {
      const msUntilWarning = sessionDeadline - LEAD_TIME_MS - performance.now();
      if (msUntilWarning <= 0) {
        setSessionExpiringSoon(true);
        return;
      }
      setSessionExpiringSoon(false);
      timer = setTimeout(tick, Math.min(msUntilWarning, MAX_TIMEOUT_MS));
    };
    tick();
    return () => clearTimeout(timer);
  }, [isLoggedIn, sessionDeadline]);

  // Order events need a signed-in user: one connection for the whole app.
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    connectOrderSocket();
    connectChatSocket();
    return () => {
      disconnectOrderSocket();
      disconnectChatSocket();
    };
  }, [isLoggedIn]);

  const login = useCallback(async (identifier, password) => {
    const loggedInUser = await authApi.login(identifier, password);
    setUser(loggedInUser);
    setStatus("authenticated");
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus("anonymous");
      setSessionDeadline(null);
      clearElevationToken();
      // Explicit logout never remembers a "from" page.
      navigate("/login");
    }
  }, [navigate]);

  // Same client-state clearing as logout(), without the POST /auth/logout call: for a
  // successful password change, the backend has already revoked every refresh token for this
  // user, this browser's included, so there is no session left to log out of. The message
  // travels via pendingAuthMessage (see above), not router state, so it doesn't matter whether
  // this navigate or RequireAuth's own competing redirect (also firing once isLoggedIn flips)
  // is the one that actually lands.
  const forceReauth = useCallback(
    (message) => {
      pendingAuthMessage = message;
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
      setSessionDeadline(null);
      clearElevationToken();
      navigate("/login");
    },
    [navigate],
  );

  // For later sub-stages: merge fields into `user` after a profile change (e.g. a new
  // username/email once the change is confirmed).
  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // Optimistic: flips immediately, calls the endpoint, reverts and rethrows on failure so the
  // caller (the requester/courier toggle, stage 16f) can show a toast.
  const setActiveView = useCallback(
    async (activeView) => {
      const previous = user?.activeView;
      updateUser({ activeView });
      try {
        await profileApi.setActiveView(activeView);
      } catch (err) {
        updateUser({ activeView: previous });
        throw err;
      }
    },
    [user, updateUser],
  );

  // Replaces the deleted LoginModal's gating at every call site that used to open it.
  const requireAuth = useCallback(
    (reason, onAllowed) => {
      if (isLoggedIn) {
        onAllowed?.();
        return true;
      }
      goToLogin(reason);
      return false;
    },
    [isLoggedIn, goToLogin],
  );

  // --- credit balance (F19.5.1) -----------------------------------------------------------
  const [credits, setCredits] = useState(NO_CREDITS);
  const userId = user?.id ?? null;

  const refreshCredits = useCallback(async () => {
    if (!userId) {
      setCredits(NO_CREDITS);
      return;
    }
    try {
      const b = await getBalance(userId);
      setCredits({
        available: b.unreservedBalance,
        reserved: b.reservedBalance,
        total: b.totalBalance,
      });
    } catch {
      // 404 BALANCE_NOT_FOUND (no allocation yet), 503 (identity provider), or a network
      // failure. The nav bar must never take the page down over a balance, so show zero and
      // let the Wallet page, which has proper loading and error states, explain it.
      setCredits(NO_CREDITS);
    }
  }, [userId]);

  // Refetch whenever the signed-in user changes, and clear on logout so one user's balance is
  // never briefly visible to the next.
  useEffect(() => {
    if (!sessionReady) return;
    void refreshCredits();
  }, [sessionReady, refreshCredits]);

  const value = useMemo(
    () => ({
      user,
      status,
      isLoggedIn,
      sessionReady,
      isAdmin,
      sessionExpiringSoon,
      login,
      logout,
      forceReauth,
      updateUser,
      setActiveView,
      requireAuth,
      credits,
      refreshCredits,
    }),
    [
      user,
      status,
      isLoggedIn,
      sessionReady,
      isAdmin,
      sessionExpiringSoon,
      login,
      logout,
      forceReauth,
      updateUser,
      setActiveView,
      requireAuth,
      credits,
      refreshCredits,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28
// Scope: Implemented independent loading, error, retry and refresh state for dashboard panels.
// Author review: I validated correctness and supplied additional boundary checks.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./use-auth";

export type AdminResource<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  retrievedAt: Date | null;
  reload: () => void;
};

/**
 * Loads one dashboard panel independently (N2NFR4.4). A failure keeps earlier data so the panel
 * can show it as stale instead of replacing it with zeros. `key` names the inputs `load` uses.
 */
export function useAdminResource<T>(load: ((token: string) => Promise<T>) | null, key: string): AdminResource<T> {
  const { withCurrentAccess } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<AdminResource<T>, "reload">>({
    data: null, error: null, loading: load !== null, retrievedAt: null,
  });

  useEffect(() => {
    if (!load) return;
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    withCurrentAccess(load).then(
      (data) => { if (active) setState({ data, error: null, loading: false, retrievedAt: new Date() }); },
      (error: unknown) => { if (active) setState((current) => ({ ...current, error, loading: false })); },
    );
    return () => { active = false; };
    // `load` is recreated every render; `key` changes exactly when its inputs do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, withCurrentAccess]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload };
}

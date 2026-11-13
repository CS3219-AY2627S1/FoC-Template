/**
 * What Server Actions return to the browser. Service failures become values
 * the UI can show; anything else is a bug and is rethrown. Client components
 * only import the types, so `server-only` code never reaches the browser.
 */

import { ServiceError } from '@/lib/service-request';
import { UserServiceError } from '@/lib/user-service';

export type ActionFailure = {
  ok: false;
  status: number;
  message: string;
  /** Machine-readable reason, from the service or set by the action. */
  code?: string;
};

export type ActionResult<T extends object> = ({ ok: true } & T) | ActionFailure;

export type PageResult<T> = ActionResult<{
  items: T[];
  total: number;
  /**
   * Server time the page was read, in ms. Relative times are computed from
   * it so the server render and hydration produce the same text.
   */
  loadedAt: number;
}>;

/** Replaces the service's message, and optionally its code, for a status. */
export type FailureOverrides = Partial<
  Record<number, { message: string; code?: string }>
>;

export async function toResult<T extends object>(
  run: () => Promise<T>,
  overrides: FailureOverrides = {},
): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await run()) };
  } catch (error) {
    if (!(error instanceof ServiceError || error instanceof UserServiceError)) {
      throw error;
    }
    const override = overrides[error.status];
    return {
      ok: false,
      status: error.status,
      message: override?.message ?? error.message,
      code: override?.code ?? ('code' in error ? error.code : undefined),
    };
  }
}

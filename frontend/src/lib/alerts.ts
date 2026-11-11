/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-03
 * Scope: Generated the Order Service alerts call and the shared list the nav
 *        bar's bell reads.
 * Reviewed by Ngooi Jun Sen.
 *
 * GET /api/v1/orders/alerts (order-service AlertController): status changes
 * on the signed-in user's own requests, newest first, that Order chose to
 * tell the requester about. Couriers get none, and Order keeps no read state,
 * so "seen" is remembered in this browser (as skipped ratings are, in
 * src/lib/rating.ts).
 */

import { useSyncExternalStore } from 'react';
import type { OrderStatus } from '../components/ui/StatusBadge';
import { api } from './api';
import { statusLabel } from './orders';

export interface OrderAlert {
  id: string;
  orderId: string;
  /** Null when the change is to a status this frontend does not know. */
  status: OrderStatus | null;
  createdAt: Date;
}

interface AlertResponse {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: string;
}

interface AlertPage {
  content: AlertResponse[];
  totalElements: number;
}

/** The latest few are enough for a menu; older changes are on the order pages. */
const LIMIT = 20;

async function fetchAlerts(): Promise<OrderAlert[]> {
  const result = await api.get<AlertPage>(`/orders/alerts?page=0&size=${LIMIT}`);
  return result.content.map((alert) => ({
    id: alert.id,
    orderId: alert.orderId,
    status: statusLabel(alert.toStatus),
    createdAt: new Date(alert.createdAt),
  }));
}

/*
 * One list for the whole app, kept the same way as the credit balance
 * (src/lib/credit.ts). Order F2.13 promises status alerts within a minute,
 * so it polls every 30 seconds while the nav bar is up, and refreshes when
 * the tab regains focus.
 */
const POLL_MS = 30_000;

let alerts: OrderAlert[] = [];
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | undefined;
let latestRequest = 0;

function emit() {
  for (const listener of listeners) listener();
}

/** Re-read the alerts. A failure keeps the last list: the bell is a hint. */
export async function refreshAlerts(): Promise<void> {
  const request = ++latestRequest;
  try {
    const next = await fetchAlerts();
    if (request !== latestRequest) return;
    alerts = next;
    emit();
  } catch {
    // Order Service unreachable: try again on the next poll.
  }
}

function onFocus() {
  if (document.visibilityState === 'visible') void refreshAlerts();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshAlerts();
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAlerts();
    }, POLL_MS);
    document.addEventListener('visibilitychange', onFocus);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onFocus);
      // Signed out: forget the list so the next user never sees it.
      latestRequest += 1;
      alerts = [];
    }
  };
}

export function useOrderAlerts(): OrderAlert[] {
  return useSyncExternalStore(subscribe, () => alerts);
}

/*
 * When the user last opened the bell, per user, so the unread dot (UI
 * FR5.1.3) means "changed since you last looked". Kept in this browser only.
 */
const SEEN_KEY = 'foc.alerts.seen';

export function readAlertsSeen(userId: string): number {
  try {
    const all = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>;
    return typeof all[userId] === 'number' ? all[userId] : 0;
  } catch {
    return 0;
  }
}

export function markAlertsSeen(userId: string, at: number): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>;
    all[userId] = at;
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: the dot may come back after a reload, which is harmless.
  }
}

/*
 * What the user has cleared from the menu, per user, in this browser only:
 * Order cannot delete alerts. "Clear all" keeps one time (everything up to it
 * is hidden); clearing one row keeps that alert's id, capped at the latest
 * 200 since the menu only ever shows the latest 20.
 */
const CLEARED_KEY = 'foc.alerts.cleared';
const MAX_CLEARED_IDS = 200;

export interface ClearedAlerts {
  /** Alerts at or before this time (ms) are hidden. */
  before: number;
  ids: string[];
}

function readAllCleared(): Record<string, ClearedAlerts> {
  try {
    return JSON.parse(window.localStorage.getItem(CLEARED_KEY) ?? '{}') as Record<string, ClearedAlerts>;
  } catch {
    return {};
  }
}

function writeCleared(userId: string, cleared: ClearedAlerts): void {
  try {
    const all = readAllCleared();
    all[userId] = cleared;
    window.localStorage.setItem(CLEARED_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: cleared rows come back after a reload, which is harmless.
  }
}

export function readClearedAlerts(userId: string): ClearedAlerts {
  const cleared = readAllCleared()[userId];
  return {
    before: typeof cleared?.before === 'number' ? cleared.before : 0,
    ids: Array.isArray(cleared?.ids) ? cleared.ids : [],
  };
}

/** Hides every alert up to `at`; the per-row list is no longer needed. */
export function clearAllAlerts(userId: string, at: number): ClearedAlerts {
  const cleared = { before: at, ids: [] };
  writeCleared(userId, cleared);
  return cleared;
}

export function clearAlert(userId: string, alertId: string): ClearedAlerts {
  const current = readClearedAlerts(userId);
  const cleared = { before: current.before, ids: [...current.ids, alertId].slice(-MAX_CLEARED_IDS) };
  writeCleared(userId, cleared);
  return cleared;
}

export function isCleared(alert: OrderAlert, cleared: ClearedAlerts): boolean {
  return alert.createdAt.getTime() <= cleared.before || cleared.ids.includes(alert.id);
}

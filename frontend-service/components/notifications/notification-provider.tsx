'use client';

// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — the provider that holds one EventSource for the app, counts unread notifications, re-reads the count on fresh streams and tab visibility, retries refused streams, and publishes live notifications to subscribers (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  type AppNotification,
  NOTIFICATION_STREAM_PATH,
  notificationApi,
} from '@/lib/notifications';

// After the stream fails for good (a 401 or 503 before it starts), try again
// this much later. Ordinary drops reconnect inside `EventSource` itself.
const RECONNECT_MS = 15_000;

type Listener = (notification: AppNotification) => void;

type NotificationContextValue = {
  /** Null until the first count arrives, or while it can't be read. */
  unread: number | null;
  /** Call after marking one notification read that was unread. */
  noteRead: () => void;
  /** Call after "Mark all read". */
  noteAllRead: () => void;
  /** Receives each live notification; returns the unsubscribe function. */
  subscribe: (listener: Listener) => () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

/**
 * Keeps one live stream open for the whole signed-in app and counts unread
 * notifications. Each stream event is a new, unread notification, so it adds
 * one; the count is re-read whenever a fresh stream opens and when the tab
 * becomes visible again, which corrects any drift.
 */
export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unread, setUnread] = useState<number | null>(null);
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const refreshCount = async () => {
      const result = await notificationApi.unreadCount();
      if (!stopped && result.ok) setUnread(result.data.count);
    };

    const connect = () => {
      const current = new EventSource(NOTIFICATION_STREAM_PATH);
      source = current;
      // `open` also fires on EventSource's own reconnects, which resume with
      // `Last-Event-ID` and replay what was missed, so only a fresh stream
      // needs the count re-read.
      let fresh = true;

      current.onopen = () => {
        if (fresh) void refreshCount();
        fresh = false;
      };
      current.onmessage = (event) => {
        let notification: AppNotification;
        try {
          notification = JSON.parse(event.data) as AppNotification;
        } catch {
          return;
        }
        if (notification.read_at === null) {
          setUnread((count) => (count ?? 0) + 1);
        }
        for (const listener of listeners.current) listener(notification);
      };
      current.onerror = () => {
        if (current.readyState !== EventSource.CLOSED) return;
        // Rejected before the stream started. Reading the count tells a 401
        // (which leaves for the login page) from an outage.
        current.close();
        void refreshCount();
        retry = setTimeout(connect, RECONNECT_MS);
      };
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCount();
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const noteRead = useCallback(
    () =>
      setUnread((count) => (count === null ? null : Math.max(0, count - 1))),
    [],
  );
  const noteAllRead = useCallback(() => setUnread(0), []);
  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{ unread, noteRead, noteAllRead, subscribe }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) {
    throw new Error(
      'useNotifications must be used inside NotificationProvider',
    );
  }
  return value;
}

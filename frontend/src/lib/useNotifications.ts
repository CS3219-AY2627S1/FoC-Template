import { useCallback, useEffect, useRef, useState } from "react";
import { type Notification, notificationsApi } from "./api";
import { useAuth } from "./auth";

const POLL_INTERVAL = 15000;

export interface UseNotifications {
  items: Notification[];
  unreadCount: number;
  total: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markOneRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export function useNotifications(limit = 10): UseNotifications {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(async () => {
    const id = userIdRef.current;
    if (!id) return;
    setLoading(true);
    try {
      const list = await notificationsApi.list(id, { limit });
      setItems(list.items);
      setUnreadCount(list.unread_count);
      setTotal(list.total);
    } catch {
      // Fail silently so a down notification-service never throws into the UI.
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const markOneRead = useCallback(
    async (notificationId: string) => {
      const id = userIdRef.current;
      if (!id) return;
      try {
        await notificationsApi.markRead(id, notificationId);
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("notifications-changed"));
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    const id = userIdRef.current;
    if (!id) return;
    try {
      await notificationsApi.markAllRead(id);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event("notifications-changed"));
  }, []);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setUnreadCount(0);
      setTotal(0);
      return;
    }
    void refresh();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL);

    window.addEventListener("focus", refresh);
    window.addEventListener("credits-changed", refresh);
    window.addEventListener("notifications-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("credits-changed", refresh);
      window.removeEventListener("notifications-changed", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, refresh]);

  return { items, unreadCount, total, loading, refresh, markOneRead, markAllRead };
}
